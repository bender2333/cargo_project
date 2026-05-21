import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = path.join(__dirname, 'database.db')

const db = new Database(dbPath)

// 1. Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    disabled INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS history_plans (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    project_name TEXT NOT NULL,
    shipment_name TEXT,
    loading_mode TEXT DEFAULT 'volume',
    data TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS custom_containers (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    length REAL NOT NULL,
    width REAL NOT NULL,
    height REAL NOT NULL,
    max_weight REAL NOT NULL,
    door_gap REAL DEFAULT 0,
    top_gap REAL DEFAULT 0,
    side_gap REAL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`)

// 2. Initialize default admin account
const initAdmin = () => {
  const existing = db.prepare('SELECT * FROM users WHERE username = ?').get('admin')
  if (!existing) {
    const id = Math.random().toString(36).substring(2) + Date.now().toString(36)
    const salt = bcrypt.genSaltSync(10)
    const hash = bcrypt.hashSync('admin123', salt)
    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, disabled, created_at)
      VALUES (?, ?, ?, 'admin', 0, ?)
    `).run(id, 'admin', hash, new Date().toISOString())
    console.log('Default admin account initialized: admin / admin123')
  }
}

// 3. Initialize default test user account
const initTestUser = () => {
  const existing = db.prepare('SELECT * FROM users WHERE username = ?').get('testuser')
  if (!existing) {
    const id = Math.random().toString(36).substring(2) + Date.now().toString(36)
    const salt = bcrypt.genSaltSync(10)
    const hash = bcrypt.hashSync('testuser123', salt)
    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, disabled, created_at)
      VALUES (?, ?, ?, 'user', 0, ?)
    `).run(id, 'testuser', hash, new Date().toISOString())
    console.log('Default test user initialized: testuser / testuser123')
  }
}

initAdmin()
initTestUser()

export default db
