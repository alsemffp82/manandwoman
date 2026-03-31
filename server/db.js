import { DatabaseSync } from 'node:sqlite';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import bcrypt from 'bcryptjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Railway Volume: DB_PATH=/data/geulter.db  /  로컬: 기본값 ./geulter.db
const dbPath = process.env.DB_PATH || join(__dirname, 'geulter.db');

// DB 파일이 위치할 디렉토리가 없으면 자동 생성
mkdirSync(dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);

// 외래 키 활성화
db.exec('PRAGMA foreign_keys = ON;');

// ─── 테이블 생성 ───────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    email       TEXT    UNIQUE NOT NULL,
    password    TEXT    NOT NULL,
    role        TEXT    NOT NULL DEFAULT 'reader',
    avatar      TEXT    DEFAULT '🌸',
    bio         TEXT,
    status      TEXT    NOT NULL DEFAULT 'approved',
    is_admin    INTEGER NOT NULL DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS posts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    author_id   INTEGER NOT NULL,
    title       TEXT    NOT NULL,
    content     TEXT    NOT NULL,
    excerpt     TEXT,
    image       TEXT,
    music_title TEXT,
    tags        TEXT    DEFAULT '[]',
    read_time   TEXT,
    likes       INTEGER DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS comments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id     INTEGER NOT NULL,
    author_id   INTEGER NOT NULL,
    content     TEXT    NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id)   REFERENCES posts(id)  ON DELETE CASCADE,
    FOREIGN KEY (author_id) REFERENCES users(id)  ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    token       TEXT    NOT NULL UNIQUE,
    expires_at  DATETIME NOT NULL,
    used        INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// ─── 기존 DB 마이그레이션 (컬럼 없으면 추가) ──────────────────────────────────
const migrations = [
  "ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'",
  "ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0",
];
for (const sql of migrations) {
  try { db.exec(sql); } catch { /* 이미 존재하면 무시 */ }
}

// ─── 어드민 계정 시딩 ──────────────────────────────────────────────────────────
function seedAdmin() {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get('martinchonz@gmail.com');
  if (!existing) {
    const hashed = bcrypt.hashSync('821221', 10);
    db.prepare(`
      INSERT INTO users (name, email, password, role, avatar, bio, status, is_admin)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('Martin', 'martinchonz@gmail.com', hashed, 'writer', '👑', '글터 관리자', 'approved', 1);
    console.log('✅ 어드민 계정 생성: martinchonz@gmail.com');
  } else {
    // 기존 계정이면 어드민 권한 부여
    db.prepare("UPDATE users SET is_admin = 1, status = 'approved' WHERE email = ?")
      .run('martinchonz@gmail.com');
  }
}

seedAdmin();

export default db;
