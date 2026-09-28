"use strict";

require("dotenv").config();
const bcrypt = require("bcryptjs");
const crypto = require("node:crypto");
const express = require("express");
const session = require("express-session");
const connectPgSimple = require("connect-pg-simple");
const multer = require("multer");
const { rateLimit } = require("express-rate-limit");
const { pool, initializeDatabase } = require("./db");
const {
  getStateForActor,
  migrateLocalState,
  publicMember,
  saveStateAsActor
} = require("./state-store");

const app = express();
const port = Number(process.env.PORT) || 3000;
const root = __dirname;
const adminEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const adminPasswordHash = String(process.env.ADMIN_PASSWORD_HASH || "");
const sessionSecret = String(process.env.SESSION_SECRET || "");
const PgSessionStore = connectPgSimple(session);
const mediaUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024, files: 1 } });
const privateFiles = new Set([
  "/.env",
  "/1.env",
  "/.gitignore",
  "/render.yaml",
  "/package.json",
  "/package-lock.json",
  "/server.js",
  "/db.js",
  "/state-store.js"
]);

app.disable("x-powered-by");
app.set("trust proxy", process.env.NODE_ENV === "production" ? 1 : false);
app.use(express.json({ limit: "8mb" }));
app.use(session({
  name: "folva.sid",
  store: new PgSessionStore({ pool, tableName: "folva_sessions", createTableIfMissing: true }),
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/"
  }
}));

app.use((request, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("X-Frame-Options", "DENY");

  let pathname;
  try {
    pathname = decodeURIComponent(request.path);
  } catch {
    response.sendStatus(400);
    return;
  }

  if (privateFiles.has(pathname) || pathname.split("/").includes("node_modules")) {
    response.sendStatus(404);
    return;
  }
  if (pathname === "/index.html" || pathname === "/service-worker.js" || pathname === "/manifest.webmanifest") {
    response.setHeader("Cache-Control", "no-cache");
  }
  if (pathname === "/manifest.webmanifest") response.type("application/manifest+json");
  next();
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة." }
});

function currentActor(request) {
  return request.session.auth || null;
}

function requireAuth(request, response, next) {
  if (!currentActor(request)) return response.status(401).json({ error: "يلزم تسجيل الدخول" });
  next();
}

function requireAdmin(request, response, next) {
  if (currentActor(request)?.role !== "admin") return response.status(403).json({ error: "صلاحية المدير مطلوبة" });
  next();
}

function setSession(request, auth) {
  return new Promise((resolve, reject) => {
    request.session.regenerate(error => {
      if (error) return reject(error);
      request.session.auth = auth;
      request.session.save(saveError => saveError ? reject(saveError) : resolve());
    });
  });
}

function endSession(request, response) {
  return new Promise(resolve => {
    if (!request.session) {
      response.clearCookie("folva.sid", { path: "/", sameSite: "strict", secure: process.env.NODE_ENV === "production" });
      resolve();
      return;
    }
    request.session.destroy(() => {
      response.clearCookie("folva.sid", { path: "/", sameSite: "strict", secure: process.env.NODE_ENV === "production" });
      resolve();
    });
  });

}

function sendError(response, error, fallback = "تعذر إكمال الطلب") {
  if (error.code === "23505") return response.status(409).json({ error: "يوجد حساب مسجل بهذا البريد الإلكتروني" });
  if (error.message?.startsWith("Cannot ") || error.message?.startsWith("Invalid ") || error.message?.startsWith("Administrator ") || error.message === "Member list is read-only") {
    return response.status(403).json({ error: "التغيير غير مسموح لهذه الصلاحية" });
  }
  console.error(error);
  return response.status(500).json({ error: fallback });
}

app.get("/api/health", async (request, response) => {
  try {
    await pool.query("SELECT 1");
    response.json({ status: "ok", database: "connected" });
  } catch (error) {
    console.error("Health check database failure", error);
    response.status(503).json({ status: "unavailable" });
  }
});

app.get("/api/auth/me", async (request, response) => {
  const auth = currentActor(request);
  if (!auth) return response.json({ authenticated: false });
  if (auth.role === "admin") {
    return response.json({ authenticated: true, role: "admin", user: { id: "folva-admin", email: adminEmail, name: "صاحب الموقع", ownerProfile: true } });
  }
  try {
    const result = await pool.query("SELECT id, email, profile, blocked, verified, created_at FROM members WHERE id = $1", [auth.id]);
    const user = result.rows[0];
    if (!user || user.blocked) {
      await endSession(request, response);
      return response.json({ authenticated: false });
    }
    response.json({ authenticated: true, role: "member", user: publicMember(user) });
  } catch (error) {
    sendError(response, error);
  }
});

app.post("/api/auth/signup", authLimiter, async (request, response) => {
  const email = String(request.body?.email || "").trim().toLowerCase();
  const name = String(request.body?.name || "").trim();
  const password = String(request.body?.password || "");
  const age = Number(request.body?.age);
  const gender = String(request.body?.gender || "prefer-not");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email === adminEmail) return response.status(400).json({ error: "بيانات الحساب غير صالحة" });
  if (!name || name.length > 48 || password.length < 8 || password.length > 128 || !Number.isInteger(age) || age < 13 || age > 120) {
    return response.status(400).json({ error: "تحقق من الاسم والعمر وكلمة المرور (8 أحرف على الأقل)" });
  }
  if (!new Set(["male", "female", "prefer-not"]).has(gender)) return response.status(400).json({ error: "قيمة الجنس غير صالحة" });

  try {
  const state = await getStateForActor(null);
  if (state.state.settings?.allowSignup === false) return response.status(403).json({ error: "تسجيل الأعضاء مغلق حاليًا" });
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  const profile = { name, age, gender, bio: "", avatarKey: "", coverKey: "", following: [], favorites: [], createdAt };
  const passwordHash = await bcrypt.hash(password, 12);
    await pool.query(
      "INSERT INTO members (id, email, password_hash, profile) VALUES ($1, $2, $3, $4::jsonb)",
      [id, email, passwordHash, JSON.stringify(profile)]
  );
  await setSession(request, { role: "member", id, email });
  response.status(201).json({ user: { id, email, ...profile }, role: "member" });
  } catch (error) {
    sendError(response, error, "تعذر إنشاء الحساب");
  }
});

app.post("/api/auth/login", authLimiter, async (request, response) => {
  const email = String(request.body?.email || "").trim().toLowerCase();
  const password = String(request.body?.password || "");
  if (!email || !password || password.length > 128) return response.status(400).json({ error: "البريد أو كلمة المرور غير صحيحة" });

  try {
    if (email === adminEmail && adminPasswordHash) {
      const valid = await bcrypt.compare(password, adminPasswordHash);
      if (valid) {
        await setSession(request, { role: "admin", email: adminEmail });
        return response.json({ role: "admin", user: { id: "folva-admin", email: adminEmail, name: "صاحب الموقع", ownerProfile: true } });
      }
      return response.status(401).json({ error: "البريد أو كلمة المرور غير صحيحة" });
    }

    const result = await pool.query("SELECT id, email, password_hash, profile, blocked, verified, created_at FROM members WHERE email = $1", [email]);
  const user = result.rows[0];
  let valid = false;
  if (user?.password_hash?.startsWith("legacy:")) {
  const digest = crypto.createHash("sha256").update(password).digest("hex");
  valid = crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(user.password_hash.slice(7)));
  if (valid) {
        const upgraded = await bcrypt.hash(password, 12);
        await pool.query("UPDATE members SET password_hash = $2, updated_at = NOW() WHERE id = $1", [user.id, upgraded]);
      }
    } else if (user?.password_hash) {
      valid = await bcrypt.compare(password, user.password_hash);
    }
    if (!valid || !user || user.blocked) return response.status(401).json({ error: "البريد أو كلمة المرور غير صحيحة" });
    await setSession(request, { role: "member", id: user.id, email: user.email });
    response.json({ role: "member", user: publicMember(user) });
  } catch (error) {
    sendError(response, error, "تعذر تسجيل الدخول");
  }
});

app.post("/api/auth/logout", async (request, response) => {
  await endSession(request, response);
  response.status(204).end();
});

app.post("/api/media", requireAuth, mediaUpload.single("file"), async (request, response) => {
  const file = request.file;
  if (!file) return response.status(400).json({ error: "اختر ملفًا أولًا" });
  const allowedTypes = new Set([
    "image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/x-icon",
    "video/mp4", "video/webm", "video/quicktime"
  ]);
  if (!allowedTypes.has(file.mimetype)) return response.status(415).json({ error: "نوع الملف غير مدعوم" });
  try {
    const id = crypto.randomUUID();
    const ownerId = currentActor(request).role === "admin" ? `admin:${adminEmail}` : currentActor(request).id;
    await pool.query(
      "INSERT INTO media_assets (id, owner_id, content_type, filename, data) VALUES ($1, $2, $3, $4, $5)",
      [id, ownerId, file.mimetype, path.basename(file.originalname).slice(0, 200) || "upload", file.buffer]
    );
    response.status(201).json({ id, contentType: file.mimetype });
  } catch (error) {
    sendError(response, error, "تعذر حفظ الملف");
  }
});

app.get("/api/media/:id", async (request, response) => {
  if (!/^[0-9a-f-]{36}$/i.test(request.params.id)) return response.sendStatus(404);
  try {
    const result = await pool.query("SELECT content_type, data FROM media_assets WHERE id = $1", [request.params.id]);
    const asset = result.rows[0];
    if (!asset) return response.sendStatus(404);
    response.setHeader("Content-Type", asset.content_type);
    response.setHeader("Content-Length", asset.data.length);
    response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.send(asset.data);
  } catch (error) {
    sendError(response, error, "تعذر تحميل الملف");
  }
});

app.get("/api/state", async (request, response) => {
  try {
    response.json(await getStateForActor(currentActor(request)));
  } catch (error) {
    sendError(response, error, "تعذر تحميل بيانات الموقع");
  }
});

app.put("/api/state", requireAuth, async (request, response) => {
  try {
    await saveStateAsActor(request.body, currentActor(request));
    response.json({ saved: true });
  } catch (error) {
    sendError(response, error, "تعذر حفظ البيانات");
  }
});

app.post("/api/admin/migrate-local", requireAdmin, async (request, response) => {
  try {
    const migrated = await migrateLocalState(request.body?.state);
    response.json({ migrated });
  } catch (error) {
    sendError(response, error, "تعذر نقل البيانات المحلية");
  }
});

app.use(express.static(root, { dotfiles: "deny", index: "index.html", maxAge: 0 }));
app.use((error, request, response, next) => {
  if (error instanceof multer.MulterError) return response.status(413).json({ error: "حجم الملف يتجاوز الحد المسموح (40MB)" });
  console.error(error);
  response.status(500).json({ error: "حدث خطأ غير متوقع" });
});
app.use((request, response) => response.sendStatus(404));

async function start() {
  if (sessionSecret.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters");
  if (process.env.NODE_ENV === "production" && (!adminEmail || !adminPasswordHash.startsWith("$2"))) {
    throw new Error("Configure ADMIN_EMAIL and a bcrypt ADMIN_PASSWORD_HASH in Render");
  }
  await initializeDatabase();
  app.listen(port, "0.0.0.0", () => console.log(`FOLVA server listening on port ${port}`));
}

start().catch(error => {
  console.error("FOLVA server startup failed", error);
  process.exit(1);
});
