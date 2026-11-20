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
  "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','staff')))",
  "CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, label TEXT NOT NULL, last_seen INTEGER NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id))",
  "CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT NOT NULL, stored_name TEXT NOT NULL, size INTEGER NOT NULL, created_at INTEGER NOT NULL, FOREIGN KEY(owner_id) REFERENCES users(id))"
].join(";"));
if (!db.prepare("SELECT id FROM users WHERE email=?").get(adminEmail)) {
  db.prepare("INSERT INTO users(id,email,password_hash,role) VALUES(?,?,?,?)")
    .run(crypto.randomUUID(), adminEmail, bcrypt.hashSync(adminPassword, 12), "admin");
}

function auth(req, res, next) {
  try {
    const raw = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const claims = jwt.verify(raw, secret);
    const user = db.prepare("SELECT id,email,role FROM users WHERE id=?").get(claims.sub);
    if (!user) return res.status(401).json({ error: "Account no longer exists." });
    req.user = user;
    next();
  } catch { res.status(401).json({ error: "Sign-in required." }); }
}
function adminOnly(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admin access required." });
  next();
}

app.get("/health", (_req, res) => res.json({ ok: true, service: "team-work" }));
app.post("/api/login", (req, res) => {
  const email = String(req.body.email || "").toLowerCase().trim();
  const password = String(req.body.password || "");
  const role = String(req.body.role || "");
  const user = db.prepare("SELECT * FROM users WHERE email=?").get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash) || user.role !== role)
    return res.status(401).json({ error: "Email, password, or app role is incorrect." });
  const token = jwt.sign({ sub: user.id, role: user.role }, secret, { expiresIn: "12h", issuer: "team-work" });
  res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
});
app.post("/api/staff", auth, adminOnly, (req, res) => {
  const email = String(req.body.email || "").toLowerCase().trim();
  const password = String(req.body.password || "");
  if (!email.includes("@") || password.length < 12)
    return res.status(400).json({ error: "Use a valid email and temporary password of at least 12 characters." });
  try {
    const id = crypto.randomUUID();
    db.prepare("INSERT INTO users(id,email,password_hash,role) VALUES(?,?,?,'staff')")
      .run(id, email, bcrypt.hashSync(password, 12));
    res.status(201).json({ id, email, role: "staff" });
  } catch { res.status(409).json({ error: "That email already has an account." }); }
});
app.post("/api/heartbeat", auth, (req, res) => {
  const deviceId = String(req.body.deviceId || req.user.id).slice(0, 100);
  const label = String(req.body.label || "Android device").slice(0, 100);
  db.prepare("INSERT INTO devices(id,user_id,label,last_seen) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id,label=excluded.label,last_seen=excluded.last_seen")
    .run(deviceId, req.user.id, label, Date.now());
  res.json({ ok: true });
});
app.get("/api/devices", auth, adminOnly, (_req, res) => {
  const rows = db.prepare("SELECT d.id,d.label,d.last_seen,u.email FROM devices d JOIN users u ON u.id=d.user_id ORDER BY d.last_seen DESC").all();
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
  const rows = db.prepare("SELECT f.id,f.name,f.size,f.created_at,u.email AS owner FROM files f JOIN users u ON u.id=f.owner_id ORDER BY f.created_at DESC LIMIT 500").all();
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
