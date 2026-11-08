require("dotenv").config();

const express = require("express");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "development-only-change-this-secret";

const dataDir = path.join(__dirname, "data");
const fs = require("fs");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "donation-connect.db"));
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin','donor','recipient')),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS drives (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    target_amount REAL NOT NULL DEFAULT 0,
    raised_amount REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS donations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    donor_id INTEGER NOT NULL,
    drive_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    note TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'confirmed',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(donor_id) REFERENCES users(id),
    FOREIGN KEY(drive_id) REFERENCES drives(id)
  );

  CREATE TABLE IF NOT EXISTS help_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    people_count INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'pending',
    admin_note TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(recipient_id) REFERENCES users(id)
  );
`);

function seed() {
  const userCount = db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
  if (userCount === 0) {
    const insertUser = db.prepare(
      "INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)"
    );
    const seedUsers = [
      ["Admin User", "admin@donationconnect.test", "Admin@123", "admin"],
      ["Demo Donor", "donor@donationconnect.test", "Donor@123", "donor"],
      ["Demo Recipient", "recipient@donationconnect.test", "Recipient@123", "recipient"]
    ];
    for (const [name, email, password, role] of seedUsers) {
      insertUser.run(name, email, bcrypt.hashSync(password, 10), role);
    }
  }

  const driveCount = db.prepare("SELECT COUNT(*) AS count FROM drives").get().count;
  if (driveCount === 0) {
    const insertDrive = db.prepare(
      "INSERT INTO drives (title,description,category,target_amount,raised_amount) VALUES (?,?,?,?,?)"
    );
    insertDrive.run("Flood Relief Support", "Food kits, clean water and emergency essentials for families affected by floods.", "Emergency", 100000, 62500);
    insertDrive.run("Education for Every Child", "School supplies, books and learning resources for children in need.", "Education", 75000, 28000);
    insertDrive.run("Community Food Drive", "Support nutritious meal distribution for vulnerable families.", "Food", 50000, 18500);
  }
}
seed();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Please sign in to continue." });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Your session has expired. Please sign in again." });
  }
}

function allow(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "You do not have permission for this action." });
    }
    next();
  };
}

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Email and password are required." });

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(String(email).trim().toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: "8h" }
  );
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role }
  });
});

app.post("/api/auth/register", (req, res) => {
  const { name, email, password, role } = req.body || {};
  if (!name || !email || !password || !role) return res.status(400).json({ error: "All fields are required." });
  if (!["donor", "recipient"].includes(role)) return res.status(400).json({ error: "Choose donor or recipient registration." });
  if (String(password).length < 8) return res.status(400).json({ error: "Password must contain at least 8 characters." });

  try {
    const result = db.prepare(
      "INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)"
    ).run(String(name).trim(), String(email).trim().toLowerCase(), bcrypt.hashSync(password, 10), role);
    const user = { id: result.lastInsertRowid, name: String(name).trim(), email: String(email).trim().toLowerCase(), role };
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: "8h" });
    res.status(201).json({ token, user });
  } catch (error) {
    if (String(error.code).includes("CONSTRAINT")) return res.status(409).json({ error: "An account with this email already exists." });
    res.status(500).json({ error: "Could not create account." });
  }
});

app.get("/api/me", auth, (req, res) => res.json({ user: req.user }));

app.get("/api/drives", (req, res) => {
  const drives = db.prepare("SELECT * FROM drives ORDER BY created_at DESC").all();
  res.json({ drives });
});

app.post("/api/drives", auth, allow("admin"), (req, res) => {
  const { title, description, category, target_amount } = req.body || {};
  const target = Number(target_amount);
  if (!title || !description || !category || !Number.isFinite(target) || target < 0) {
    return res.status(400).json({ error: "Enter a title, description, category and valid target amount." });
  }
  const result = db.prepare(
    "INSERT INTO drives (title,description,category,target_amount) VALUES (?,?,?,?)"
  ).run(title.trim(), description.trim(), category.trim(), target);
  res.status(201).json({ drive: db.prepare("SELECT * FROM drives WHERE id = ?").get(result.lastInsertRowid) });
});

app.patch("/api/drives/:id/status", auth, allow("admin"), (req, res) => {
  const { status } = req.body || {};
  if (!["active", "paused", "completed"].includes(status)) return res.status(400).json({ error: "Invalid drive status." });
  const result = db.prepare("UPDATE drives SET status = ? WHERE id = ?").run(status, Number(req.params.id));
  if (!result.changes) return res.status(404).json({ error: "Drive not found." });
  res.json({ success: true });
});

app.post("/api/donations", auth, allow("donor"), (req, res) => {
  const driveId = Number(req.body?.drive_id);
  const amount = Number(req.body?.amount);
  const note = String(req.body?.note || "").trim();
  if (!Number.isInteger(driveId) || !Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: "Choose a drive and enter an amount greater than zero." });
  }
  const drive = db.prepare("SELECT * FROM drives WHERE id = ? AND status = 'active'").get(driveId);
  if (!drive) return res.status(404).json({ error: "This drive is not currently active." });

  const insert = db.transaction(() => {
    const result = db.prepare(
      "INSERT INTO donations (donor_id,drive_id,amount,note) VALUES (?,?,?,?)"
    ).run(req.user.id, driveId, amount, note);
    db.prepare("UPDATE drives SET raised_amount = raised_amount + ? WHERE id = ?").run(amount, driveId);
    return result.lastInsertRowid;
  });
  const id = insert();
  res.status(201).json({ donation: db.prepare("SELECT * FROM donations WHERE id = ?").get(id) });
});

app.get("/api/donations/mine", auth, allow("donor"), (req, res) => {
  const donations = db.prepare(`
    SELECT donations.*, drives.title AS drive_title
    FROM donations JOIN drives ON drives.id = donations.drive_id
    WHERE donations.donor_id = ? ORDER BY donations.created_at DESC
  `).all(req.user.id);
  res.json({ donations });
});

app.post("/api/requests", auth, allow("recipient"), (req, res) => {
  const { title, description, category, people_count } = req.body || {};
  const count = Number(people_count || 1);
  if (!title || !description || !category || !Number.isInteger(count) || count < 1) {
    return res.status(400).json({ error: "Complete all request fields with a valid people count." });
  }
  const result = db.prepare(
    "INSERT INTO help_requests (recipient_id,title,description,category,people_count) VALUES (?,?,?,?,?)"
  ).run(req.user.id, title.trim(), description.trim(), category.trim(), count);
  res.status(201).json({ request: db.prepare("SELECT * FROM help_requests WHERE id = ?").get(result.lastInsertRowid) });
});

app.get("/api/requests/mine", auth, allow("recipient"), (req, res) => {
  const requests = db.prepare(
    "SELECT * FROM help_requests WHERE recipient_id = ? ORDER BY created_at DESC"
  ).all(req.user.id);
  res.json({ requests });
});

app.get("/api/admin/overview", auth, allow("admin"), (req, res) => {
  const stats = {
    users: db.prepare("SELECT COUNT(*) AS count FROM users").get().count,
    donors: db.prepare("SELECT COUNT(*) AS count FROM users WHERE role='donor'").get().count,
    recipients: db.prepare("SELECT COUNT(*) AS count FROM users WHERE role='recipient'").get().count,
    drives: db.prepare("SELECT COUNT(*) AS count FROM drives").get().count,
    donations: db.prepare("SELECT COUNT(*) AS count FROM donations").get().count,
    totalRaised: db.prepare("SELECT COALESCE(SUM(amount),0) AS total FROM donations").get().total,
    pendingRequests: db.prepare("SELECT COUNT(*) AS count FROM help_requests WHERE status='pending'").get().count
  };
  res.json({ stats });
});

app.get("/api/admin/requests", auth, allow("admin"), (req, res) => {
  const requests = db.prepare(`
    SELECT help_requests.*, users.name AS recipient_name, users.email AS recipient_email
    FROM help_requests JOIN users ON users.id = help_requests.recipient_id
    ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC
  `).all();
  res.json({ requests });
});

app.patch("/api/admin/requests/:id", auth, allow("admin"), (req, res) => {
  const { status, admin_note } = req.body || {};
  if (!["approved", "rejected", "fulfilled"].includes(status)) return res.status(400).json({ error: "Invalid request status." });
  const result = db.prepare("UPDATE help_requests SET status = ?, admin_note = ? WHERE id = ?")
    .run(status, String(admin_note || "").trim(), Number(req.params.id));
  if (!result.changes) return res.status(404).json({ error: "Request not found." });
  res.json({ success: true });
});

app.get("/api/admin/donations", auth, allow("admin"), (req, res) => {
  const donations = db.prepare(`
    SELECT donations.*, users.name AS donor_name, drives.title AS drive_title
    FROM donations
    JOIN users ON users.id = donations.donor_id
    JOIN drives ON drives.id = donations.drive_id
    ORDER BY donations.created_at DESC
  `).all();
  res.json({ donations });
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => {
  console.log(`Donation Connect running at http://localhost:${PORT}`);
  console.log("Demo accounts: admin@donationconnect.test / Admin@123");
});
