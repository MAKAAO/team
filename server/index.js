const express = require("express");
const helmet = require("helmet");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const Database = require("better-sqlite3");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(express.json({ limit: "1mb" }));
const port = Number(process.env.PORT || 8080);
const secret = process.env.JWT_SECRET;
const adminEmail = (process.env.ADMIN_EMAIL || "").toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD || "";
const dataDir = process.env.DATA_DIR || path.join(__dirname, "data");
const uploadDir = path.join(dataDir, "files");
fs.mkdirSync(uploadDir, { recursive: true });
if (!secret || secret.length < 32) throw new Error("Set JWT_SECRET to a random value of at least 32 characters.");
if (!adminEmail || adminPassword.length < 12) throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD (12+ characters).");

const db = new Database(path.join(dataDir, "team.sqlite"));
db.pragma("journal_mode = WAL");
db.exec([
  "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','staff')), display_name TEXT)",
  "CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, label TEXT NOT NULL, last_seen INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id))",
  "CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT NOT NULL, stored_name TEXT NOT NULL, size INTEGER NOT NULL, created_at INTEGER NOT NULL, FOREIGN KEY(owner_id) REFERENCES users(id))",
  "CREATE TABLE IF NOT EXISTS pairing_codes (code_hash TEXT PRIMARY KEY, created_by TEXT NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER)"
].join(";"));
const userColumns = db.prepare("PRAGMA table_info(users)").all().map(row => row.name);
if (!userColumns.includes("display_name")) db.exec("ALTER TABLE users ADD COLUMN display_name TEXT");
if (!db.prepare("SELECT id FROM users WHERE email=?").get(adminEmail)) {
  db.prepare("INSERT INTO users(id,email,password_hash,role,display_name) VALUES(?,?,?,?,'Administrator')")
    .run(crypto.randomUUID(), adminEmail, bcrypt.hashSync(adminPassword, 12), "admin");
}

function auth(req, res, next) {
  try {
    const raw = (req.headers.authorization || "").replace(/^Bearer\\s+/i, "");
    const claims = jwt.verify(raw, secret);
    const user = db.prepare("SELECT id,email,role,display_name FROM users WHERE id=?").get(claims.sub);
    if (!user) return res.status(401).json({ error: "Account no longer exists." });
    req.user = user;
    next();
  } catch { res.status(401).json({ error: "Sign-in required." }); }
}
function adminOnly(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admin access required." });
  next();
}
function issueToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, secret, { expiresIn: "12h", issuer: "team-work" });
}

app.get("/health", (_req, res) => res.json({ ok: true, service: "team-work" }));
app.post("/api/login", (req, res) => {
  const email = String(req.body.email || "").toLowerCase().trim();
  const password = String(req.body.password || "");
  const role = String(req.body.role || "");
  const user = db.prepare("SELECT * FROM users WHERE email=?").get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash) || user.role !== role)
    return res.status(401).json({ error: "Email, password, or app role is incorrect." });
  res.json({ token: issueToken(user), user: { id: user.id, email: user.email, role: user.role, displayName: user.display_name } });
});

// Admin generates a short-lived, single-use pairing code; it is never stored in plain text.
app.post("/api/pairing-codes", auth, adminOnly, (req, res) => {
  const code = crypto.randomBytes(5).toString("hex").toUpperCase();
  const expiresAt = Date.now() + 10 * 60 * 1000;
  db.prepare("INSERT INTO pairing_codes(code_hash,created_by,expires_at) VALUES(?,?,?)")
    .run(crypto.createHash("sha256").update(code).digest("hex"), req.user.id, expiresAt);
  res.status(201).json({ code, expiresAt });
});

// Staff enrollment needs only the code issued inside the authenticated admin app and a display name.
app.post("/api/pair", (req, res) => {
  const code = String(req.body.code || "").replace(/[^a-f0-9]/ig, "").toUpperCase();
  const displayName = String(req.body.displayName || "").trim().slice(0, 80);
  if (code.length !== 10 || displayName.length < 2)
    return res.status(400).json({ error: "Enter the admin pairing code and your name." });
  const hash = crypto.createHash("sha256").update(code).digest("hex");
  try {
    const createPairedUser = db.transaction(() => {
      const invite = db.prepare("SELECT * FROM pairing_codes WHERE code_hash=?").get(hash);
      if (!invite || invite.used_at || invite.expires_at < Date.now()) throw new Error("PAIR_CODE_INVALID");
      const claimed = db.prepare("UPDATE pairing_codes SET used_at=? WHERE code_hash=? AND used_at IS NULL AND expires_at>=?")
        .run(Date.now(), hash, Date.now());
      if (claimed.changes !== 1) throw new Error("PAIR_CODE_INVALID");
      const id = crypto.randomUUID();
      const email = "staff-" + id + "@team.local";
      const randomPassword = crypto.randomBytes(32).toString("hex");
      db.prepare("INSERT INTO users(id,email,password_hash,role,display_name) VALUES(?,?,?,'staff',?)")
        .run(id, email, bcrypt.hashSync(randomPassword, 12), displayName);
      return { id, email, role: "staff", displayName };
    });
    const user = createPairedUser();
    res.status(201).json({ token: issueToken(user), user });
  } catch (error) {
    if (error.message === "PAIR_CODE_INVALID") return res.status(410).json({ error: "Pairing code is invalid, expired, or already used." });
    res.status(500).json({ error: "Could not complete device pairing." });
  }
});
app.post("/api/heartbeat", auth, (req, res) => {
  const deviceId = String(req.body.deviceId || req.user.id).slice(0, 100);
  const label = String(req.body.label || "Android device").slice(0, 100);
  db.prepare("INSERT INTO devices(id,user_id,label,last_seen) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id,label=excluded.label,last_seen=excluded.last_seen")
    .run(deviceId, req.user.id, label, Date.now());
  res.json({ ok: true });
});
app.get("/api/devices", auth, adminOnly, (_req, res) => {
  const rows = db.prepare("SELECT d.id,d.label,d.last_seen,u.email,u.display_name FROM devices d JOIN users u ON u.id=d.user_id ORDER BY d.last_seen DESC").all();
  res.json(rows.map(row => Object.assign({}, row, { online: Date.now() - row.last_seen < 90000 })));
});
const upload = multer({ dest: uploadDir, limits: { fileSize: 100 * 1024 * 1024 } });
app.post("/api/files", auth, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Choose one file to share." });
  const id = crypto.randomUUID();
  const name = path.basename(req.file.originalname).slice(0, 240) || "shared-file";
  db.prepare("INSERT INTO files(id,owner_id,name,stored_name,size,created_at) VALUES(?,?,?,?,?,?)")
    .run(id, req.user.id, name, req.file.filename, req.file.size, Date.now());
  res.status(201).json({ id, name, size: req.file.size });
});
app.get("/api/files", auth, (_req, res) => {
  const rows = db.prepare("SELECT f.id,f.name,f.size,f.created_at,u.email AS owner,u.display_name AS owner_name FROM files f JOIN users u ON u.id=f.owner_id ORDER BY f.created_at DESC LIMIT 500").all();
  res.json(rows);
});
app.get("/api/files/:id/download", auth, (req, res) => {
  const row = db.prepare("SELECT * FROM files WHERE id=?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "File not found." });
  const diskPath = path.join(uploadDir, row.stored_name);
  if (!fs.existsSync(diskPath)) return res.status(404).json({ error: "Stored file is missing." });
  res.download(diskPath, row.name);
});
app.listen(port, "0.0.0.0", () => console.log("Team Work API listening on port " + port));
