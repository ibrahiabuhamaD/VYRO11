"use strict";

const { isDeepStrictEqual } = require("node:util");
const { pool } = require("./db");

const PROFILE_FIELDS = ["name", "age", "gender", "bio", "avatarKey", "coverKey", "following", "favorites"];
const PROJECT_METRICS = ["likes", "likedBy", "views", "viewedBy"];

function clone(value) {
  return structuredClone(value);
}

function publicMember(row, includePrivate = false) {
  const profile = row.profile || {};
  const member = {
    id: row.id,
    email: row.email,
    name: profile.name || "مبدع",
    age: Number(profile.age) || 0,
    gender: profile.gender || "prefer-not",
    bio: profile.bio || "",
    avatarKey: profile.avatarKey || "",
    coverKey: profile.coverKey || "",
    following: Array.isArray(profile.following) ? profile.following : [],
    verified: row.verified,
    blocked: row.blocked,
    createdAt: profile.createdAt || new Date(row.created_at).getTime()
  };
  if (includePrivate) member.favorites = Array.isArray(profile.favorites) ? profile.favorites : [];
  return member;
}

async function listMembers(client = pool, includePrivate = false) {
  const result = await client.query("SELECT id, email, profile, blocked, verified, created_at FROM members ORDER BY created_at ASC");
  return result.rows.map(row => publicMember(row, includePrivate));
}

async function readState(client = pool, forUpdate = false) {
  const result = await client.query(
    `SELECT payload, initialized FROM folva_state WHERE id = 1${forUpdate ? " FOR UPDATE" : ""}`
  );
  return result.rows[0] || { payload: {}, initialized: false };
}

async function getStateForActor(actor) {
  const row = await readState();
  const state = clone(row.payload || {});
  const members = await listMembers(pool, actor?.role === "admin");
  state.users = members;
  if (actor?.role !== "admin") {
    const visibleProjects = (state.projects || []).filter(project => project.published || (actor?.role === "member" && project.authorEmail === actor.email));
    const visibleIds = new Set(visibleProjects.map(project => project.id));
    state.projects = visibleProjects;
    state.comments = Object.fromEntries(Object.entries(state.comments || {}).filter(([projectId]) => visibleIds.has(projectId)));
  }
  if (actor?.role === "admin") {
    state.favorites = members.flatMap(member => member.favorites || []);
  } else if (actor?.role === "member") {
    const member = members.find(item => item.id === actor.id);
    state.favorites = member?.favorites || [];
    state.chats = Object.fromEntries(Object.entries(state.chats || {}).filter(([key]) => chatIncludes(key, actor.email)));
    state.notifications = { [actor.email]: (state.notifications?.[actor.email] || []) };
    state.siteMessages = (state.siteMessages || []).filter(message => (message.recipients || []).includes(actor.email));
  } else {
    state.favorites = [];
    state.chats = {};
    state.notifications = {};
    state.siteMessages = [];
    state.users = [];
  }
  return { state, initialized: row.initialized };
}

function chatIncludes(key, email) {
  const participants = String(key).split(":").slice(1).join(":").split("|");
  return participants.includes(email);
}

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
}

function stripAccountFields(state) {
  const next = clone(state);
  delete next.users;
  delete next.favorites;
  return next;
}

function validateStateShape(state) {
  requireObject(state, "state");
  if (!Array.isArray(state.projects) || !Array.isArray(state.categories) || !Array.isArray(state.users)) {
    throw new Error("Invalid state payload");
  }
  if (JSON.stringify(state).length > 8_000_000) throw new Error("State payload is too large");
}

async function saveAdminState(state, client) {
  validateStateShape(state);
  const currentUsers = await client.query("SELECT id, email FROM members");
  const submitted = new Map(state.users.map(user => [String(user.email || "").toLowerCase(), user]));

  for (const row of currentUsers.rows) {
    const user = submitted.get(row.email);
    if (!user) {
      await client.query("DELETE FROM members WHERE id = $1", [row.id]);
      continue;
    }
    const profile = {};
    for (const field of PROFILE_FIELDS) {
      if (field !== "favorites" && user[field] !== undefined) profile[field] = user[field];
    }
    profile.favorites = Array.isArray(user.favorites) ? user.favorites : [];
    await client.query(
      "UPDATE members SET profile = $2::jsonb, blocked = $3, verified = $4, updated_at = NOW() WHERE id = $1",
      [row.id, JSON.stringify(profile), Boolean(user.blocked), Boolean(user.verified)]
    );
  }

  const payload = stripAccountFields(state);
  await client.query(
    "UPDATE folva_state SET payload = $1::jsonb, initialized = TRUE, updated_at = NOW() WHERE id = 1",
    [JSON.stringify(payload)]
  );
}

function memberProfileFromState(user) {
  const profile = {};
  for (const field of PROFILE_FIELDS) {
    if (user[field] !== undefined) profile[field] = user[field];
  }
  return profile;
}

function mergeMemberProjects(currentProjects, proposedProjects, email) {
  if (!Array.isArray(proposedProjects)) throw new Error("Invalid projects");
  const current = new Map(currentProjects.map(project => [project.id, project]));
  const proposed = new Map(proposedProjects.map(project => [project.id, project]));
  const merged = new Map(current);

  for (const [id, oldProject] of current) {
    const nextProject = proposed.get(id);
    const owned = oldProject.authorEmail === email;
    if (!nextProject) {
      if (owned) merged.delete(id);
      continue;
    }
    if (owned) {
      if (nextProject.authorEmail !== email || nextProject.id !== oldProject.id) throw new Error("Invalid project ownership");
      merged.set(id, nextProject);
      continue;
    }

    const oldRest = { ...oldProject };
    const nextRest = { ...nextProject };
    PROJECT_METRICS.forEach(field => { delete oldRest[field]; delete nextRest[field]; });
    if (!isDeepStrictEqual(oldRest, nextRest)) throw new Error("Cannot edit another member's project");

    const oldLikes = Array.isArray(oldProject.likedBy) ? oldProject.likedBy : [];
    const newLikes = Array.isArray(nextProject.likedBy) ? nextProject.likedBy : [];
    if (oldLikes.filter(value => value !== email).sort().join("\n") !== newLikes.filter(value => value !== email).sort().join("\n")) {
      throw new Error("Cannot modify another member's likes");
    }
    const likedBefore = oldLikes.includes(email);
    const likedAfter = newLikes.includes(email);
    const expectedLikes = Math.max(0, (Number(oldProject.likes) || 0) + Number(likedAfter) - Number(likedBefore));
    if ((Number(nextProject.likes) || 0) !== expectedLikes) throw new Error("Invalid like count");

    const oldViews = Array.isArray(oldProject.viewedBy) ? oldProject.viewedBy : [];
    const newViews = Array.isArray(nextProject.viewedBy) ? nextProject.viewedBy : [];
    if (oldViews.some(viewer => !newViews.includes(viewer))) throw new Error("Cannot remove project views");
    if ((Number(nextProject.views) || 0) < (Number(oldProject.views) || 0)) throw new Error("Invalid view count");
    merged.set(id, nextProject);
  }

  for (const [id, project] of proposed) {
    if (!current.has(id)) {
      if (project.authorEmail !== email) throw new Error("Members can only create their own projects");
      merged.set(id, project);
    }
  }

  return [...merged.values()];
}

function mergeMemberComments(currentComments, proposedComments, email) {
  requireObject(proposedComments, "comments");
  const merged = clone(currentComments || {});
  for (const [projectId, comments] of Object.entries(proposedComments)) {
    if (!Array.isArray(comments)) throw new Error("Invalid comments");
    const previous = merged[projectId] || [];
    const nextById = new Map(comments.map(comment => [comment.id, comment]));
    for (const oldComment of previous) {
      const nextComment = nextById.get(oldComment.id);
      if (!nextComment) {
        if (oldComment.email !== email) throw new Error("Cannot remove another member's comment");
      } else if (!isDeepStrictEqual(oldComment, nextComment)) {
        throw new Error("Comments cannot be edited");
      }
    }
    for (const comment of comments) {
      if (!previous.some(old => old.id === comment.id) && (comment.email !== email || typeof comment.text !== "string" || comment.text.length > 600)) {
        throw new Error("Invalid comment author or content");
      }
    }
    merged[projectId] = comments;
  }
  for (const [projectId, comments] of Object.entries(merged)) {
    if (!(projectId in proposedComments) && comments.some(comment => comment.email !== email)) continue;
    if (!(projectId in proposedComments)) merged[projectId] = comments.filter(comment => comment.email !== email);
  }
  return merged;
}

function mergeMemberChats(currentChats, proposedChats, email) {
  requireObject(proposedChats, "chats");
  const merged = clone(currentChats || {});
  for (const [key, messages] of Object.entries(proposedChats)) {
    if (!chatIncludes(key, email) || !Array.isArray(messages)) throw new Error("Cannot access another member's conversation");
    const previous = merged[key] || [];
    if (messages.length < previous.length || !isDeepStrictEqual(messages.slice(0, previous.length), previous)) {
      throw new Error("Messages cannot be changed or removed");
    }
    if (messages.slice(previous.length).some(message => message.email !== email || typeof message.text !== "string" || message.text.length > 1000)) {
      throw new Error("Invalid message author or content");
    }
    merged[key] = messages;
  }
  return merged;
}

async function saveMemberState(state, actor, client) {
  validateStateShape(state);
  const userResult = await client.query("SELECT id, email, profile, blocked, verified, created_at FROM members WHERE id = $1 FOR UPDATE", [actor.id]);
  const user = userResult.rows[0];
  if (!user || user.blocked) throw new Error("Account is unavailable");
  const row = await readState(client, true);
  const current = row.payload || {};
  const protectedKeys = ["settings", "categories"];
  for (const key of protectedKeys) {
    if (!isDeepStrictEqual(state[key] ?? (key === "settings" ? {} : []), current[key] ?? (key === "settings" ? {} : []))) {
      throw new Error("Administrator permission required");
    }
  }

  const users = await listMembers(client, false);
  const proposedUsers = new Map(state.users.map(item => [item.email, item]));
  if (proposedUsers.size !== users.length) throw new Error("Member list is read-only");
  for (const existing of users) {
    const proposed = proposedUsers.get(existing.email);
    if (!proposed || proposed.id !== existing.id) throw new Error("Member list is read-only");
    if (existing.id !== actor.id && !isDeepStrictEqual(existing, proposed)) throw new Error("Cannot modify another member's account");
  }

  const ownUser = proposedUsers.get(actor.email);
  const currentProfile = user.profile || {};
  const nextProfile = { ...currentProfile };
  for (const field of PROFILE_FIELDS) {
    if (field === "favorites") continue;
    if (ownUser[field] !== undefined) nextProfile[field] = ownUser[field];
  }
  nextProfile.favorites = Array.isArray(state.favorites) ? state.favorites : [];
  if (!Array.isArray(nextProfile.following) || nextProfile.following.includes(actor.email)) throw new Error("Invalid follow list");
  await client.query("UPDATE members SET profile = $2::jsonb, updated_at = NOW() WHERE id = $1", [actor.id, JSON.stringify(nextProfile)]);

  const next = clone(current);
  next.projects = mergeMemberProjects(current.projects || [], state.projects, actor.email);
  next.comments = mergeMemberComments(current.comments || {}, state.comments || {}, actor.email);
  next.chats = mergeMemberChats(current.chats || {}, state.chats || {}, actor.email);

  const oldNotifications = current.notifications?.[actor.email] || [];
  const newNotifications = state.notifications?.[actor.email] || [];
  const oldById = new Map(oldNotifications.map(item => [item.id, item]));
  if (newNotifications.some(item => !oldById.has(item.id) || !isDeepStrictEqual({ ...item, read: oldById.get(item.id).read }, oldById.get(item.id)))) {
    throw new Error("Notifications can only be marked as read");
  }
  next.notifications ||= {};
  next.notifications[actor.email] = newNotifications;

  const visitors = Array.isArray(state.visitors) ? state.visitors : current.visitors || [];
  if ((current.visitors || []).some(id => !visitors.includes(id))) throw new Error("Cannot remove visitor records");
  next.visitors = visitors;

  await client.query("UPDATE folva_state SET payload = $1::jsonb, updated_at = NOW() WHERE id = 1", [JSON.stringify(next)]);
}

async function saveStateAsActor(state, actor) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (actor.role === "admin") await saveAdminState(state, client);
    else await saveMemberState(state, actor, client);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function migrateLocalState(state, client = pool) {
  validateStateShape(state);
  const row = await readState(client, true);
  if (row.initialized) return false;

  for (const item of state.users) {
    const email = String(item.email || "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
    const oldHash = String(item.passwordHash || "");
    const passwordHash = /^[a-f\d]{64}$/i.test(oldHash) ? `legacy:${oldHash.toLowerCase()}` : null;
    const profile = {};
    for (const field of PROFILE_FIELDS) if (item[field] !== undefined) profile[field] = item[field];
    profile.name ||= "مبدع";
    profile.following ||= [];
    await client.query(
      `INSERT INTO members (id, email, password_hash, profile, blocked, verified, created_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, to_timestamp($7 / 1000.0))
       ON CONFLICT (email) DO NOTHING`,
      [item.id || require("node:crypto").randomUUID(), email, passwordHash, JSON.stringify(profile), Boolean(item.blocked), Boolean(item.verified), Number(item.createdAt) || Date.now()]
    );
  }

  const payload = stripAccountFields(state);
  await client.query("UPDATE folva_state SET payload = $1::jsonb, initialized = TRUE, updated_at = NOW() WHERE id = 1", [JSON.stringify(payload)]);
  return true;
}

module.exports = {
  getStateForActor,
  listMembers,
  migrateLocalState,
  publicMember,
  readState,
  saveStateAsActor
};