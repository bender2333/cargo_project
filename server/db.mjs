import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import path from 'path'
import { randomUUID } from 'crypto'
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

  CREATE TABLE IF NOT EXISTS import_templates (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    mapping TEXT NOT NULL,
    units TEXT NOT NULL,
    header_row INTEGER DEFAULT 1,
    start_row INTEGER DEFAULT 2,
    merge_rows TEXT DEFAULT 'none',
    dimension_mode TEXT DEFAULT 'separate',
    combined_column TEXT,
    dimension_order TEXT DEFAULT '["length","width","height"]',
    defaults TEXT DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, name)
  );

  CREATE TABLE IF NOT EXISTS export_templates (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    columns TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, name)
  );

  CREATE TABLE IF NOT EXISTS custom_cargo (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    label TEXT NOT NULL,
    length REAL NOT NULL,
    width REAL NOT NULL,
    height REAL NOT NULL,
    weight REAL NOT NULL,
    color TEXT NOT NULL,
    can_rotate INTEGER DEFAULT 1,
    stackable INTEGER DEFAULT 1,
    max_stack_layers INTEGER,
    created_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`)

// 1a. Schema migrations (idempotent, version-tracked via PRAGMA user_version)
const hasColumn = (table, column) => {
  const cols = db.pragma(`table_info(${table})`)
  return cols.some((c) => c.name === column)
}

const migrations = [
  // Migration 1: add admin audit fields to users table
  {
    version: 1,
    description: 'Add last_login_at and last_login_ip to users',
    up: () => {
      if (!hasColumn('users', 'last_login_at')) {
        db.exec('ALTER TABLE users ADD COLUMN last_login_at TEXT')
      }
      if (!hasColumn('users', 'last_login_ip')) {
        db.exec('ALTER TABLE users ADD COLUMN last_login_ip TEXT')
      }
    },
  },
  // Migration 2: support per-user JWT invalidation on password change
  {
    version: 2,
    description: 'Add password_changed_at to users',
    up: () => {
      if (!hasColumn('users', 'password_changed_at')) {
        db.exec('ALTER TABLE users ADD COLUMN password_changed_at TEXT')
      }
    },
  },
  {
    version: 3,
    description: 'Add user-scoped import templates',
    up: () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS import_templates (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          mapping TEXT NOT NULL,
          units TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
          UNIQUE(user_id, name)
        )
      `)
    },
  },
  {
    version: 4,
    description: 'Add complete import template metadata',
    up: () => {
      if (!hasColumn('import_templates', 'header_row')) {
        db.exec('ALTER TABLE import_templates ADD COLUMN header_row INTEGER DEFAULT 1')
      }
      if (!hasColumn('import_templates', 'start_row')) {
        db.exec('ALTER TABLE import_templates ADD COLUMN start_row INTEGER DEFAULT 2')
      }
      if (!hasColumn('import_templates', 'merge_rows')) {
        db.exec("ALTER TABLE import_templates ADD COLUMN merge_rows TEXT DEFAULT 'none'")
      }
      if (!hasColumn('import_templates', 'defaults')) {
        db.exec("ALTER TABLE import_templates ADD COLUMN defaults TEXT DEFAULT '{}'")
      }
    },
  },
  {
    version: 5,
    description: 'Add user-scoped custom cargo library',
    up: () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS custom_cargo (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          label TEXT NOT NULL,
          length REAL NOT NULL,
          width REAL NOT NULL,
          height REAL NOT NULL,
          weight REAL NOT NULL,
          color TEXT NOT NULL,
          can_rotate INTEGER DEFAULT 1,
          stackable INTEGER DEFAULT 1,
          max_stack_layers INTEGER,
          created_at TEXT NOT NULL,
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `)
    },
  },
  {
    version: 6,
    description: 'Add irregular import template dimension metadata',
    up: () => {
      if (!hasColumn('import_templates', 'dimension_mode')) {
        db.exec("ALTER TABLE import_templates ADD COLUMN dimension_mode TEXT DEFAULT 'separate'")
      }
      if (!hasColumn('import_templates', 'combined_column')) {
        db.exec('ALTER TABLE import_templates ADD COLUMN combined_column TEXT')
      }
      if (!hasColumn('import_templates', 'dimension_order')) {
        db.exec('ALTER TABLE import_templates ADD COLUMN dimension_order TEXT DEFAULT \'[\"length\",\"width\",\"height\"]\'')
      }
    },
  },
  {
    version: 7,
    description: 'Add user-scoped export templates',
    up: () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS export_templates (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          columns TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
          UNIQUE(user_id, name)
        )
      `)
    },
  },
]

const runMigrations = () => {
  const currentVersion = db.pragma('user_version', { simple: true })
  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      const tx = db.transaction(() => {
        migration.up()
        db.pragma(`user_version = ${migration.version}`)
      })
      try {
        tx()
        console.log(`Migration ${migration.version} applied: ${migration.description}`)
      } catch (err) {
        console.error(`Migration ${migration.version} failed:`, err.message)
        throw err
      }
    }
  }
}

runMigrations()

const BCRYPT_COST = 12
const DEFAULT_ADMIN_PASSWORD = 'admin123'
const DEFAULT_TEST_PASSWORD = 'testuser123'

function hashPassword(plain) {
  const salt = bcrypt.genSaltSync(BCRYPT_COST)
  return bcrypt.hashSync(plain, salt)
}

// 2. Initialize default admin account
const initAdmin = () => {
  const desiredPassword = process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD
  const existing = db.prepare('SELECT id, password_hash FROM users WHERE username = ?').get('admin')
  const now = new Date().toISOString()
  if (!existing) {
    const id = randomUUID()
    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, disabled, created_at, password_changed_at)
      VALUES (?, ?, ?, 'admin', 0, ?, ?)
    `).run(id, 'admin', hashPassword(desiredPassword), now, now)
    if (desiredPassword === DEFAULT_ADMIN_PASSWORD) {
      console.warn('[security] admin account created with default password — set ADMIN_PASSWORD env var to override')
    } else {
      console.log('[security] admin account created with custom password from ADMIN_PASSWORD')
    }
    return
  }
  // If operator provided ADMIN_PASSWORD env, rotate to it (idempotent reset).
  if (process.env.ADMIN_PASSWORD) {
    const matches = bcrypt.compareSync(desiredPassword, existing.password_hash)
    if (!matches) {
      db.prepare('UPDATE users SET password_hash = ?, password_changed_at = ? WHERE id = ?')
        .run(hashPassword(desiredPassword), now, existing.id)
      console.log('[security] admin password rotated from ADMIN_PASSWORD env')
    }
  } else if (process.env.NODE_ENV === 'production') {
    console.warn('[security] admin account exists but ADMIN_PASSWORD not set — password may still be the default')
  }
}

// 3. Initialize default test user account (dev / E2E support; skipped if SKIP_TESTUSER=1)
const initTestUser = () => {
  if (process.env.SKIP_TESTUSER === '1') return
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get('testuser')
  if (!existing) {
    const id = randomUUID()
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, disabled, created_at, password_changed_at)
      VALUES (?, ?, ?, 'user', 0, ?, ?)
    `).run(id, 'testuser', hashPassword(DEFAULT_TEST_PASSWORD), now, now)
    console.log('[security] testuser seeded (set SKIP_TESTUSER=1 to disable)')
  }
}

initAdmin()
initTestUser()

export default db
