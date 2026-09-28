const SOCIAL_SESSION = "folva-member-session-v1";
const MEDIA_DB = "folva-media-v1";
const MEDIA_STORE = "files";
const PRESENCE_PREFIX = "folva-presence-v1:";
const PRESENCE_TTL = 45000;
const PRESENCE_INTERVAL = 12000;
const presenceTabId = crypto.randomUUID();
const SOCIAL_ICONS = {
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.4 8.7c0 5.3-8.4 9.8-8.4 9.8S3.6 14 3.6 8.7A4.6 4.6 0 0 1 12 6.4a4.6 4.6 0 0 1 8.4 2.3Z"/></svg>',
  comment: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.4a7.4 7.4 0 0 1-7.7 7.2 8.2 8.2 0 0 1-3.1-.6L4 20l1.2-4.3a7 7 0 0 1-1-3.6A7.4 7.4 0 0 1 12 4.9a7.4 7.4 0 0 1 8 6.5Z"/></svg>',
  eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.8 12s3.2-6 9.2-6 9.2 6 9.2 6-3.2 6-9.2 6-9.2-6-9.2-6Z"/><circle cx="12" cy="12" r="2.6"/></svg>'
};
const mediaUrls = new Map();
let member = null;
let activeChat = null;
let viewedProfileEmail = null;
const isThemePreview = new URLSearchParams(location.search).has("themePreview");
let backendReady = false;
const legacyLocalState = structuredClone(state);
let visitorId = localStorage.getItem("folva-viewer-id");
if (!visitorId && !isThemePreview) {
  visitorId = crypto.randomUUID();
  localStorage.setItem("folva-viewer-id", visitorId);
}
visitorId ||= "theme-preview";

state.users ||= [];
state.visitors ||= [];
state.notifications ||= {};
state.siteMessages ||= [];
state.users.forEach(user => { user.following ||= []; user.blocked ||= false; user.verified ||= false; });
state.comments ||= {};
state.chats ||= {};
state.likesBy ||= {};
state.projects.forEach(project => {
  project.views ||= 0;
  project.viewedBy ||= [];
  project.likedBy ||= [];
});
const previousMemberSession = sessionStorage.getItem(SOCIAL_SESSION);
void previousMemberSession;
sessionStorage.removeItem(SOCIAL_SESSION);
sessionStorage.removeItem(SESSION);
localStorage.removeItem(SOCIAL_SESSION);
localStorage.removeItem(SESSION);
state.users = (state.users || []).map(({ passwordHash, ...user }) => user);
localStorage.setItem(KEY, JSON.stringify({ ...state, users: state.users, chats: {}, notifications: {}, siteMessages: [] }));
window.__folvaAdminAuthenticated = false;
renderNotificationBell();
const shouldRecordVisitor = !isThemePreview && !state.visitors.includes(visitorId);

const baseShowAdmin = window.showAdmin;
const baseShowPublic = window.showPublic;
const baseAdminRender = window.renderAdmin;

function enhanceAdminChatControls() {
  const rows = $("#adminChatsList");
  if (!rows) return;
  const count = Object.values(state.chats || {}).filter(messages => messages.length > 0).length;
  const badge = $("#messageNavCount");
  if (badge) badge.textContent = number(count);
  rows.querySelectorAll("[data-view-chat]").forEach(viewButton => {
    const actions = viewButton.closest(".row-actions");
    if (!actions || actions.querySelector("[data-delete-chat]")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "delete";
    button.dataset.deleteChat = viewButton.dataset.viewChat;
    button.textContent = "حذف";
    button.setAttribute("aria-label", "حذف المحادثة");
    actions.append(button);
  });
  const memberRows = $("#memberRows");
  memberRows?.querySelectorAll(".member-row").forEach(row => {
    const deleteButton = row.querySelector("[data-delete-member]");
    const actions = deleteButton?.closest(".admin-row-actions");
    if (!deleteButton || !actions || actions.querySelector("[data-member-action]")) return;
    const email = deleteButton.dataset.deleteMember;
    const user = memberFor(email);
    if (!user) return;
    const edit = document.createElement("button");
    edit.type = "button";
    edit.dataset.memberAction = "edit";
    edit.dataset.memberEmail = email;
    edit.textContent = "تعديل";
    edit.className = "member-control";
    const block = document.createElement("button");
    block.type = "button";
    block.dataset.memberAction = "block";
    block.dataset.memberEmail = email;
    block.textContent = user.blocked ? "إلغاء الحظر" : "حظر";
    block.className = "member-control";
    const verify = document.createElement("button");
    verify.type = "button";
    verify.dataset.memberAction = "verify";
    verify.dataset.memberEmail = email;
    verify.textContent = user.verified ? "إلغاء التوثيق" : "توثيق";
    verify.className = "member-control";
    actions.prepend(edit, verify, block);
    if (user.verified) row.querySelector(".admin-row-project strong")?.insertAdjacentHTML("beforeend", verifiedMark(user));
  });
}

if (typeof baseAdminRender === "function") {
  window.renderAdmin = function (...args) {
    const result = baseAdminRender.apply(this, args);
    enhanceAdminChatControls();
    return result;
  };
}

const memberRowsContainer = $("#memberRows");
if (memberRowsContainer) {
  new MutationObserver(enhanceAdminChatControls).observe(memberRowsContainer, { childList: true });
  enhanceAdminChatControls();
}

document.addEventListener("click", event => {
  const button = event.target.closest("[data-delete-chat]");
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (localStorage.getItem(SESSION) !== "yes") {
    toast("حذف المحادثات يتطلب صلاحية المدير");
    return;
  }
  const key = decodeURIComponent(button.dataset.deleteChat);
  const messages = state.chats?.[key] || [];
  if (!messages.length || !confirm(`حذف هذه المحادثة نهائيًا (${messages.length} رسالة)؟`)) return;
  delete state.chats[key];
  persistSocialState();
  toast("تم حذف المحادثة ورسائلها");
}, true);

function persistSocialState() {
  window.dispatchEvent(new Event("folva-change"));
  renderSocialFeed();
  renderAdmin();
  renderNotificationBell();
  if (!$("#profileView").hidden && viewedProfileEmail) showMemberProfile(viewedProfileEmail);
  if (!backendReady || (!member && localStorage.getItem(SESSION) !== "yes")) return Promise.resolve(false);
  return fetch("/api/state", {
    method: "PUT",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state)
  }).then(async response => {
    if (response.ok) return true;
    const result = await response.json().catch(() => ({}));
    toast(result.error || "تعذر حفظ البيانات على الخادم");
    return false;
  }).catch(error => {
    console.error("Could not save site state", error);
    toast("تعذر الاتصال بالخادم؛ لم تُحفظ التغييرات");
    return false;
  });
}

window.save = persistSocialState;
window.persistSocialState = persistSocialState;
function logoutFromServer() {
  return fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" })
    .catch(error => console.warn("Could not revoke server session", error))
    .finally(() => hydrateServerState());
}

async function migrateLegacyMedia(sourceState) {
  const mediaFields = new Set([
    "mediaKey", "avatarKey", "coverKey", "logoKey", "faviconKey", "verificationKey", "ownerAvatarKey", "ownerCoverKey"
  ]);
  const mediaKeys = new Set();
  function collect(value) {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (mediaFields.has(key) && typeof child === "string" && child) mediaKeys.add(child);
      else if (child && typeof child === "object") collect(child);
    }
  }
  collect(sourceState);

  const replacements = new Map();
  for (const oldKey of mediaKeys) {
    const blob = await localMediaBlob(oldKey);
    if (!blob) {
      replacements.set(oldKey, "");
      continue;
    }
    const form = new FormData();
    form.append("file", blob, `migrated-${oldKey}`);
    const response = await fetch("/api/media", { method: "POST", credentials: "same-origin", body: form });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "تعذر نقل صور الموقع القديمة");
    replacements.set(oldKey, result.id);
  }

  const migrated = structuredClone(sourceState);
  function replace(value) {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (mediaFields.has(key) && replacements.has(child)) value[key] = replacements.get(child);
      else if (child && typeof child === "object") replace(child);
    }
  }
  replace(migrated);
  return migrated;
}

async function hydrateServerState({ migrateLegacy = false } = {}) {
  if (isThemePreview) return null;
  try {
    const authResponse = await fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store" });
    if (!authResponse.ok) throw new Error("تعذر التحقق من جلسة الدخول");
    const auth = await authResponse.json();
    member = auth.authenticated && auth.role === "member" ? auth.user : null;
    window.__folvaAdminAuthenticated = auth.authenticated && auth.role === "admin";
    if (member) localStorage.setItem(SOCIAL_SESSION, member.email);
    else localStorage.removeItem(SOCIAL_SESSION);
    if (window.__folvaAdminAuthenticated) localStorage.setItem(SESSION, "yes");
    else localStorage.removeItem(SESSION);

    let response = await fetch("/api/state", { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) throw new Error("تعذر تحميل بيانات الموقع من قاعدة البيانات");
    let remote = await response.json();
    if (migrateLegacy && window.__folvaAdminAuthenticated && !remote.initialized) {
      const migratedLegacyState = await migrateLegacyMedia(legacyLocalState);
      const migration = await fetch("/api/admin/migrate-local", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: migratedLegacyState })
      });
      if (!migration.ok) {
        const failure = await migration.json().catch(() => ({}));
        throw new Error(failure.error || "تعذر ترحيل البيانات المحلية");
      }
      response = await fetch("/api/state", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error("تعذر تحميل البيانات بعد الترحيل");
      remote = await response.json();
      toast("تم نقل بيانات المتصفح إلى قاعدة البيانات؛ أعد تسجيل دخول الأعضاء لترقية كلمات مرورهم");
    }

    const data = remote.state || {};
    state = {
      ...data,
      settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) },
      projects: Array.isArray(data.projects) ? data.projects : [],
      users: Array.isArray(data.users) ? data.users.map(({ passwordHash, ...user }) => user) : [],
      favorites: Array.isArray(data.favorites) ? data.favorites : [],
      comments: data.comments || {},
      chats: data.chats || {},
      categories: Array.isArray(data.categories) ? data.categories : [],
      notifications: data.notifications || {},
      siteMessages: data.siteMessages || [],
      visitors: data.visitors || []
    };
    state.users.forEach(user => { user.following ||= []; user.blocked ||= false; user.verified ||= false; });
    state.projects.forEach(project => { project.views ||= 0; project.viewedBy ||= []; project.likedBy ||= []; });
    backendReady = true;
    localStorage.removeItem(KEY);
    updateAccountAction();
    renderNotificationBell();
    renderNotifications();
    renderInbox();
    renderOwnerProfileSettings();
    renderSocialFeed();
    renderAdmin();
    renderBrandAssets();
    renderSettings();
    renderCategories();
    updateMaintenanceView();
    window.dispatchEvent(new Event("folva-change"));
    if (window.__folvaAdminAuthenticated && migrateLegacy) window.showAdmin();
    return remote;
  } catch (error) {
    backendReady = false;
    console.error("FOLVA database bootstrap failed", error);
    if (migrateLegacy) toast(error.message || "تعذر الاتصال بقاعدة البيانات");
    return null;
  }
}

window.__folvaBootstrap = hydrateServerState();

function setAuthMode(mode) {
  const signup = mode === "signup";
  $("#loginForm").hidden = signup;
  $("#signupForm").hidden = !signup;
  $$("[data-auth-tab]").forEach(tab => tab.classList.toggle("active", tab.dataset.authTab === mode));
  $("#loginError").hidden = true;
  $("#signupError").hidden = true;
}

function updateAccountAction() {
  const button = $("#openAdmin");
  const admin = localStorage.getItem(SESSION) === "yes";
  button.classList.toggle("account-avatar-button", Boolean(member || admin));
  button.setAttribute("aria-label", member ? `الحساب: ${member.name}` : admin ? "لوحة الإدارة" : "تسجيل الدخول");
  button.title = member ? member.name : admin ? "لوحة الإدارة" : "تسجيل الدخول";
  button.innerHTML = member ? `<span class="header-avatar">${esc([...member.name][0] || "م")}</span>` : admin ? '<span class="header-avatar admin-avatar">م</span>' : "تسجيل الدخول <span>↗</span>";
  const memberEmail = member?.email;
  const avatarKey = member?.avatarKey;
  if (avatarKey) mediaObjectURL(avatarKey).then(url => {
    if (memberFor(memberEmail)?.avatarKey === avatarKey) button.innerHTML = `<img class="header-avatar" src="${esc(url)}" alt="">`;
  }).catch(() => {});
  $("#profileShortcut").hidden = true;
}

function memberFor(email) {
  return state.users.find(user => user.email === email) || (email === ADMIN_EMAIL ? ownerProfile() : null);
}

function ownerProfile() {
  return {
    id: "folva-owner-profile",
    email: ADMIN_EMAIL,
    name: state.settings.ownerName || "صاحب الموقع",
    bio: state.settings.ownerBio || "",
    age: 0,
    gender: "prefer-not",
    avatarKey: state.settings.ownerAvatarKey || "",
    coverKey: state.settings.ownerCoverKey || "",
    verified: state.settings.ownerVerified === true,
    following: state.settings.ownerFollowing || [],
    ownerProfile: true
  };
}

function currentActor() {
  return member || (localStorage.getItem(SESSION) === "yes" ? ownerProfile() : null);
}

function persistActor(actor) {
  if (actor.ownerProfile) state.settings.ownerFollowing = actor.following || [];
  else state.users = state.users.map(user => user.email === actor.email ? actor : user);
}

function isUserOnline(email) {
  if (!navigator.onLine) return false;
  const prefix = `${PRESENCE_PREFIX}${encodeURIComponent(email)}:`;
  const now = Date.now();
  for (let index = localStorage.length - 1; index >= 0; index--) {
    const key = localStorage.key(index);
    if (!key?.startsWith(prefix)) continue;
    const lastSeen = Number(localStorage.getItem(key));
    if (now - lastSeen <= PRESENCE_TTL) return true;
    localStorage.removeItem(key);
  }
  return false;
}

function updateChatPresence() {
  const presence = $("#chatPresence");
  if (!presence) return;
  const online = Boolean(activeChat?.recipient && isUserOnline(activeChat.recipient));
  presence.dataset.online = String(online);
  presence.classList.toggle("is-online", online);
  presence.querySelector("span").textContent = online ? "متصل" : "غير متصل";
}

let ownPresenceKey = null;
function refreshPresence() {
  const actor = currentActor();
  const nextKey = actor && !document.hidden && navigator.onLine
    ? `${PRESENCE_PREFIX}${encodeURIComponent(actor.email)}:${presenceTabId}`
    : null;
  if (ownPresenceKey && ownPresenceKey !== nextKey) localStorage.removeItem(ownPresenceKey);
  ownPresenceKey = nextKey;
  if (ownPresenceKey) localStorage.setItem(ownPresenceKey, String(Date.now()));
  updateChatPresence();
}

function clearPresence() {
  if (ownPresenceKey) localStorage.removeItem(ownPresenceKey);
  ownPresenceKey = null;
  updateChatPresence();
}

refreshPresence();
setInterval(refreshPresence, PRESENCE_INTERVAL);
document.addEventListener("visibilitychange", refreshPresence);
window.addEventListener("online", refreshPresence);
window.addEventListener("offline", clearPresence);
window.addEventListener("pagehide", clearPresence);
window.addEventListener("pageshow", refreshPresence);
window.addEventListener("storage", event => {
  if (event.key?.startsWith(PRESENCE_PREFIX)) updateChatPresence();
});

function renderOwnerProfileSettings() {
  const form = $("#ownerProfileForm");
  if (!form) return;
  const owner = ownerProfile();
  form.elements.name.value = owner.name;
  form.elements.bio.value = owner.bio;
  form.elements.verified.checked = owner.verified;
  const image = $("#ownerAvatarImage");
  const fallback = $("#ownerAvatarFallback");
  fallback.textContent = [...owner.name][0] || "ص";
  if (!owner.avatarKey) {
    image.hidden = true;
    image.removeAttribute("src");
    fallback.hidden = false;
    return;
  }
  fallback.hidden = true;
  mediaObjectURL(owner.avatarKey).then(url => {
    if (state.settings.ownerAvatarKey === owner.avatarKey) {
      image.src = url;
      image.hidden = false;
    }
  }).catch(() => {});
}

function verifiedMark(user) {
  return user?.verified ? '<span class="verified-mark" title="حساب موثّق" aria-label="حساب موثّق">✓</span>' : "";
}

function notificationFor(email, notification) {
  if (!email) return;
  state.notifications[email] ||= [];
  state.notifications[email].unshift({ id: crypto.randomUUID(), createdAt: Date.now(), read: false, ...notification });
  state.notifications[email] = state.notifications[email].slice(0, 80);
  renderNotificationBell();
}

function renderNotificationBell() {
  const bell = $("#notificationBell");
  if (!bell) return;
  const unread = member ? (state.notifications[member.email] || []).filter(item => !item.read).length : 0;
  const count = $("#notificationCount");
  if (count) { count.textContent = number(unread); count.hidden = unread === 0; }
  bell.setAttribute("aria-label", unread ? `الإشعارات، ${unread} جديد` : "الإشعارات");
}

function renderNotifications() {
  const list = $("#notificationsList");
  if (!list) return;
  const items = member ? (state.notifications[member.email] || []) : [];
  list.innerHTML = items.length ? items.map(item => {
    const tag = item.chatKey ? "button" : "article";
    const chat = item.chatKey ? ` data-notification-chat="${esc(encodeURIComponent(item.chatKey))}"` : "";
    const icon = item.broadcastId ? "<i class=\"mark notification-mark\"><b></b><b></b><b></b></i>" : "<span class=\"notification-chat-icon\" aria-hidden=\"true\">✉</span>";
    const senderBadge = item.senderEmail ? verifiedMark(memberFor(item.senderEmail)) : item.sender === (state.settings.brand || "FOLVA") ? verifiedMark({ verified: true }) : "";
    return `<${tag} class="notification-item${item.read ? "" : " unread"}"${chat}>${icon}<span class="notification-copy"><strong>${esc(item.title || state.settings.brand || "FOLVA")}${senderBadge}</strong><p>${esc(item.text)}</p><time>${new Intl.DateTimeFormat("ar", { dateStyle: "medium", timeStyle: "short" }).format(item.createdAt)}</time></span></${tag}>`;
  }).join("") : `<p class="no-comments">لا توجد إشعارات جديدة.</p>`;
}

function openNotifications() {
  if (!member) {
    setAuthMode("login");
    $("#loginDialog").showModal();
    return;
  }
  renderNotifications();
  (state.notifications[member.email] || []).forEach(item => { item.read = true; });
  persistSocialState();
  renderNotifications();
  $("#notificationDialog").showModal();
}

function genderLabel(value) {
  return value === "male" ? "ذكر" : value === "female" ? "أنثى" : "أفضل عدم الإجابة";
}

function currentViewerId() {
  const actor = currentActor();
  return actor ? `member:${actor.id || actor.email}` : `visitor:${visitorId}`;
}

function isFollowing(email) {
  return Boolean(currentActor()?.following?.includes(email));
}

function updateFollowButtons() {
  $$('[data-follow-user]').forEach(button => {
    const email = button.dataset.followUser;
    const following = isFollowing(email);
    button.classList.toggle("is-following", following);
    button.innerHTML = following ? 'تتابعه <span>✓</span>' : 'متابعة <span>＋</span>';
  });
}

function showMemberProfile(email = member?.email) {
  const profile = memberFor(email);
  if (!profile) return;
  viewedProfileEmail = profile.email;
  const ownerViewing = profile.ownerProfile && localStorage.getItem(SESSION) === "yes";
  const own = member?.email === profile.email || ownerViewing;
  $("#publicView").hidden = true;
  $("#adminView").hidden = true;
  $("#profileView").hidden = false;
  const cover = $("#profileCoverImage");
  cover.style.backgroundImage = "none";
  if (profile.coverKey) mediaObjectURL(profile.coverKey).then(url => {
    if (viewedProfileEmail === profile.email && memberFor(profile.email)?.coverKey === profile.coverKey) {
      cover.style.backgroundImage = `url("${url}")`;
    }
  }).catch(() => {});
  $("#profileName").innerHTML = `${esc(profile.name)}${verifiedMark(profile)}`;
  $("#profileAvatar").textContent = [...profile.name][0] || "ف";
  if (profile.avatarKey) mediaObjectURL(profile.avatarKey).then(url => {
    if (memberFor(profile.email)?.avatarKey === profile.avatarKey) $("#profileAvatar").innerHTML = `<img src="${esc(url)}" alt="">`;
  }).catch(() => {});
  $("#profileMeta").textContent = profile.ownerProfile ? profile.bio || "صاحب موقع FOLVA" : `${profile.age} سنة · ${genderLabel(profile.gender)}`;
  $("#profileFollowers").textContent = number(state.users.filter(user => (user.following || []).includes(profile.email)).length);
  $("#profileFollowing").textContent = number((profile.following || []).length);
  const viewer = currentActor();
  const viewerFollows = Boolean(viewer && viewer.email !== profile.email && viewer.following?.includes(profile.email));
  const profileFollows = Boolean(viewer && viewer.email !== profile.email && profile.following?.includes(viewer.email));
  const relationship = viewerFollows && profileFollows ? "متابعة متبادلة" : viewerFollows ? "تتابعه" : profileFollows ? "يتابعك" : "";
  const relationshipBadge = $("#profileFollowState");
  relationshipBadge.textContent = relationship;
  relationshipBadge.dataset.relationship = viewerFollows && profileFollows ? "mutual" : viewerFollows ? "following" : profileFollows ? "follows-you" : "";
  relationshipBadge.hidden = !relationship;
  $("#followProfile").hidden = own;
  $("#followProfile").dataset.followUser = profile.email;
  $("#messageProfile").hidden = own;
  $("#messageProfile").dataset.messageProfile = profile.email;
  $("#ownerProfileAdmin").hidden = !ownerViewing;
  updateFollowButtons();
  $("#editProfile").hidden = !own || profile.ownerProfile;
  $("#openInbox").hidden = !own || profile.ownerProfile;
  $("#profileNewProject").hidden = !own || profile.ownerProfile;
  renderInbox();
  const projects = state.projects.filter(project => (project.authorEmail === profile.email || (profile.ownerProfile && project.creator === profile.name)) && project.published).sort((a, b) => b.createdAt - a.createdAt);
  $("#profileProjectCount").textContent = `${number(projects.length)} مشروع`;
  $("#profileGrid").innerHTML = projects.map((project, index) => socialCard(project, index)).join("");
  $("#profileGrid").hidden = projects.length === 0;
  $("#profileEmpty").hidden = projects.length > 0 || !own || profile.ownerProfile;
  hydrateMedia($("#profileGrid"));
  window.scrollTo({ top: 0, behavior: "instant" });
}

function openNetworkList(type) {
  const profile = memberFor(viewedProfileEmail);
  if (!profile) return;
  const followers = state.users.filter(user => (user.following || []).includes(profile.email));
  const users = type === "followers"
    ? followers
    : (profile.following || []).map(email => memberFor(email)).filter(Boolean);
  $("#networkTitle").textContent = type === "followers" ? "المتابعون" : "يتابع";
  $("#networkList").innerHTML = users.length ? users.map(user => {
    const avatar = user.avatarKey
      ? `<img data-media-key="${esc(user.avatarKey)}" alt="">`
      : `<span>${esc([...user.name][0] || "م")}</span>`;
    const projectCount = state.projects.filter(project => project.authorEmail === user.email && project.published).length;
    return `<button class="inbox-thread network-user" type="button" data-view-profile="${esc(user.email)}"><span class="thread-avatar">${avatar}</span><span class="thread-copy"><strong>${esc(user.name)}</strong><span>${number(projectCount)} مشروع منشور</span></span><span class="network-arrow">↗</span></button>`;
  }).join("") : `<p class="no-comments">لا توجد حسابات في هذه القائمة بعد.</p>`;
  hydrateMedia($("#networkList"));
  $("#networkDialog").showModal();
}

window.showAdmin = function () {
  viewedProfileEmail = null;
  $("#profileView").hidden = true;
  baseShowAdmin();
};

window.showPublic = function () {
  viewedProfileEmail = null;
  $("#profileView").hidden = true;
  baseShowPublic();
};

function openMemberProfile() {
  if (!member) {
    setAuthMode("login");
    $("#loginDialog").showModal();
    return;
  }
  showMemberProfile(member.email);
}

function mediaDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(MEDIA_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(MEDIA_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeMedia(file) {
  if (file.size > 40 * 1024 * 1024) throw new Error("حجم الملف يتجاوز الحد المسموح البالغ 40 ميغابايت.");
  if (backendReady && !isThemePreview) {
    const form = new FormData();
    form.append("file", file);
    const response = await fetch("/api/media", { method: "POST", credentials: "same-origin", body: form });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "تعذر حفظ الملف على الخادم");
    mediaUrls.set(result.id, URL.createObjectURL(file));
    return result.id;
  }

  const db = await mediaDatabase();
  const id = crypto.randomUUID();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(MEDIA_STORE, "readwrite");
    transaction.objectStore(MEDIA_STORE).put(file, id);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  mediaUrls.set(id, URL.createObjectURL(file));
  return id;
}

async function localMediaBlob(id) {
  const db = await mediaDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(MEDIA_STORE).objectStore(MEDIA_STORE).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function mediaObjectURL(id) {
  if (mediaUrls.has(id)) return mediaUrls.get(id);
  const blob = await localMediaBlob(id);
  if (!blob && backendReady) {
    const response = await fetch(`/api/media/${encodeURIComponent(id)}`, { credentials: "same-origin" });
    if (!response.ok) return FALLBACK;
    const remoteBlob = await response.blob();
    const url = URL.createObjectURL(remoteBlob);
    mediaUrls.set(id, url);
    return url;
  }
  if (!blob) return FALLBACK;
  const url = URL.createObjectURL(blob);
  mediaUrls.set(id, url);
  return url;
}

function mediaMarkup(project, className = "project-image") {
  const tag = project.mediaType?.startsWith("video/") ? "video" : "img";
  const attrs = tag === "video" ? "muted loop playsinline preload=metadata" : `alt="${esc(project.title)}" loading="lazy"`;
  const source = project.mediaKey ? "" : imageURL(project.image);
  return `<${tag} class="${className}" ${attrs} ${source ? `src="${esc(source)}"` : ""} ${project.mediaKey ? `data-media-key="${esc(project.mediaKey)}"` : ""}></${tag}>`;
}

async function hydrateMedia(root) {
  if (!root) return;
  const elements = [...root.querySelectorAll("[data-media-key]")];
  await Promise.all(elements.map(async element => {
    try {
      const url = await mediaObjectURL(element.dataset.mediaKey);
      if (!element.isConnected) return;
      element.src = url;
      if (element.tagName === "VIDEO") element.play().catch(() => {});
    } catch (error) {
      console.warn("Could not load local project media", error);
      element.src = FALLBACK;
    }
  }));
}

window.hydrateMedia = hydrateMedia;
window.renderSiteBackgrounds?.();

function renderBrandAssets() {
  const logoKey = state.settings.logoKey;
  $$(".brand").forEach(brand => {
    const mark = brand.querySelector(".mark");
    const wordmark = brand.querySelector(".brand-name");
    let image = brand.querySelector(".brand-logo-asset");
    if (logoKey) {
      if (!image) {
        image = document.createElement("img");
        image.className = "brand-logo-asset";
        brand.prepend(image);
      }
      image.alt = state.settings.brand || "شعار الموقع";
      if (mark) mark.hidden = true;
      if (wordmark) wordmark.hidden = true;
      mediaObjectURL(logoKey).then(url => {
        if (image.isConnected && state.settings.logoKey === logoKey) image.src = url;
      }).catch(() => {});
    } else {
      image?.remove();
      if (mark) mark.hidden = false;
      if (wordmark) wordmark.hidden = false;
    }
  });

  function updatePreview(key, imageId, fallbackId, removeId) {
    const image = $(imageId);
    const fallback = $(fallbackId);
    const removeButton = $(removeId);
    if (!state.settings[key]) {
      image.hidden = true;
      image.removeAttribute("src");
      fallback.hidden = false;
      removeButton.hidden = true;
      return;
    }
    const activeKey = state.settings[key];
    fallback.hidden = true;
    removeButton.hidden = false;
    mediaObjectURL(activeKey).then(url => {
      if (state.settings[key] === activeKey) {
        image.src = url;
        image.hidden = false;
      }
    }).catch(() => {});
  }

  updatePreview("logoKey", "#logoPreviewImage", "#logoFallback", "#removeLogo");
  updatePreview("faviconKey", "#faviconPreviewImage", "#faviconFallback", "#removeFavicon");
  const favicon = $("#siteFavicon");
  const faviconKey = state.settings.faviconKey;
  if (!faviconKey) {
    favicon.removeAttribute("href");
    favicon.removeAttribute("type");
  } else {
    favicon.type = state.settings.faviconType || "image/x-icon";
    mediaObjectURL(faviconKey).then(url => {
      if (state.settings.faviconKey === faviconKey) favicon.href = url;
    }).catch(() => {});
  }
  const verificationKey = state.settings.verificationKey;
  if (verificationKey) {
    mediaObjectURL(verificationKey).then(url => {
      if (state.settings.verificationKey === verificationKey) {
        document.documentElement.style.setProperty("--verified-badge-image", `url("${url}")`);
        document.documentElement.classList.add("has-verification-image");
        document.documentElement.classList.add("has-site-verification");
      }
    }).catch(() => {});
  } else {
    document.documentElement.style.removeProperty("--verified-badge-image");
    document.documentElement.classList.remove("has-verification-image");
    document.documentElement.classList.remove("has-site-verification");
  }
  updatePreview("verificationKey", "#verificationPreviewImage", "#verificationFallback", "#removeVerification");
}

window.renderBrandAssets = renderBrandAssets;
window.storeMedia = storeMedia;
window.mediaObjectURL = mediaObjectURL;

$("#adminLogoutTop")?.addEventListener("click", event => {
  event.preventDefault();
  event.stopImmediatePropagation();
  void logoutFromServer();
  localStorage.removeItem(SESSION);
  sessionStorage.removeItem(SESSION);
  localStorage.removeItem(SOCIAL_SESSION);
  member = null;
  refreshPresence();
  updateAccountAction();
  window.showPublic();
});

function followKey(project) {
  if (project.authorEmail) return project.authorEmail;
  const creator = String(project.creator || "").trim().toLocaleLowerCase("ar");
  return creator ? `creator:${creator}` : "";
}

function followButton(project, className = "media-follow-button") {
  const key = followKey(project);
  if (!key) return "";
  const actor = currentActor();
  const own = actor && (actor.email === project.authorEmail || (!project.authorEmail && actor.name?.trim() === project.creator?.trim()));
  if (own) return `<button class="${className} own-work" type="button" disabled>عملك</button>`;
  const following = isFollowing(key);
  return `<button class="${className}${following ? " is-following" : ""}" data-follow-user="${esc(key)}" type="button">${following ? "تتابعه <span>✓</span>" : "متابعة <span>＋</span>"}</button>`;
}

function socialCard(project, index) {
  const actor = currentActor();
  const liked = actor && project.likedBy.includes(actor.email);
  const comments = (state.comments[project.id] || []).length;
  const follow = followButton(project, "media-follow-button project-follow-button");
  return `<article class="project-card" style="animation-delay:${Math.min(index * 45, 270)}ms">
    <div class="project-image-wrap">${mediaMarkup(project)}<span class="card-tag">${esc(project.category)}</span>
      <button class="card-save${state.favorites.includes(project.id) ? " saved" : ""}" data-save="${esc(project.id)}" title="حفظ العمل" aria-label="حفظ العمل">${state.favorites.includes(project.id) ? "♥" : "⌑"}</button>
      <button class="project-open" data-open="${esc(project.id)}" aria-label="عرض ${esc(project.title)}"></button>
    </div>${follow ? `<div class="project-follow-row">${follow}</div>` : ""}<div class="project-info"><div><h3>${esc(project.title)}</h3><button class="creator creator-link" data-view-profile="${esc(project.authorEmail || "")}">بواسطة ${esc(project.creator)}${verifiedMark(memberFor(project.authorEmail))}</button></div></div>
    <div class="social-stats"><button class="social-like${liked ? " liked" : ""}" data-social-like="${esc(project.id)}" aria-label="إعجاب">${SOCIAL_ICONS.heart}<span>${number(project.likes)}</span></button><button data-show-comments="${esc(project.id)}" aria-label="التعليقات">${SOCIAL_ICONS.comment}<span>${number(comments)}</span></button><span class="metric-views">${SOCIAL_ICONS.eye}<span>${number(project.views)}</span><small>مشاهدة</small></span></div>
  </article>`;
}

function renderSocialFeed() {
  const items = matching();
  $("#projectGrid").innerHTML = items.map((project, index) => socialCard(project, index)).join("");
  hydrateMedia($("#projectGrid"));
  $$(".project-image").forEach(image => image.addEventListener("error", () => { image.src = FALLBACK; }, { once: true }));
  $("#projectGrid").hidden = items.length === 0;
  $("#empty").hidden = items.length > 0;
  $("#projectCount").textContent = number(state.projects.filter(project => project.published).length);
  $("#savedCount").textContent = number(state.favorites.length);
  $("#filterNote").hidden = !savedOnly && category === "الكل";
  $("#filterLabel").textContent = savedOnly ? "الأعمال المحفوظة" : `التصنيف: ${category}`;
  $("#savedFilter").classList.toggle("active", savedOnly);
  $("#allFilter").classList.toggle("active", !savedOnly);
}

window.renderFeed = renderSocialFeed;

function profileAvatar(profile, className) {
  const name = profile?.name || "م";
  const content = profile?.avatarKey
    ? `<img data-media-key="${esc(profile.avatarKey)}" alt="">`
    : `<span>${esc([...name][0] || "م")}</span>`;
  return `<span class="${className}" aria-hidden="true">${content}</span>`;
}

function renderComments(project) {
  const comments = state.comments[project.id] || [];
  return comments.length ? comments.map(comment => {
    const profile = memberFor(comment.email) || { name: comment.author };
    const time = new Intl.DateTimeFormat("ar", { dateStyle: "medium", timeStyle: "short" }).format(comment.createdAt);
    return `<article class="comment">${profileAvatar(profile, "comment-avatar")}<div class="comment-content"><header class="comment-meta"><b>${esc(comment.author)}${verifiedMark(profile)}</b><time>${time}</time></header><p>${esc(comment.text)}</p></div></article>`;
  }).join("") : `<p class="no-comments">كن أول من يشارك رأيه في هذا العمل.</p>`;
}

function authorBadge(project) {
  const profile = memberFor(project.authorEmail);
  const name = profile?.name || project.creator;
  const avatar = profile?.avatarKey
    ? `<img data-media-key="${esc(profile.avatarKey)}" alt="">`
    : `<span>${esc([...name][0] || "م")}</span>`;
  const badge = project.authorEmail
    ? `<button class="media-author-badge" data-view-profile="${esc(project.authorEmail)}" type="button"><span class="media-author-avatar">${avatar}</span><span class="media-author-copy"><small>ناشر العمل</small><strong>${esc(name)}</strong></span><i>↗</i></button>`
    : `<div class="media-author-badge"><span class="media-author-avatar">${avatar}</span><span class="media-author-copy"><small>ناشر العمل</small><strong>${esc(name)}${verifiedMark(profile)}</strong></span></div>`;
  if (project.authorEmail) return badge.replace(`</strong></span></button>`, `${verifiedMark(profile)}</strong></span></button>`);
  return badge;
}

let viewerScale = 1;

function setViewerZoom(scale) {
  const image = $("#projectDetail .detail-media");
  if (!image || image.tagName !== "IMG") return;
  viewerScale = Math.min(3, Math.max(1, scale));
  image.style.setProperty("--viewer-scale", viewerScale);
  const level = $("#projectDetail [data-viewer-zoom-level]");
  if (level) level.textContent = `${Math.round(viewerScale * 100)}%`;
  $("#projectDetail [data-viewer-zoom='-1']").disabled = viewerScale === 1;
  $("#projectDetail [data-viewer-zoom='1']").disabled = viewerScale === 3;
}

function openProjectDetail(id) {
  const project = state.projects.find(item => item.id === id);
  if (!project) return;
  $("#projectDialog").dataset.detailStyle = document.documentElement.dataset.themeDetail || "default";
  project.viewedBy ||= [];
  const viewer = currentViewerId();
  if (!project.viewedBy.includes(viewer)) {
    project.viewedBy.push(viewer);
    project.views = (Number(project.views) || 0) + 1;
    persistSocialState();
  }
  const actor = currentActor();
  const liked = actor && project.likedBy.includes(actor.email);
  const comments = state.comments[id] || [];
  const saved = state.favorites.includes(id);
  const isVideo = project.mediaType?.startsWith("video/");
  const publishedDate = project.createdAt && Number.isFinite(new Date(project.createdAt).getTime())
    ? new Intl.DateTimeFormat("ar", { dateStyle: "long" }).format(new Date(project.createdAt))
    : "";
  viewerScale = 1;
  $("#projectDetail").innerHTML = `<div class="detail-media-column"><div class="detail-image">${mediaMarkup(project, "detail-media")}</div><div class="viewer-image-toolbar"><button type="button" class="viewer-tool" data-detail-save="${esc(id)}" aria-label="${saved ? "إزالة من المحفوظات" : "حفظ العمل"}">${saved ? "♥" : "▣"}<span>${saved ? "محفوظ" : "حفظ"}</span></button><button type="button" class="viewer-tool" data-share-project="${esc(id)}" aria-label="مشاركة العمل">↗<span>مشاركة</span></button></div><div class="viewer-media-controls${isVideo ? " is-video" : ""}" role="group" aria-label="أدوات عرض الصورة"><button type="button" data-viewer-zoom="-1" aria-label="تصغير" title="تصغير">−</button><output data-viewer-zoom-level aria-live="polite">100%</output><button type="button" data-viewer-zoom="1" aria-label="تكبير" title="تكبير">+</button><button type="button" data-viewer-reset title="ملاءمة الصورة" aria-label="ملاءمة الصورة">⤢</button><button type="button" data-viewer-fullscreen title="ملء الشاشة" aria-label="ملء الشاشة">⛶</button></div><button type="button" class="viewer-close" data-close aria-label="إغلاق الصورة">×</button><div class="detail-author-actions">${authorBadge(project)}${followButton(project, "media-follow-button detail-follow-button")}</div><aside class="viewer-side-rail" aria-label="التفاعل مع العمل"><button type="button" class="viewer-rail-action social-like${liked ? " liked" : ""}" data-social-like="${esc(id)}" aria-label="إعجاب">${SOCIAL_ICONS.heart}<small>${number(project.likes)}</small><span>إعجاب</span></button><button type="button" class="viewer-rail-action" data-view-comments aria-label="الانتقال إلى التعليقات">${SOCIAL_ICONS.comment}<small>${number(comments.length)}</small><span>تعليق</span></button><button type="button" class="viewer-rail-action message-publisher" data-open-chat="${esc(id)}" aria-label="مراسلة الناشر"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg><span>مراسلة</span></button><span class="viewer-rail-stat">${SOCIAL_ICONS.eye}<small>${number(project.views)}</small><span>مشاهدة</span></span></aside></div>
    <div class="detail-copy"><div class="viewer-project-heading"><span class="detail-tag">${esc(project.category)}</span>${publishedDate ? `<p class="viewer-published-date">نُشر في ${esc(publishedDate)}</p>` : ""}<h2>${esc(project.title)}</h2><p class="detail-desc">${esc(project.description || "مشروع إبداعي من مجتمع FOLVA.")}</p></div>
      <section class="comments-panel" id="viewerComments"><h3>المحادثة حول العمل <span>${number(comments.length)}</span></h3><div class="comments-list">${renderComments(project)}</div><form class="comment-form" data-comment-form="${esc(id)}"><input name="text" maxlength="600" required placeholder="اكتب تعليقًا بنّاءً..."><button aria-label="إرسال التعليق">↗</button></form></section>
    </div>`;
  hydrateMedia($("#projectDetail"));
  setViewerZoom(1);
  if (!$("#projectDialog").open) $("#projectDialog").showModal();
}

function openProjectFromHash() {
  const match = location.hash.match(/^#project=(.+)$/);
  if (!match) return;
  const id = decodeURIComponent(match[1]);
  if (state.projects.some(project => project.id === id)) openProjectDetail(id);
}

window.addEventListener("hashchange", openProjectFromHash);

window.detail = openProjectDetail;

function likeProject(id) {
  const actor = currentActor();
  if (!actor) {
    setAuthMode("login");
    $("#loginDialog").showModal();
    toast("سجّل الدخول للتفاعل مع الأعمال");
    return;
  }
  const project = state.projects.find(item => item.id === id);
  if (!project) return;
  project.likedBy ||= [];
  const index = project.likedBy.indexOf(actor.email);
  if (index >= 0) {
    project.likedBy.splice(index, 1);
    project.likes = Math.max(0, (Number(project.likes) || 0) - 1);
  } else {
    project.likedBy.push(actor.email);
    project.likes = (Number(project.likes) || 0) + 1;
    if (actor.ownerProfile && project.authorEmail && project.authorEmail !== actor.email) {
      notificationFor(project.authorEmail, { title: actor.name, text: `أعجب صاحب الموقع بعملك «${project.title}»`, sender: actor.name, senderEmail: actor.email });
    }
  }
  persistSocialState();
  if ($("#projectDialog").open) openProjectDetail(id);
}

function toggleFollow(email) {
  const actor = currentActor();
  if (!actor) {
    setAuthMode("login");
    $("#loginDialog").showModal();
    toast("سجّل الدخول لمتابعة المبدعين");
    return;
  }
  if (actor.email === email) {
    toast("لا يمكنك متابعة حسابك");
    return;
  }
  const legacyCreator = email.startsWith("creator:");
  if (!legacyCreator && !memberFor(email)) return;
  actor.following ||= [];
  const alreadyFollowing = actor.following.includes(email);
  actor.following = alreadyFollowing
    ? actor.following.filter(followedEmail => followedEmail !== email)
    : [...actor.following, email];
  persistActor(actor);
  if (actor.ownerProfile && !alreadyFollowing && !legacyCreator) {
    const recipient = memberFor(email);
    if (recipient && !recipient.ownerProfile) {
      notificationFor(email, { title: actor.name, text: "بدأ صاحب الموقع بمتابعتك.", sender: actor.name, senderEmail: actor.email });
    }
  }
  persistSocialState();
  updateFollowButtons();
}

function openChat(projectId) {
  const actor = currentActor();
  if (!actor) {
    setAuthMode("login");
    $("#loginDialog").showModal();
    return;
  }
  const project = state.projects.find(item => item.id === projectId);
  if (!project?.authorEmail) {
    toast("لم يفعّل ناشر هذا العمل الرسائل بعد");
    return;
  }
  if (project.authorEmail === actor.email) {
    toast("هذا العمل منشور من حسابك");
    return;
  }
  const participants = [actor.email, project.authorEmail].sort();
  const key = `${projectId}:${participants.join("|")}`;
  activeChat = { key, projectId, recipient: project.authorEmail, projectTitle: project.title };
  setChatPeer(project.authorEmail, `حول ${project.title}`);
  renderChatMessages();
  $("#chatDialog").showModal();
}

function openDirectChat(email) {
  const actor = currentActor();
  if (!actor) {
    setAuthMode("login");
    $("#loginDialog").showModal();
    return;
  }
  const recipient = memberFor(email);
  if (!recipient || recipient.email === actor.email) return;
  const participants = [actor.email, recipient.email].sort();
  const key = `profile:${participants.join("|")}`;
  activeChat = { key, projectId: "profile", recipient: recipient.email, projectTitle: recipient.ownerProfile ? "صاحب الموقع" : "محادثة مباشرة" };
  setChatPeer(recipient.email, recipient.ownerProfile ? "صاحب الموقع" : "محادثة مباشرة");
  renderChatMessages();
  $("#chatDialog").showModal();
}

function openAdminChat(encodedKey) {
  if (localStorage.getItem(SESSION) !== "yes") return;
  const key = decodeURIComponent(encodedKey);
  const [projectId, participantList] = key.split(":");
  const participants = (participantList || "").split("|");
  if (projectId !== "profile" || !participants.includes(ADMIN_EMAIL)) return;
  const recipient = participants.find(email => email !== ADMIN_EMAIL);
  if (!recipient) return;
  activeChat = { key, projectId, recipient, projectTitle: "صاحب الموقع" };
  setChatPeer(recipient, "رسالة واردة لصاحب الموقع");
  renderChatMessages();
  $("#chatDialog").showModal();
}

function setChatPeer(email, subtitle) {
  const profile = memberFor(email) || { email, name: email };
  refreshPresence();
  const avatar = $("#chatPeerAvatar");
  $("#chatTitle").textContent = profile.name;
  $("#chatSubtitle").textContent = subtitle || "محادثة مباشرة";
  avatar.textContent = [...profile.name][0] || "م";
  avatar.classList.toggle("verified", Boolean(profile.verified));
  if (profile.avatarKey) mediaObjectURL(profile.avatarKey).then(url => {
    if (activeChat?.recipient === email) avatar.innerHTML = `<img src="${esc(url)}" alt="">`;
  }).catch(() => {});
}

function renderChatMessages() {
  const viewer = member || (localStorage.getItem(SESSION) === "yes" ? ownerProfile() : null);
  const messages = activeChat ? state.chats[activeChat.key] || [] : [];
  $("#chatMessages").innerHTML = messages.length ? messages.map((message, index) => {
    const previous = messages[index - 1];
    const day = new Date(message.createdAt).toLocaleDateString("ar", { dateStyle: "medium" });
    const previousDay = previous ? new Date(previous.createdAt).toLocaleDateString("ar", { dateStyle: "medium" }) : "";
    const divider = day !== previousDay ? `<div class="chat-day-divider"><span>${day}</span></div>` : "";
    const time = new Intl.DateTimeFormat("ar", { hour: "numeric", minute: "2-digit" }).format(message.createdAt);
    const profile = memberFor(message.email) || { name: message.author };
    return `${divider}<article class="chat-message${message.email === viewer?.email ? " mine" : ""}"><div class="chat-bubble"><header class="chat-sender">${profileAvatar(profile, "chat-message-avatar")}<b>${esc(message.author || profile.name)}${verifiedMark(profile)}</b></header><p>${esc(message.text)}</p><time>${time}</time></div></article>`;
  }).join("") : `<div class="chat-empty-state"><span>✉</span><strong>ابدأ المحادثة</strong><p>اكتب رسالة لبدء تواصل مباشر وآمن.</p></div>`;
  hydrateMedia($("#chatMessages"));
  $("#chatMessages").scrollTop = $("#chatMessages").scrollHeight;
}

function renderInbox() {
  if (!$("#inboxThreads")) return;
  const actor = currentActor();
  if (!actor) {
    $("#inboxThreads").innerHTML = "";
    $("#inboxCount").textContent = "0";
    return;
  }
  const threads = Object.entries(state.chats || {})
    .filter(([, messages]) => messages.length > 0)
    .map(([key, messages]) => ({ kind: "chat", key, messages, createdAt: messages.at(-1).createdAt }));
  const broadcasts = (state.siteMessages || [])
    .filter(message => (message.recipients || []).includes(member.email))
    .map(message => ({ kind: "broadcast", message, createdAt: message.createdAt }));
  const items = [...threads, ...broadcasts].sort((a, b) => b.createdAt - a.createdAt);
  $("#inboxCount").textContent = number(items.length);
  $("#inboxThreads").innerHTML = items.length ? items.map(item => {
    if (item.kind === "broadcast") {
      const message = item.message;
      return `<button class="inbox-thread inbox-broadcast" data-broadcast-id="${esc(message.id)}"><span class="broadcast-avatar" aria-hidden="true"><i class="mark"><b></b><b></b><b></b></i></span><span class="thread-copy"><strong>${esc(message.sender || state.settings.brand || "FOLVA")}<small>· رسالة من إدارة الموقع</small></strong><span>${esc(message.text)}</span></span><time>${new Intl.DateTimeFormat("ar", { hour: "numeric", minute: "2-digit" }).format(message.createdAt)}</time></button>`;
    }
    const { key, messages } = item;
    const [projectId, participantList] = key.split(":");
    const otherEmail = participantList.split("|").find(email => email !== member.email);
    const other = memberFor(otherEmail)?.name || otherEmail;
    const project = state.projects.find(item => item.id === projectId);
    const subject = projectId === "profile" ? (otherEmail === ADMIN_EMAIL ? "صاحب الموقع" : "محادثة مباشرة") : project?.title || "عمل محذوف";
    const latest = messages.at(-1);
    return `<button class="inbox-thread" data-inbox-key="${encodeURIComponent(key)}"><span class="thread-avatar">${esc([...other][0] || "م")}</span><span class="thread-copy"><strong>${esc(other)} <small>· ${esc(subject)}</small></strong><span>${esc(latest.text)}</span></span><time>${new Intl.DateTimeFormat("ar", { hour: "numeric", minute: "2-digit" }).format(latest.createdAt)}</time></button>`;
  }).join("") : `<p class="no-comments">لا توجد محادثات بعد. يمكنك مراسلة ناشر أي عمل من تفاصيله.</p>`;
}

function openBroadcast(encodedId) {
  if (!member) return;
  const id = decodeURIComponent(encodedId);
  const message = (state.siteMessages || []).find(item => item.id === id && (item.recipients || []).includes(member.email));
  if (!message) return;
  (state.notifications[member.email] || []).filter(item => item.broadcastId === id).forEach(item => { item.read = true; });
  $("#broadcastTitle").textContent = message.sender || state.settings.brand || "FOLVA";
  $("#broadcastText").textContent = message.text;
  $("#broadcastTime").textContent = new Intl.DateTimeFormat("ar", { dateStyle: "medium", timeStyle: "short" }).format(message.createdAt);
  persistSocialState();
  $("#siteBroadcastDialog").showModal();
}

function openInboxThread(encodedKey) {
  if (!member) return;
  const key = decodeURIComponent(encodedKey);
  const [projectId, participantList] = key.split(":");
  const participants = participantList.split("|");
  const project = state.projects.find(item => item.id === projectId);
  const recipient = participants.find(email => email !== member.email);
  activeChat = { key, projectId, recipient, projectTitle: projectId === "profile" ? "محادثة مباشرة" : project?.title || "محادثة" };
  setChatPeer(recipient, projectId === "profile" ? "محادثة مباشرة" : `حول ${project?.title || "عمل"}`);
  renderChatMessages();
  $("#inboxDialog").close();
  $("#chatDialog").showModal();
}

function togglePublicLogin() {
  if (member) showMemberProfile(member.email);
  else if (localStorage.getItem(SESSION) === "yes") window.showAdmin();
  else {
    setAuthMode("login");
    $("#loginDialog").showModal();
  }
}

document.addEventListener("click", event => {
  const ownerLink = event.target.closest("[data-owner-profile]");
  if (ownerLink) {
    event.preventDefault();
    event.stopImmediatePropagation();
    showMemberProfile(ADMIN_EMAIL);
    return;
  }
  const authButton = event.target.closest("#openAdmin, #profileShortcut");
  if (authButton) {
    event.preventDefault();
    event.stopImmediatePropagation();
    togglePublicLogin();
    return;
  }
  const authTab = event.target.closest("[data-auth-tab]");
  if (authTab) {
    event.stopImmediatePropagation();
    setAuthMode(authTab.dataset.authTab);
    return;
  }
  const open = event.target.closest("[data-open]");
  if (open) {
    event.preventDefault();
    event.stopImmediatePropagation();
    openProjectDetail(open.dataset.open);
    return;
  }
  const zoom = event.target.closest("[data-viewer-zoom]");
  if (zoom) {
    event.stopImmediatePropagation();
    setViewerZoom(viewerScale + Number(zoom.dataset.viewerZoom) * 0.25);
    return;
  }
  if (event.target.closest("[data-viewer-reset]")) {
    event.stopImmediatePropagation();
    setViewerZoom(1);
    return;
  }
  if (event.target.closest("[data-viewer-fullscreen]")) {
    event.stopImmediatePropagation();
    const mediaColumn = $("#projectDetail .detail-media-column");
    if (document.fullscreenElement) document.exitFullscreen?.();
    else mediaColumn?.requestFullscreen?.().catch(() => toast("تعذّر فتح وضع ملء الشاشة"));
    return;
  }
  const detailSave = event.target.closest("[data-detail-save]");
  if (detailSave) {
    event.stopImmediatePropagation();
    const id = detailSave.dataset.detailSave;
    state.favorites = state.favorites.includes(id) ? state.favorites.filter(savedId => savedId !== id) : [...state.favorites, id];
    persistSocialState();
    openProjectDetail(id);
    toast(state.favorites.includes(id) ? "تم حفظ العمل" : "تمت إزالة العمل من المحفوظات");
    return;
  }
  const shareProject = event.target.closest("[data-share-project]");
  if (shareProject) {
    event.stopImmediatePropagation();
    const project = state.projects.find(item => item.id === shareProject.dataset.shareProject);
    const shareUrl = new URL(location.href);
    shareUrl.hash = `project=${encodeURIComponent(shareProject.dataset.shareProject)}`;
    const shareData = { title: project?.title || "FOLVA", text: project?.description || "شاهد هذا العمل الإبداعي على FOLVA", url: shareUrl.href };
    if (navigator.share) navigator.share(shareData).catch(() => {});
    else navigator.clipboard?.writeText(shareUrl.href).then(() => toast("تم نسخ رابط العمل للمشاركة")).catch(() => toast(shareUrl.href));
    return;
  }
  if (event.target.closest("[data-view-comments]")) {
    event.stopImmediatePropagation();
    $("#viewerComments")?.scrollIntoView({ behavior: "smooth", block: "start" });
    $("#viewerComments input[name='text']")?.focus({ preventScroll: true });
    return;
  }
  const saved = event.target.closest("[data-save]");
  if (saved) {
    event.preventDefault();
    event.stopImmediatePropagation();
    state.favorites = state.favorites.includes(saved.dataset.save)
      ? state.favorites.filter(id => id !== saved.dataset.save)
      : [...state.favorites, saved.dataset.save];
    persistSocialState();
    if ($("#projectDialog").open) openProjectDetail(saved.dataset.save);
    return;
  }
  const like = event.target.closest("[data-social-like]");
  if (like) {
    event.preventDefault();
    event.stopImmediatePropagation();
    likeProject(like.dataset.socialLike);
    return;
  }
  const follow = event.target.closest("[data-follow-user]");
  if (follow) {
    event.preventDefault();
    event.stopImmediatePropagation();
    toggleFollow(follow.dataset.followUser);
    return;
  }
  const comments = event.target.closest("[data-show-comments]");
  if (comments) {
    event.stopImmediatePropagation();
    openProjectDetail(comments.dataset.showComments);
    return;
  }
  const chat = event.target.closest("[data-open-chat]");
  if (chat) {
    event.stopImmediatePropagation();
    openChat(chat.dataset.openChat);
    return;
  }
  const messageProfile = event.target.closest("#messageProfile");
  if (messageProfile) {
    event.stopImmediatePropagation();
    openDirectChat(messageProfile.dataset.messageProfile);
    return;
  }
  if (event.target.closest("#ownerProfileAdmin")) {
    event.stopImmediatePropagation();
    if (localStorage.getItem(SESSION) !== "yes") return;
    window.showAdmin();
    document.querySelector('.admin-nav [data-section="settings"]')?.click();
    return;
  }
  const profileLink = event.target.closest("[data-view-profile]");
  if (profileLink) {
    event.stopImmediatePropagation();
    if (profileLink.dataset.viewProfile) {
      if ($("#projectDialog").open) $("#projectDialog").close();
      if ($("#networkDialog").open) $("#networkDialog").close();
      showMemberProfile(profileLink.dataset.viewProfile);
    }
    else toast("الناشر لم ينشئ صفحة شخصية بعد");
    return;
  }
  const networkList = event.target.closest("[data-network-list]");
  if (networkList) {
    event.stopImmediatePropagation();
    openNetworkList(networkList.dataset.networkList);
    return;
  }
  const inboxThread = event.target.closest("[data-inbox-key]");
  if (inboxThread) {
    event.stopImmediatePropagation();
    openInboxThread(inboxThread.dataset.inboxKey);
    return;
  }
  const broadcast = event.target.closest("[data-broadcast-id]");
  if (broadcast) {
    event.stopImmediatePropagation();
    openBroadcast(encodeURIComponent(broadcast.dataset.broadcastId));
    return;
  }
  const deleteMember = event.target.closest("[data-delete-member]");
  if (deleteMember) {
    event.stopImmediatePropagation();
    window.adminDeleteMember(deleteMember.dataset.deleteMember);
    return;
  }
  const deleteComment = event.target.closest("[data-delete-comment]");
  if (deleteComment) {
    event.stopImmediatePropagation();
    window.adminDeleteComment(deleteComment.dataset.deleteComment);
    return;
  }
  const removeAsset = event.target.closest("[data-remove-brand-asset]");
  if (removeAsset) {
    event.stopImmediatePropagation();
    const prefix = removeAsset.dataset.removeBrandAsset;
    delete state.settings[`${prefix}Key`];
    delete state.settings[`${prefix}Type`];
    persistSocialState();
    renderBrandAssets();
    toast(prefix === "logo" ? "تمت استعادة شعار FOLVA الافتراضي" : "تمت إزالة أيقونة المتصفح");
    return;
  }
  if (event.target.closest("#openInbox")) {
    event.stopImmediatePropagation();
    renderInbox();
    $("#inboxDialog").showModal();
    return;
  }
  if (event.target.closest("#notificationBell")) {
    event.stopImmediatePropagation();
    openNotifications();
    return;
  }
  const notificationChat = event.target.closest("[data-notification-chat]");
  if (notificationChat) {
    event.stopImmediatePropagation();
    $("#notificationDialog").close();
    openInboxThread(notificationChat.dataset.notificationChat);
    return;
  }
  const memberAction = event.target.closest("[data-member-action]");
  if (memberAction) {
    event.stopImmediatePropagation();
    if (localStorage.getItem(SESSION) !== "yes") { toast("هذا الإجراء يتطلب صلاحية المدير"); return; }
    const user = memberFor(memberAction.dataset.memberEmail);
    if (!user) return;
    if (memberAction.dataset.memberAction === "edit") {
      const form = $("#memberEditForm");
      form.elements.email.value = user.email;
      form.elements.name.value = user.name;
      form.elements.age.value = user.age || "";
      form.elements.gender.value = user.gender || "prefer-not";
      $("#memberEditDialog").showModal();
      return;
    }
    if (memberAction.dataset.memberAction === "block") user.blocked = !user.blocked;
    if (memberAction.dataset.memberAction === "verify") user.verified = !user.verified;
    persistSocialState();
    toast(user.blocked ? "تم حظر الحساب" : user.verified ? "تم توثيق الحساب" : "تم تحديث حالة الحساب");
    return;
  }
  const categoryButton = event.target.closest("[data-category]");
  if (categoryButton) {
    event.stopImmediatePropagation();
    category = categoryButton.dataset.category;
    savedOnly = false;
    renderCategories();
    renderSocialFeed();
    return;
  }
  if (event.target.closest("#allFilter, #clearFilter, #resetFeed")) {
    event.stopImmediatePropagation();
    savedOnly = false;
    category = "الكل";
    $("#search").value = "";
    renderCategories();
    renderSocialFeed();
    return;
  }
  if (event.target.closest("#savedFilter")) {
    event.stopImmediatePropagation();
    savedOnly = !savedOnly;
    category = "الكل";
    renderCategories();
    renderSocialFeed();
    return;
  }
  if (event.target.closest("#backToSite")) {
    event.preventDefault();
    window.showPublic();
    return;
  }
  if (event.target.closest("#editProfile")) {
    const form = $("#profileForm");
    form.elements.name.value = member.name;
    form.elements.age.value = member.age;
    form.elements.gender.value = member.gender;
    form.elements.avatar.value = "";
    form.elements.cover.value = "";
    $("#profileEditDialog").showModal();
    return;
  }
  if (event.target.closest("#profileNewProject, #profileFirstProject")) {
    if (!member) return;
    editProject();
    $("#projectForm").elements.creator.value = member.name;
    return;
  }
  if (event.target.closest("#profileLogout")) {
    void logoutFromServer();
    member = null;
    localStorage.removeItem(SOCIAL_SESSION);
    localStorage.removeItem(SESSION);
    refreshPresence();
    updateAccountAction();
    window.showPublic();
    toast("تم تسجيل الخروج");
    return;
  }
  if (event.target.closest("#logout") && !member) {
      void logoutFromServer();
    localStorage.removeItem(SESSION);
    localStorage.removeItem(SOCIAL_SESSION);
    refreshPresence();
    updateAccountAction();
    return;
  }
  if (event.target.closest("#logout")) {
    void logoutFromServer();
    member = null;
    localStorage.removeItem(SOCIAL_SESSION);
    localStorage.removeItem(SESSION);
    refreshPresence();
    updateAccountAction();
  }
}, true);

$("#signupForm").addEventListener("submit", async event => {
  event.preventDefault();
  event.stopImmediatePropagation();
  const signupForm = event.currentTarget;
  const form = new FormData(signupForm);
  const email = String(form.get("email")).trim().toLowerCase();
  const error = $("#signupError");
  if (memberFor(email) || email === ADMIN_EMAIL) {
    error.textContent = "يوجد حساب مسجل بهذا البريد الإلكتروني.";
    error.hidden = false;
    return;
  }
  try {
    const response = await fetch("/api/auth/signup", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(form.get("name")).trim(),
        age: Number(form.get("age")),
        gender: String(form.get("gender")),
        email,
        password: String(form.get("password"))
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "تعذر إنشاء الحساب");
    member = result.user;
    window.__folvaAdminAuthenticated = false;
    localStorage.setItem(SOCIAL_SESSION, member.email);
    refreshPresence();
    await hydrateServerState();
    $("#loginDialog").close();
    signupForm.reset();
    error.hidden = true;
    updateAccountAction();
    showMemberProfile(member.email);
    toast("أهلًا بك في مجتمع FOLVA");
  } catch (failure) {
    error.textContent = failure.message || "تعذّر إنشاء الحساب.";
    error.hidden = false;
  }
}, true);

$("#loginForm").addEventListener("submit", async event => {
  event.preventDefault();
  event.stopImmediatePropagation();
  const loginForm = event.currentTarget;
  const form = new FormData(loginForm);
  const email = String(form.get("email")).trim().toLowerCase();
  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: String(form.get("password")) })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "البريد أو كلمة المرور غير صحيحة");
    member = result.role === "member" ? result.user : null;
    window.__folvaAdminAuthenticated = result.role === "admin";
    if (member) localStorage.setItem(SOCIAL_SESSION, member.email);
    else localStorage.removeItem(SOCIAL_SESSION);
    if (window.__folvaAdminAuthenticated) localStorage.setItem(SESSION, "yes");
    else localStorage.removeItem(SESSION);
    refreshPresence();
    await hydrateServerState({ migrateLegacy: window.__folvaAdminAuthenticated });
    $("#loginDialog").close();
    loginForm.reset();
    $("#loginError").hidden = true;
    updateAccountAction();
    if (window.__folvaAdminAuthenticated) window.showAdmin();
    else showMemberProfile(member.email);
  } catch (failure) {
    $("#loginError").textContent = failure.message || "تعذر الاتصال بالخادم.";
    $("#loginError").hidden = false;
  }
}, true);

$("#projectForm").addEventListener("submit", async event => {
  event.preventDefault();
  event.stopImmediatePropagation();
  const projectForm = event.currentTarget;
  const form = new FormData(projectForm);
  const id = String(form.get("id"));
  const old = state.projects.find(project => project.id === id);
  const file = form.get("mediaFile");
  const image = String(form.get("image")).trim();
  if (!old && (!file?.size && !image)) {
    $('#projectForm [name="image"]').focus();
    toast("أضف صورة أو فيديو أو رابط وسائط");
    return;
  }
  try {
    const mediaKey = file?.size ? await storeMedia(file) : old?.mediaKey || "";
    const project = {
      id: old?.id || `p${Date.now()}`,
      title: String(form.get("title")).trim(),
      creator: member?.name || String(form.get("creator")).trim(),
      creatorEmail: member?.email || old?.creatorEmail || "",
      authorEmail: member?.email || old?.authorEmail || "",
      category: String(form.get("category")).trim(),
      image: image ? imageURL(image) : old?.image || FALLBACK,
      mediaKey,
      mediaType: file?.size ? file.type : old?.mediaType || "",
      description: String(form.get("description")).trim(),
      likes: old?.likes ?? Math.max(0, Number(form.get("likes")) || 0),
      likedBy: old?.likedBy || [],
      views: old?.views || 0,
      published: form.get("published") === "on",
      createdAt: old?.createdAt || Date.now()
    };
    if (old) state.projects = state.projects.map(item => item.id === id ? project : item);
    else state.projects.unshift(project);
    persistSocialState();
    render();
    $("#editorDialog").close();
    projectForm.reset();
    if (member) showMemberProfile(member.email);
    toast(project.published ? "تم نشر العمل على صفحة الاستكشاف" : "تم حفظ العمل كمسودة");
  } catch (failure) {
    toast(failure.message || "تعذّر حفظ ملف الوسائط");
  }
}, true);

$("#projectDetail").addEventListener("submit", event => {
  const form = event.target.closest("[data-comment-form]");
  if (!form) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const actor = currentActor();
  if (!actor) {
    setAuthMode("login");
    $("#loginDialog").showModal();
    return;
  }
  const id = form.dataset.commentForm;
  const text = String(new FormData(form).get("text")).trim();
  if (!text) return;
  const project = state.projects.find(item => item.id === id);
  state.comments[id] ||= [];
  state.comments[id].push({ id: crypto.randomUUID(), email: actor.email, author: actor.name, text, createdAt: Date.now() });
  if (actor.ownerProfile && project?.authorEmail && project.authorEmail !== actor.email) {
    notificationFor(project.authorEmail, { title: actor.name, text: `علّق صاحب الموقع على عملك «${project.title}»: ${text}`, sender: actor.name, senderEmail: actor.email });
  }
  persistSocialState();
  openProjectDetail(id);
}, true);

$("#chatForm").addEventListener("submit", event => {
  event.preventDefault();
  event.stopImmediatePropagation();
  const sender = member || (localStorage.getItem(SESSION) === "yes" ? ownerProfile() : null);
  if (!sender || !activeChat || (!member && !activeChat.key.includes(ADMIN_EMAIL))) return;
  const text = String(new FormData(event.currentTarget).get("message")).trim();
  if (!text) return;
  state.chats[activeChat.key] ||= [];
  state.chats[activeChat.key].push({ email: sender.email, author: sender.name, text, createdAt: Date.now() });
  notificationFor(activeChat.recipient, { title: sender.name, text: `رسالة جديدة حول ${activeChat.projectTitle}: ${text}`, senderEmail: sender.email, chatKey: activeChat.key, replyable: true });
  persistSocialState();
  event.currentTarget.reset();
  renderChatMessages();
  renderInbox();
}, true);

$("#chatDialogClose").addEventListener("click", event => {
  event.preventDefault();
  event.stopPropagation();
  $("#chatDialog").close();
});

const chatEmojiPicker = $("#chatEmojiPicker");
const chatEmojiToggle = $("#chatEmojiToggle");
const chatMessageField = $('#chatForm textarea[name="message"]');
chatEmojiToggle.addEventListener("click", () => {
  const open = chatEmojiPicker.hidden;
  chatEmojiPicker.hidden = !open;
  chatEmojiToggle.setAttribute("aria-expanded", String(open));
});
chatEmojiPicker.addEventListener("click", event => {
  const button = event.target.closest("[data-chat-emoji]");
  if (!button) return;
  const start = chatMessageField.selectionStart ?? chatMessageField.value.length;
  const end = chatMessageField.selectionEnd ?? start;
  chatMessageField.setRangeText(button.dataset.chatEmoji, start, end, "end");
  chatMessageField.dispatchEvent(new Event("input", { bubbles: true }));
  chatEmojiPicker.hidden = true;
  chatEmojiToggle.setAttribute("aria-expanded", "false");
  chatMessageField.focus();
});
document.addEventListener("click", event => {
  if (event.target.closest("#chatEmojiPicker, #chatEmojiToggle")) return;
  chatEmojiPicker.hidden = true;
  chatEmojiToggle.setAttribute("aria-expanded", "false");
});

$('#chatForm textarea[name="message"]')?.addEventListener("keydown", event => {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  event.currentTarget.form.requestSubmit();
});

$("#siteMessageForm").addEventListener("submit", event => {
  event.preventDefault();
  event.stopImmediatePropagation();
  if (localStorage.getItem(SESSION) !== "yes" && sessionStorage.getItem(SESSION) !== "yes") { toast("إرسال الرسائل يتطلب صلاحية المدير"); return; }
  const text = String(new FormData(event.currentTarget).get("text") || "").trim();
  if (!text) return;
  const siteName = state.settings.brand || "FOLVA";
  const createdAt = Date.now();
  const message = { id: crypto.randomUUID(), sender: siteName, text, createdAt, recipients: state.users.map(user => user.email) };
  state.siteMessages.unshift(message);
  state.siteMessages = state.siteMessages.slice(0, 100);
  message.recipients.forEach(email => notificationFor(email, { title: siteName, text, sender: siteName, broadcastId: message.id, replyable: false, createdAt }));
  persistSocialState();
  renderInbox();
  event.currentTarget.reset();
  $("#siteMessageDialog").close();
  toast(`✓ تم إرسال الرسالة إلى ${message.recipients.length} عضو`);
}, true);

$("#memberEditForm").addEventListener("submit", event => {
  event.preventDefault();
  event.stopImmediatePropagation();
  if (localStorage.getItem(SESSION) !== "yes") { toast("تعديل الحسابات يتطلب صلاحية المدير"); return; }
  const form = new FormData(event.currentTarget);
  const email = String(form.get("email") || "").trim().toLowerCase();
  const user = memberFor(email);
  const name = String(form.get("name") || "").trim();
  const age = Number(form.get("age"));
  if (!user || !name || age < 13 || age > 120) return;
  user.name = name;
  user.age = age;
  user.gender = String(form.get("gender") || "prefer-not");
  state.projects.filter(project => project.authorEmail === email).forEach(project => { project.creator = name; });
  Object.values(state.comments || {}).flat().filter(comment => comment.email === email).forEach(comment => { comment.author = name; });
  Object.values(state.chats || {}).flat().filter(message => message.email === email).forEach(message => { message.author = name; });
  persistSocialState();
  if (viewedProfileEmail === email) showMemberProfile(email);
  $("#memberEditDialog").close();
  toast("✓ تم تحديث بيانات العضو");
}, true);

function openSiteMessageDialog() {
  if (localStorage.getItem(SESSION) !== "yes" && sessionStorage.getItem(SESSION) !== "yes") { toast("هذا الزر متاح لمدير الموقع فقط"); return; }
  $("#siteMessageForm").reset();
  const dialog = $("#siteMessageDialog");
  if (dialog.showModal) dialog.showModal();
  else dialog.setAttribute("open", "");
}

$("#messageAll")?.addEventListener("click", event => {
  event.preventDefault();
  event.stopImmediatePropagation();
  openSiteMessageDialog();
}, true);
$$("[data-site-message]").forEach(button => button.addEventListener("click", event => {
  event.preventDefault();
  event.stopImmediatePropagation();
  openSiteMessageDialog();
}, true));

$("#profileForm").addEventListener("submit", async event => {
  event.preventDefault();
  event.stopImmediatePropagation();
  if (!member) return;
  const profileForm = event.currentTarget;
  const form = new FormData(profileForm);
  const avatarFile = form.get("avatar");
  const coverFile = form.get("cover");
  let avatarKey = member.avatarKey || "";
  let coverKey = member.coverKey || "";
  try {
    if (avatarFile?.size) avatarKey = await storeMedia(avatarFile);
    if (coverFile?.size) coverKey = await storeMedia(coverFile);
  } catch (failure) {
    toast(failure.message || "تعذّر حفظ صور الملف الشخصي");
    return;
  }
  member.name = String(form.get("name")).trim();
  member.age = Number(form.get("age"));
  member.gender = String(form.get("gender"));
  member.avatarKey = avatarKey;
  member.coverKey = coverKey;
  state.users = state.users.map(user => user.email === member.email ? member : user);
  state.projects.forEach(project => { if (project.authorEmail === member.email) project.creator = member.name; });
  persistSocialState();
  $("#profileEditDialog").close();
  showMemberProfile(member.email);
  updateAccountAction();
  toast("تم تحديث الملف الشخصي");
}, true);

$("#ownerProfileForm").addEventListener("submit", async event => {
  event.preventDefault();
  event.stopImmediatePropagation();
  if (localStorage.getItem(SESSION) !== "yes") { toast("تعديل صفحة صاحب الموقع يتطلب صلاحية المدير"); return; }
  const form = new FormData(event.currentTarget);
  const name = String(form.get("name") || "").trim();
  const avatar = form.get("avatar");
  const cover = form.get("cover");
  if (!name) return;
  let avatarKey = state.settings.ownerAvatarKey || "";
  let coverKey = state.settings.ownerCoverKey || "";
  try {
    if (avatar?.size) avatarKey = await storeMedia(avatar);
    if (cover?.size) coverKey = await storeMedia(cover);
  } catch (failure) {
    toast(failure.message || "تعذّر حفظ صور الملف الشخصي");
    return;
  }
  state.settings.ownerName = name;
  state.settings.ownerBio = String(form.get("bio") || "").trim();
  state.settings.ownerAvatarKey = avatarKey;
  state.settings.ownerCoverKey = coverKey;
  state.settings.ownerVerified = form.get("verified") === "on";
  persistSocialState();
  renderOwnerProfileSettings();
  if (!$("#profileView").hidden && viewedProfileEmail === ADMIN_EMAIL) showMemberProfile(ADMIN_EMAIL);
  toast("✓ تم حفظ صفحة صاحب الموقع");
}, true);

$("#previewOwnerProfile").addEventListener("click", () => {
  if (localStorage.getItem(SESSION) !== "yes") return;
  showMemberProfile(ADMIN_EMAIL);
});

$("#settingsForm").addEventListener("submit", async event => {
  event.preventDefault();
  event.stopImmediatePropagation();
  const settingsForm = event.currentTarget;
  const form = new FormData(settingsForm);
  const logoFile = form.get("logoFile");
  const faviconFile = form.get("faviconFile");
  const verificationFile = form.get("verificationFile");
  try {
    const settings = {
      ...state.settings,
      title: String(form.get("title")).trim(),
      subtitle: String(form.get("subtitle")).trim(),
      brand: String(form.get("brand")).trim(),
      accent: String(form.get("accent")),
      surface: String(form.get("surface")),
      foreground: String(form.get("foreground"))
    };
    if (logoFile?.size) {
      settings.logoKey = await storeMedia(logoFile);
      settings.logoType = logoFile.type;
    }
    if (faviconFile?.size) {
      settings.faviconKey = await storeMedia(faviconFile);
      settings.faviconType = faviconFile.type || "image/x-icon";
    }
    if (verificationFile?.size) {
      settings.verificationKey = await storeMedia(verificationFile);
      settings.verificationType = verificationFile.type;
    }
    state.settings = settings;
    persistSocialState();
    renderBrandAssets();
    settingsForm.elements.logoFile.value = "";
    settingsForm.elements.faviconFile.value = "";
    settingsForm.elements.verificationFile.value = "";
    $("#saveStatus").textContent = "تم حفظ ونشر الهوية";
    setTimeout(() => { $("#saveStatus").textContent = ""; }, 2400);
    toast("تم تحديث شعار وأيقونة الموقع");
  } catch (error) {
    toast(error.message || "تعذّر حفظ ملفات الهوية");
  }
}, true);

$("#search").addEventListener("input", event => {
  event.stopImmediatePropagation();
  renderSocialFeed();
}, true);
$("#sort").addEventListener("change", event => {
  event.stopImmediatePropagation();
  renderSocialFeed();
}, true);

window.addEventListener("storage", event => {
  if (event.key !== KEY) return;
  state = load();
  state.users ||= [];
  state.comments ||= {};
  state.chats ||= {};
  state.users.forEach(user => { user.following ||= []; });
  state.projects.forEach(project => { project.views ||= 0; project.likedBy ||= []; });
  state.projects.forEach(project => { project.viewedBy ||= []; });
  member = memberFor(localStorage.getItem(SOCIAL_SESSION));
  renderNotificationBell();
  renderNotifications();
  renderInbox();
  updateAccountAction();
  renderOwnerProfileSettings();
  render();
});

updateAccountAction();
if (shouldRecordVisitor) persistSocialState();
renderSocialFeed();
renderAdmin();
renderBrandAssets();
renderOwnerProfileSettings();
if (location.hash.startsWith("#project=")) requestAnimationFrame(openProjectFromHash);

(function () {
  const h = window._redesignHelpers || {};
  const { exportJSON, importJSON, stateSnapshot, persistAndRefresh, downloadBlob } = h;

  function isAdmin() {
    return localStorage.getItem(SESSION) === "yes";
  }

  function requireAdminOrAlert() {
    if (!isAdmin()) { toast("هذه الإجراءات تتطلب تسجيل الدخول كمدير"); return false; }
    return true;
  }

  document.addEventListener("click", (event) => {
    if (!requireAdminOrAlert()) {
      const adminOnly = event.target.closest("#exportData,#clearCache,#bulkPublishAll,#bulkDraftAll,#exportProjects,#importProjects,#bulkPublish,#bulkDelete,#categoryForm,#catReset,#cat-edit,#cat-del,#exportMembers,#messageAll,#approveAllComments,#deleteAllComments,#exportChats,#compressMedia,#cleanUnused,#exportReport,#endAllSessions,#backupNow,#restoreBackup,#resetAll,#resetSettings,#advancedComments,#advancedSignup,#advancedMessages,#maintenanceMode,[data-cat-edit],[data-cat-del],[data-view-chat]");
      if (adminOnly) return;
    }

    if (event.target.closest("#exportData")) {
      event.stopImmediatePropagation();
      if (!requireAdminOrAlert()) return;
      const snap = stateSnapshot();
      const filename = `folva-backup-${new Date().toISOString().slice(0,10)}.json`;
      exportJSON(filename, snap);
      toast("✓ تم تصدير نسخة احتياطية كاملة من البيانات");
      return;
    }

    if (event.target.closest("#clearCache")) {
      event.stopImmediatePropagation();
      if (!requireAdminOrAlert()) return;
      if (!confirm("مسح ذاكرة التخزين المؤقت للصور والوسائط المحملة؟ لن يتم حذف البيانات الأساسية.")) return;
      for (const k of Object.keys(localStorage)) {
        if (k !== KEY && k !== SESSION && k !== SOCIAL_SESSION && k !== "folva-viewer-id") {
          localStorage.removeItem(k);
        }
      }
      try { indexedDB.deleteDatabase("folva-media-v1"); } catch (_) {}
      toast("✓ تم مسح ذاكرة التخزين المؤقت");
      setTimeout(() => location.reload(), 600);
      return;
    }

    if (event.target.closest("#bulkPublishAll")) {
      event.stopImmediatePropagation();
      if (!requireAdminOrAlert()) return;
      if (!confirm(`نشر جميع الأعمال (${state.projects.length}) على الموقع؟`)) return;
      state.projects.forEach(p => p.published = true);
      persistSocialState();
      toast("✓ تم نشر جميع الأعمال");
      return;
    }

    if (event.target.closest("#bulkDraftAll")) {
      event.stopImmediatePropagation();
      if (!requireAdminOrAlert()) return;
      if (!confirm("تحويل جميع الأعمال إلى مسودة (إخفائها عن الموقع)؟")) return;
      state.projects.forEach(p => p.published = false);
      persistSocialState();
      toast("✓ تم إخفاء جميع الأعمال");
      return;
    }

    if (event.target.closest("#exportProjects")) {
      event.stopImmediatePropagation();
      if (!requireAdminOrAlert()) return;
      exportJSON(`folva-projects-${new Date().toISOString().slice(0,10)}.json`, { projects: state.projects, exportedAt: Date.now() });
      toast("✓ تم تصدير الأعمال بصيغة JSON");
      return;
    }

    if (event.target.closest("#importProjects")) {
      event.stopImmediatePropagation();
      if (!requireAdminOrAlert()) return;
      importJSON((data) => {
        const incoming = Array.isArray(data) ? data : data.projects;
        if (!Array.isArray(incoming) || !incoming.length) { alert("الملف لا يحتوي على أعمال صالحة"); return; }
        if (!confirm(`استيراد ${incoming.length} مشروع؟ سيتم دمجها مع الأعمال الحالية.`)) return;
        const existingIds = new Set(state.projects.map(p => p.id));
        const now = Date.now();
        incoming.forEach((p, i) => {
          const project = {
            id: existingIds.has(p.id) ? `${p.id}-imported-${now}-${i}` : (p.id || `p${now}${i}`),
            title: p.title || "عمل مستورد",
            creator: p.creator || "مستورد",
            category: p.category || "غير مصنف",
            image: p.image || FALLBACK,
            description: p.description || "",
            likes: Number(p.likes) || 0,
            published: typeof p.published === "boolean" ? p.published : false,
            createdAt: p.createdAt || Date.now(),
            views: Number(p.views) || 0,
            likedBy: Array.isArray(p.likedBy) ? p.likedBy : []
          };
          state.projects.unshift(project);
        });
        persistSocialState();
        toast(`✓ تم استيراد ${incoming.length} مشروع`);
      });
      return;
    }

    if (event.target.closest("#bulkPublish")) {
      event.stopImmediatePropagation();
      if (!requireAdminOrAlert()) return;
      const checked = [...document.querySelectorAll(".admin-bulk-check:checked")].map(cb => cb.value);
      if (!checked.length) { toast("اختر عملًا واحدًا على الأقل أولاً"); return; }
      checked.forEach(id => { const p = state.projects.find(x => x.id === id); if (p) p.published = true; });
      persistSocialState();
      toast(`✓ تم نشر ${checked.length} عمل`);
      return;
    }

    if (event.target.closest("#bulkDelete")) {
      event.stopImmediatePropagation();
      if (!requireAdminOrAlert()) return;
      const checked = [...document.querySelectorAll(".admin-bulk-check:checked")].map(cb => cb.value);
      if (!checked.length) { toast("اختر عملًا واحدًا على الأقل أولاً"); return; }
      if (!confirm(`حذف ${checked.length} عمل؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
      state.projects = state.projects.filter(p => !checked.includes(p.id));
      state.favorites = state.favorites.filter(id => !checked.includes(id));
      checked.forEach(id => delete state.comments[id]);
      persistSocialState();
      toast(`✓ تم حذف ${checked.length} عمل`);
      return;
    }

    const catForm = event.target.closest("#categoryForm");
    if (catForm && event.target.tagName === "BUTTON" && event.target.type !== "button") {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!requireAdminOrAlert()) return;
      const form = catForm;
      const name = String(form.elements.name.value || "").trim();
      if (!name) { toast("أدخل اسم التصنيف"); return; }
      const editId = String(form.elements.catId?.value || "").trim();
      if (editId) {
        state.projects.forEach(p => { if (p.category === editId) p.category = name; });
        state.categories = (state.categories || []).map(c => c === editId ? name : c);
        toast(`✓ تم تغيير اسم التصنيف إلى «${name}»`);
      } else {
        state.categories = [...new Set([...(state.categories || []), name])];
        toast(`✓ تم إضافة التصنيف «${name}»`);
      }
      form.reset();
      persistSocialState();
      return;
    }

    if (event.target.closest("#catReset")) {
      event.stopImmediatePropagation();
      const form = document.querySelector("#categoryForm");
      if (form) { form.reset(); if (form.elements.catId) form.elements.catId.value = ""; }
      return;
    }

    const catEdit = event.target.closest("[data-cat-edit]");
    if (catEdit) {
      event.stopImmediatePropagation();
      if (!requireAdminOrAlert()) return;
      const name = catEdit.dataset.catEdit;
      const form = document.querySelector("#categoryForm");
      if (form) {
        form.elements.name.value = name;
        if (form.elements.catId) form.elements.catId.value = name;
        const wrap = document.querySelector("#categoryFormWrap") || form.parentElement;
        if (wrap) wrap.scrollIntoView({ behavior: "smooth", block: "start" });
        setTimeout(() => form.elements.name.focus(), 200);
      }
      return;
    }

    const catDel = event.target.closest("[data-cat-del]");
    if (catDel) {
      event.stopImmediatePropagation();
      if (!requireAdminOrAlert()) return;
      const name = catDel.dataset.catDel;
      const affected = state.projects.filter(p => p.category === name).length;
      const msg = affected > 0 ? `حذف التصنيف «${name}»؟ ${affected} مشروع سينتقل إلى «غير مصنف».` : `حذف التصنيف «${name}»؟`;
      if (!confirm(msg)) return;
      state.categories = (state.categories || []).filter(c => c !== name);
      state.projects.forEach(p => { if (p.category === name) p.category = "غير مصنف"; });
      persistSocialState();
      toast("✓ تم حذف التصنيف");
      return;
    }

    if (event.target.closest("#exportMembers")) {
      event.stopImmediatePropagation();
      if (!requireAdminOrAlert()) return;
      const rows = [["الاسم","البريد","العمر","الجنس","تاريخ التسجيل","عدد الأعمال"]];
      state.users.forEach(u => {
        rows.push([u.name, u.email, u.age || "", genderLabel(u.gender), u.createdAt ? new Date(u.createdAt).toLocaleDateString("ar") : "", state.projects.filter(p => p.authorEmail === u.email).length]);
      });
      const csv = "\uFEFF" + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
      downloadBlob(`folva-members-${new Date().toISOString().slice(0,10)}.csv`, new Blob([csv], { type: "text/csv;charset=utf-8" }));
      toast("✓ تم تصدير قائمة الأعضاء بصيغة CSV");
      return;
    }

    if (event.target.closest("#messageAll,[data-site-message]")) {
      event.stopImmediatePropagation();
      if (!requireAdminOrAlert()) return;
      $("#siteMessageForm").reset();
      $("#siteMessageDialog").showModal();
      return;
    }

    if (event.target.closest("#approveAllComments")) {
      event.stopImmediatePropagation();
      if (!requireAdminOrAlert()) return;
      const count = Object.values(state.comments || {}).reduce((n, arr) => n + arr.length, 0);
      if (!count) { toast("لا توجد تعليقات للموافقة عليها"); return; }
      toast(`✓ جميع التعليقات (${count}) ظاهرة بالفعل للمستخدمين`);
      return;
    }

    if (event.target.closest("#deleteAllComments")) {
      event.stopImmediatePropagation();
      if (!requireAdminOrAlert()) return;
      const count = Object.values(state.comments || {}).reduce((n, arr) => n + arr.length, 0);
      if (!count) { toast("لا توجد تعليقات لحذفها"); return; }
      if (!confirm(`حذف جميع التعليقات (${count}) نهائيًا؟`)) return;
      state.comments = {};
      persistSocialState();
      toast("✓ تم حذف جميع التعليقات");
      return;
    }

    if (event.target.closest("#exportChats")) {
      event.stopImmediatePropagation();
      if (!requireAdminOrAlert()) return;
      exportJSON(`folva-chats-${new Date().toISOString().slice(0,10)}.json`, { chats: state.chats || {}, exportedAt: Date.now() });
      toast("✓ تم تصدير المحادثات");
      return;
    }

    if (event.target.closest("#compressMedia")) {
      event.stopImmediatePropagation();
      if (!requireAdminOrAlert()) return;
      toast("ℹ محرك الوسائط التجريبي لا يحتاج إلى ضغط إضافي");
      return;
    }

    if (event.target.closest("#cleanUnused")) {
      event.stopImmediatePropagation();
      if (!requireAdminOrAlert()) return;
      const used = new Set();
      if (state.settings.logoKey) used.add(state.settings.logoKey);
      if (state.settings.faviconKey) used.add(state.settings.faviconKey);
      if (state.settings.ownerAvatarKey) used.add(state.settings.ownerAvatarKey);
      if (state.settings.ownerCoverKey) used.add(state.settings.ownerCoverKey);
      state.projects.forEach(p => { if (p.mediaKey) used.add(p.mediaKey); });
      state.users.forEach(u => { if (u.avatarKey) used.add(u.avatarKey); if (u.coverKey) used.add(u.coverKey); });
      toast(`✓ تم فحص الوسائط. جميع الملفات قيد الاستخدام (${used.length} ملف مفهرس)`);
      return;
    }

    if (event.target.closest("#exportReport")) {
      event.stopImmediatePropagation();
      if (!requireAdminOrAlert()) return;
      const all = state.projects, published = all.filter(p => p.published);
      const totalLikes = published.reduce((n, p) => n + (Number(p.likes) || 0), 0);
      const totalViews = published.reduce((n, p) => n + (Number(p.views) || 0), 0);
      const report = {
        generatedAt: new Date().toLocaleString("ar"),
        summary: {
          totalProjects: all.length,
          publishedProjects: published.length,
          totalMembers: state.users.length,
          totalLikes, totalViews,
          totalComments: Object.values(state.comments || {}).reduce((n, a) => n + a.length, 0),
          totalChats: Object.keys(state.chats || {}).length
        },
        topMembers: state.users.map(u => ({
          name: u.name, email: u.email,
          projects: published.filter(p => p.authorEmail === u.email).length,
          likes: published.filter(p => p.authorEmail === u.email).reduce((s, p) => s + (Number(p.likes) || 0), 0),
          views: published.filter(p => p.authorEmail === u.email).reduce((s, p) => s + (Number(p.views) || 0), 0)
        })).sort((a, b) => b.likes + b.views - a.likes - a.views).slice(0, 10),
        topProjects: [...published].sort((a, b) => (b.likes + b.views) - (a.likes + a.views)).slice(0, 10).map(p => ({ title: p.title, creator: p.creator, category: p.category, likes: p.likes, views: p.views || 0 }))
      };
      exportJSON(`folva-report-${new Date().toISOString().slice(0,10)}.json`, report);
      toast("✓ تم تصدير التقرير الإحصائي");
      return;
    }

    if (event.target.closest("#endAllSessions")) {
      event.stopImmediatePropagation();
      if (!requireAdminOrAlert()) return;
      if (!confirm("إنهاء جميع جلسات الأعضاء؟ سيضطر الجميع لتسجيل الدخول مرة أخرى.")) return;
      localStorage.removeItem(SOCIAL_SESSION);
      localStorage.removeItem(SESSION);
      sessionStorage.removeItem(SOCIAL_SESSION);
      sessionStorage.removeItem(SESSION);
      toast("✓ تم إنهاء جميع الجلسات. أعد تسجيل الدخول للمتابعة.");
      setTimeout(() => location.reload(), 800);
      return;
    }

    if (event.target.closest("#backupNow")) {
      event.stopImmediatePropagation();
      if (!requireAdminOrAlert()) return;
      const snap = stateSnapshot();
      snap._backupMeta = { createdAt: Date.now(), label: "admin-backup" };
      localStorage.setItem("folva-last-backup", JSON.stringify({ createdAt: Date.now(), size: JSON.stringify(snap).length }));
      exportJSON(`folva-full-backup-${new Date().toISOString().slice(0,10)}.json`, snap);
      toast("✓ تم إنشاء وتحميل النسخة الاحتياطية");
      return;
    }

    if (event.target.closest("#restoreBackup")) {
      event.stopImmediatePropagation();
      if (!requireAdminOrAlert()) return;
      if (!confirm("استعادة نسخة احتياطية؟ ستستبدل جميع البيانات الحالية بالكامل.")) return;
      importJSON((data) => {
        if (!data || !Array.isArray(data.projects)) { alert("الملف ليس نسخة احتياطية صالحة لـ FOLVA"); return; }
        if (!confirm("سيتم استبدال البيانات الحالية بالكامل. هل تريد المتابعة؟")) return;
        const clean = {
          projects: data.projects || [],
          settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) },
          favorites: data.favorites || [],
          users: data.users || [],
          comments: data.comments || {},
          chats: data.chats || {},
          categories: data.categories || []
        };
        state.projects = clean.projects;
        state.settings = clean.settings;
        state.favorites = clean.favorites;
        state.users = clean.users;
        state.comments = clean.comments;
        state.chats = clean.chats;
        state.categories = clean.categories;
        persistSocialState();
        toast("✓ تم استعادة النسخة الاحتياطية بنجاح");
        setTimeout(() => location.reload(), 600);
      });
      return;
    }

    if (event.target.closest("#resetAll")) {
      event.stopImmediatePropagation();
      if (!requireAdminOrAlert()) return;
      if (!confirm("⚠ إعادة ضبط المصنع ستحذف جميع البيانات (الأعمال، الأعضاء، التعليقات، المحادثات) وتعيد التهيئة الافتراضية. لا يمكن التراجع!")) return;
      if (!confirm("هذا الإجراء نهائي. هل تريد حقًا إعادة ضبط كل شيء؟")) return;
      localStorage.removeItem(KEY);
      localStorage.removeItem(SESSION);
      localStorage.removeItem(SOCIAL_SESSION);
      localStorage.removeItem("folva-viewer-id");
      localStorage.removeItem("folva-last-backup");
      try { indexedDB.deleteDatabase("folva-media-v1"); } catch (_) {}
      setTimeout(() => location.reload(), 200);
      return;
    }

    if (event.target.closest("#resetSettings")) {
      event.stopImmediatePropagation();
      if (!requireAdminOrAlert()) return;
      if (!confirm("إعادة تعيين إعدادات الموقع إلى القيم الافتراضية؟")) return;
      state.settings = { ...DEFAULT_SETTINGS };
      ["advancedComments","advancedSignup","advancedMessages","maintenanceMode"].forEach(k => delete state.settings[k]);
      persistSocialState();
      renderSettings?.();
      renderBrandAssets?.();
      toast("✓ تمت استعادة الإعدادات الافتراضية");
      return;
    }

    const toggle = event.target.closest("#advancedComments,#advancedSignup,#advancedMessages,#maintenanceMode");
    if (toggle) {
      event.stopImmediatePropagation();
      if (!requireAdminOrAlert()) return;
      const key = toggle.id;
      state.settings[key] = toggle.checked;
      persistAndRefresh();
      return;
    }

    const viewChat = event.target.closest("[data-view-chat]");
    if (viewChat) {
      event.stopImmediatePropagation();
      const key = decodeURIComponent(viewChat.dataset.viewChat);
      const messages = state.chats?.[key] || [];
      if (!messages.length) return;
      const [pid, plist] = key.split(":");
      if (pid === "profile" && plist.split("|").includes(ADMIN_EMAIL)) {
        openAdminChat(key);
        return;
      }
      const first = messages[0];
      const subject = state.projects.find(p => p.id === pid)?.title || "محادثة إدارية";
      const summary = messages.map(m => `${new Date(m.createdAt).toLocaleString("ar")} — ${m.author}:\n${m.text}\n`).join("\n");
      alert(`المحادثة بخصوص: ${subject}\nالمشاركون: ${plist}\n\nآخر رسالة من ${messages.at(-1).author}:\n\n${summary.slice(0, 1200)}${summary.length > 1200 ? "\n…(مقتطف)" : ""}`);
      return;
    }

    const memberSearch = event.target.closest("#memberSearch");
    if (memberSearch) {
      event.stopImmediatePropagation();
      const q = String(memberSearch.value || "").trim().toLocaleLowerCase("ar");
      const rows = [...document.querySelectorAll("#memberRows .member-row")];
      rows.forEach(row => {
        const text = row.textContent.toLocaleLowerCase("ar");
        row.hidden = q ? !text.includes(q) : false;
      });
      return;
    }

    const filterGender = event.target.closest("#filterGender");
    if (filterGender) {
      event.stopImmediatePropagation();
      const val = filterGender.value;
      const rows = [...document.querySelectorAll("#memberRows .member-row")];
      rows.forEach(row => {
        const genderEl = row.querySelector(".admin-row-meta:nth-child(3) strong");
        if (!genderEl) return;
        const g = genderEl.textContent.trim();
        const matches = !val || (val === "male" && g === "ذكر") || (val === "female" && g === "أنثى") || (val === "other" && g === "أفضل عدم الإجابة");
        row.hidden = !matches;
      });
      return;
    }

    const commentSearch = event.target.closest("#commentSearch");
    if (commentSearch) {
      event.stopImmediatePropagation();
      const q = String(commentSearch.value || "").trim().toLocaleLowerCase("ar");
      const rows = [...document.querySelectorAll("#commentRows .comment-row")];
      rows.forEach(row => {
        const text = row.textContent.toLocaleLowerCase("ar");
        row.hidden = q ? !text.includes(q) : false;
      });
      return;
    }

    const mediaSearch = event.target.closest("#mediaSearch");
    if (mediaSearch) {
      event.stopImmediatePropagation();
      const q = String(mediaSearch.value || "").trim().toLocaleLowerCase("ar");
      const cards = [...document.querySelectorAll("#mediaGrid .media-card")];
      cards.forEach(card => {
        const text = card.textContent.toLocaleLowerCase("ar");
        card.style.display = q && !text.includes(q) ? "none" : "";
      });
      return;
    }

    const mediaFilter = event.target.closest("#mediaFilter");
    if (mediaFilter) {
      event.stopImmediatePropagation();
      const val = mediaFilter.value;
      const cards = [...document.querySelectorAll("#mediaGrid .media-card")];
      cards.forEach(card => {
        const badge = card.querySelector(".type-badge")?.textContent || "";
        const match = !val || (val === "image" && badge === "صورة") || (val === "video" && badge === "فيديو") || (val === "brand" && (badge === "شعار" || badge === "أيقونة"));
        card.style.display = match ? "" : "none";
      });
      return;
    }

    const filterStatus = event.target.closest("#filterStatus");
    if (filterStatus) {
      event.stopImmediatePropagation();
      const val = filterStatus.value;
      const rows = [...document.querySelectorAll("#adminProjectList .admin-row")];
      rows.forEach(row => {
        const statusEl = row.querySelector(".row-meta:nth-child(4) .status");
        if (!statusEl) return;
        const isPublished = statusEl.classList.contains("published");
        const match = !val || (val === "published" && isPublished) || (val === "draft" && !isPublished);
        row.hidden = !match;
      });
      return;
    }

    const filterCategorySel = event.target.closest("#filterCategory");
    if (filterCategorySel) {
      event.stopImmediatePropagation();
      const val = filterCategorySel.value;
      const rows = [...document.querySelectorAll("#adminProjectList .admin-row")];
      rows.forEach(row => {
        const catEl = row.querySelector(".row-meta:nth-child(1) strong");
        if (!catEl) return;
        row.hidden = val && catEl.textContent.trim() !== val ? true : false;
      });
      return;
    }

    const sortAdmin = event.target.closest("#sortAdmin");
    if (sortAdmin) {
      event.stopImmediatePropagation();
      const container = document.querySelector("#adminProjectList");
      if (!container) return;
      const rows = [...container.querySelectorAll(".admin-row")];
      const val = sortAdmin.value;
      rows.sort((a, b) => {
        const aLike = parseInt((a.querySelector(".row-meta:nth-child(2) strong")?.textContent || "0").replace(/[^\d]/g, "")) || 0;
        const bLike = parseInt((b.querySelector(".row-meta:nth-child(2) strong")?.textContent || "0").replace(/[^\d]/g, "")) || 0;
        const aTitle = a.querySelector(".row-project strong")?.textContent || "";
        const bTitle = b.querySelector(".row-project strong")?.textContent || "";
        if (val === "likes") return bLike - aLike;
        if (val === "oldest") return 1;
        if (val === "alpha") return aTitle.localeCompare(bTitle, "ar");
        return -1;
      });
      rows.forEach(row => container.appendChild(row));
      return;
    }
  }, true);

  $("#memberSearch")?.addEventListener("input", (e) => e.target.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  $("#filterGender")?.addEventListener("change", (e) => e.target.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  $("#commentSearch")?.addEventListener("input", (e) => e.target.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  $("#mediaSearch")?.addEventListener("input", (e) => e.target.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  $("#mediaFilter")?.addEventListener("change", (e) => e.target.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  $("#filterStatus")?.addEventListener("change", (e) => e.target.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  $("#filterCategory")?.addEventListener("change", (e) => e.target.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  $("#sortAdmin")?.addEventListener("change", (e) => e.target.dispatchEvent(new MouseEvent("click", { bubbles: true })));
})();

/* ============================================================
   15 PREMIUM THEMES — Data + Engine + Logout buttons
   ============================================================ */
(function themesEngine(){
  return;
  const THEME_KEY = "folva-active-theme-v1";
  const THEMES = [
    { id:"folva",        name:"FOLVA Original",    emoji:"🌿", style:"Classic",   radiusPx:12, shadows:"Light",   desc:"الألوان الكلاسيكية مع لمسات الخضراء الفاتحة والشكل الناعم", accentHex:"#c8e84a" },
    { id:"midnight",     name:"Midnight Navy",     emoji:"🌌", style:"Business",  radiusPx:16, shadows:"Medium",  desc:"أزرق الأعمال الاحترافي مع لمسات بحرية فاخرة وحدود دائرية", accentHex:"#3b82f6" },
    { id:"royal",        name:"Royal Plum",        emoji:"👑", style:"Luxury",    radiusPx:20, shadows:"Bold",    desc:"بنفسجي ملكي فاخر مع درجات ذهبية خفيفة للصفحات الراقية", accentHex:"#7c3aed" },
    { id:"sunset",       name:"Sunset Coral",      emoji:"🌅", style:"Warm",      radiusPx:14, shadows:"Medium",  desc:"الشروق والغروب بدرجات قرمزية دافئة مثالية لمجتمع التصميم", accentHex:"#f43f5e" },
    { id:"ocean",        name:"Ocean Breeze",      emoji:"🌊", style:"Fresh",     radiusPx:10, shadows:"Soft",    desc:"نسيم المحيط الأزرق السماوي بلمسات منتعشة وخطوط هادئة", accentHex:"#06b6d4" },
    { id:"forest",       name:"Forest Pine",       emoji:"🌲", style:"Organic",   radiusPx:8,  shadows:"Soft",    desc:"غابة الصنوبر الخضراء الداكنة بطابع بيئي عضوي ونقي", accentHex:"#10b981" },
    { id:"desert",       name:"Desert Sand",       emoji:"🏜️", style:"Warm Minimal", radiusPx:24, shadows:"Medium",  desc:"رمال الصحراء الذهبية مع زوايا مستديرة بشكل مينيمالي فاخر", accentHex:"#f59e0b" },
    { id:"noir",         name:"Noir Gold",         emoji:"🖤", style:"Dark Lux",  radiusPx:4,  shadows:"Heavy",   desc:"أسود لكزسري مع لمسات ذهبية عصرية للعلامات التجارية الراقية", accentHex:"#eab308" },
    { id:"sakura",       name:"Sakura Pink",       emoji:"🌸", style:"Soft",      radiusPx:18, shadows:"Medium",  desc:"زهرة الكرز اليابانية الوردي الهادئ بدرجات نسائية أنيقة", accentHex:"#ec4899" },
    { id:"arctic",       name:"Arctic Mono",       emoji:"❄️", style:"Minimal",   radiusPx:0,  shadows:"Medium",  desc:"قطبي أحادي اللون بدون زوايا مستديرة، البساطة المتطرفة", accentHex:"#1f2937" },
    { id:"brew",         name:"Amber Brew",        emoji:"☕", style:"Cozy",      radiusPx:13, shadows:"Medium",  desc:"قهوة العبر البنية الدافئة، راحة المقهى المحلي والمجتمعات الصغيرة", accentHex:"#a16207" },
    { id:"cyber",        name:"Cyber Neon",        emoji:"🚀", style:"Futuristic",radiusPx:6,  shadows:"Glow",    desc:"نيون سايبر بانك مع توهجات أرجوانية زرقاء للصفحات التقنية", accentHex:"#22d3ee" },
    { id:"lavender",     name:"Soft Lavender",     emoji:"💜", style:"Elegant",   radiusPx:16, shadows:"Medium",  desc:"لافندر ناعم بأسلوب أنيق خافت يناسب الصفحات الثقافية والجمالية", accentHex:"#8b5cf6" },
    { id:"retro",        name:"Retro 70s Orange",  emoji:"📻", style:"Vintage",   radiusPx:2,  shadows:"Small",   desc:"الستينيات والسبعينيات البرتقالي مع حدود واضحة وطابع كلاسيكي", accentHex:"#ea580c" },
    { id:"mint",         name:"Mint Fresh",        emoji:"🍃", style:"Clean",     radiusPx:11, shadows:"Medium",  desc:"نعناع منعش أخضر مائي بدرجات نقية مثالية للصفحات الصحية والطبيعية", accentHex:"#14b8a6" }
  ];

  function applyTheme(id){
    const theme = THEMES.find(t => t.id === id) || THEMES[0];
    document.documentElement.setAttribute("data-theme", theme.id);
    const color = theme.accentHex;
    try { document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color); } catch(_){}
    localStorage.setItem(THEME_KEY, theme.id);
    window._currentTheme = theme;
    document.dispatchEvent(new CustomEvent("folva-theme-changed", { detail: theme }));
  }

  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved || "folva");

  function styleLabel(s){ return { Classic:"🟡 كلاسيكي", Business:"💼 أعمال", Luxury:"👑 فاخر", Warm:"🔥 دافئ", Fresh:"💧 منتعش", Organic:"🌱 عضوي", "Warm Minimal":"🟠 مينيمالي", "Dark Lux":"✨ لكزس داكن", Soft:"🎀 هادئ", Minimal:"⬜ بسيط", Cozy:"☕ دافئ", Futuristic:"🚀 مستقبلي", Elegant:"🎩 أنيق", Vintage:"📻 كلاسيكي قديم", Clean:"💎 نظيف" }[s] || s; }
  function shadowLabel(s){ return { Light:"خفيفة", Medium:"متوسطة", Bold:"قوية", Soft:"ناعمة", Heavy:"ثقيلة", Glow:"متوهجة", Small:"صغيرة" }[s] || s; }

  function renderThemesGrid(){
    const grid = document.getElementById("themesGrid");
    const card = document.getElementById("currentThemeCard");
    const current = window._currentTheme || THEMES[0];
    if (grid){
      grid.innerHTML = THEMES.map((t,i) => `
        <div class="theme-card reveal ${t.id === current.id ? "active" : ""}" data-theme-id="${t.id}" style="animation-delay:${Math.min(i*35,350)}ms">
          <div class="theme-preview" data-theme-preview="${t.id}">
            <div class="tp-bar"></div>
            <div class="tp-hero"></div>
            <div class="tp-cards"><span></span><span></span><span></span></div>
          </div>
          <div class="theme-body">
            <div class="theme-name">${t.emoji} ${t.name}</div>
            <div class="theme-desc">${t.desc}</div>
            <div class="theme-meta">
              <span class="theme-chip color" style="--theme-accent:${t.accentHex}"></span>
              <span class="theme-chip">${styleLabel(t.style)}</span>
              <span class="theme-chip">R ${t.radiusPx}</span>
            </div>
            <button class="theme-switch-btn" data-apply-theme="${t.id}" type="button">
              ${t.id === current.id ? "✓ التصميم النشط" : "تطبيق التصميم"}
            </button>
          </div>
        </div>
      `).join("");
    }
    if (card){
      document.getElementById("currentThemeName").textContent = `${current.emoji} ${current.name}`;
      document.getElementById("currentThemeDesc").textContent = current.desc;
      document.getElementById("currentThemeStyle").textContent = styleLabel(current.style);
      document.getElementById("currentThemeRadius").textContent = "• نصف قطر: " + current.radiusPx + "px";
      document.getElementById("currentThemeShadows").textContent = "• ظلال: " + shadowLabel(current.shadows);
    }
  }

  document.addEventListener("click", (e) => {
    const apply = e.target.closest("[data-apply-theme], [data-theme-id]");
    if (apply){
      const id = (apply.dataset.applyTheme || apply.dataset.themeId || "").toString();
      if (!id) return;
      const target = THEMES.find(t => t.id === id);
      if (!target) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      applyTheme(id);
      renderThemesGrid();
      toast(`✓ تم تطبيق «${target.name}» على كامل الموقع`);
      return;
    }
    if (e.target.closest("#resetThemeDefault")){
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!requireAdminOrAlert?.()) return;
      if (!confirm("إعادة التصميم الافتراضي الأصلي؟")) return;
      applyTheme("folva");
      renderThemesGrid();
      toast("✓ تم استعادة التصميم الافتراضي FOLVA");
      return;
    }
    if (e.target.closest("#exportTheme")){
      e.preventDefault();
      e.stopImmediatePropagation();
      const cur = window._currentTheme || THEMES[0];
      if (window._redesignHelpers?.exportJSON){
        window._redesignHelpers.exportJSON(`folva-theme-${cur.id}.json`, cur);
      }
      toast(`✓ تم تصدير تصميم «${cur.name}»`);
      return;
    }
    if (e.target.closest("#adminLogoutTop")){
      e.preventDefault();
      e.stopImmediatePropagation();
      localStorage.removeItem(SESSION);
      if (typeof showPublic === "function") showPublic();
      if (typeof window.closeAuth !== "undefined") window.closeAuth?.();
      document.dispatchEvent(new Event("folva-change"));
      toast("✓ تم تسجيل خروج المدير بنجاح");
      return;
    }
  }, true);

  const origRenderAdmin = typeof renderAdmin === "function" ? renderAdmin : null;
  function renderAdminThemes(){
    if (origRenderAdmin) try { origRenderAdmin(); } catch(err){}
    renderThemesGrid();
  }
  if (typeof window !== "undefined") {
    if (typeof renderAdmin === "function") {
      window.renderAdmin = renderAdminThemes;
    } else {
      window.renderAdmin = renderAdminThemes;
    }
    window._themes = THEMES;
    window._applyTheme = applyTheme;
  }
})();