import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import db from './db.js';
import { sendWelcomeEmail, sendPasswordResetEmail } from './mailer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'geulter-dev-secret-2026';

app.use(cors());
app.use(express.json());

// ══════════════════════════════════════════════════════════════════════════════
// 미들웨어
// ══════════════════════════════════════════════════════════════════════════════

function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: '로그인이 필요합니다.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: '유효하지 않은 토큰입니다.' });
  }
}

function adminAuth(req, res, next) {
  auth(req, res, () => {
    const u = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.user.id);
    if (!u?.is_admin) return res.status(403).json({ error: '어드민 권한이 필요합니다.' });
    next();
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// 유틸
// ══════════════════════════════════════════════════════════════════════════════

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function formatPost(p) {
  return {
    id: p.id,
    authorId: p.author_id,
    title: p.title,
    content: p.content,
    excerpt: p.excerpt,
    image: p.image || null,
    music: p.music_title ? { title: p.music_title } : null,
    tags: JSON.parse(p.tags || '[]'),
    date: formatDate(p.created_at),
    readTime: p.read_time,
    likes: p.likes || 0,
    author: { name: p.author_name, avatar: p.author_avatar, bio: p.author_bio },
    updatedAt: p.updated_at,
  };
}

function safeUser(u) {
  const { password, ...rest } = u;
  return rest;
}

// ══════════════════════════════════════════════════════════════════════════════
// 인증 API
// ══════════════════════════════════════════════════════════════════════════════

// 회원가입
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, role, avatar } = req.body;
  if (!name || !email || !password || !role)
    return res.status(400).json({ error: '필수 항목을 입력하세요.' });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: '이미 사용 중인 이메일입니다.' });

  const hashed = bcrypt.hashSync(password, 10);
  const bio = role === 'writer' ? '새로운 작가입니다' : '글 읽기를 좋아합니다';
  // 작가는 pending, 독자는 바로 approved
  const status = role === 'writer' ? 'pending' : 'approved';

  const result = db.prepare(`
    INSERT INTO users (name, email, password, role, avatar, bio, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(name, email, hashed, role, avatar || '🌸', bio, status);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(result.lastInsertRowid));
  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

  // 가입 축하 이메일 (비동기, 에러가 응답을 막지 않도록)
  sendWelcomeEmail({ to: email, name, role }).catch(console.error);

  res.json({ user: safeUser(user), token });
});

// 로그인
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });

  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ user: safeUser(user), token });
});

// 내 정보
app.get('/api/auth/me', auth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
  res.json(safeUser(user));
});

// 회원 탈퇴
app.delete('/api/auth/account', auth, (req, res) => {
  db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
  res.json({ message: '계정이 삭제되었습니다.' });
});

// 비밀번호 재설정 요청
app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: '이메일을 입력하세요.' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  // 보안상 유저가 없어도 동일 응답
  if (user) {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1시간
    db.prepare(`
      INSERT INTO password_reset_tokens (user_id, token, expires_at)
      VALUES (?, ?, ?)
    `).run(user.id, token, expiresAt);

    sendPasswordResetEmail({ to: email, name: user.name, token }).catch(console.error);
  }

  res.json({ message: '재설정 링크를 이메일로 보냈습니다. (등록된 이메일인 경우)' });
});

// 비밀번호 재설정 실행
app.post('/api/auth/reset-password', (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.status(400).json({ error: '필수 항목 누락' });
  if (newPassword.length < 4) return res.status(400).json({ error: '비밀번호는 4자 이상이어야 합니다.' });

  const record = db.prepare(`
    SELECT * FROM password_reset_tokens
    WHERE token = ? AND used = 0 AND expires_at > datetime('now')
  `).get(token);

  if (!record) return res.status(400).json({ error: '유효하지 않거나 만료된 링크입니다.' });

  const hashed = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, record.user_id);
  db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE id = ?').run(record.id);

  res.json({ message: '비밀번호가 변경되었습니다. 다시 로그인해 주세요.' });
});

// ══════════════════════════════════════════════════════════════════════════════
// 어드민 API
// ══════════════════════════════════════════════════════════════════════════════

// 전체 유저 목록
app.get('/api/admin/users', adminAuth, (req, res) => {
  const users = db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
  res.json(users.map(safeUser));
});

// 작가 승인
app.put('/api/admin/users/:id/approve', adminAuth, (req, res) => {
  const id = Number(req.params.id);
  db.prepare("UPDATE users SET status = 'approved' WHERE id = ?").run(id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: '유저 없음' });
  res.json(safeUser(user));
});

// 작가 거절/정지
app.put('/api/admin/users/:id/reject', adminAuth, (req, res) => {
  const id = Number(req.params.id);
  db.prepare("UPDATE users SET status = 'rejected' WHERE id = ?").run(id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: '유저 없음' });
  res.json(safeUser(user));
});

// 유저 삭제
app.delete('/api/admin/users/:id', adminAuth, (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: '본인 계정은 삭제할 수 없습니다.' });
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ message: '삭제됨' });
});

// ══════════════════════════════════════════════════════════════════════════════
// 유저 API
// ══════════════════════════════════════════════════════════════════════════════

app.get('/api/users/:id', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(req.params.id));
  if (!user) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
  res.json(safeUser(user));
});

app.get('/api/users/:id/posts', (req, res) => {
  const posts = db.prepare(`
    SELECT p.*, u.name as author_name, u.avatar as author_avatar, u.bio as author_bio
    FROM posts p JOIN users u ON p.author_id = u.id
    WHERE p.author_id = ? ORDER BY p.created_at DESC
  `).all(Number(req.params.id));
  res.json(posts.map(formatPost));
});

// ══════════════════════════════════════════════════════════════════════════════
// 글 API
// ══════════════════════════════════════════════════════════════════════════════

app.get('/api/posts', (req, res) => {
  const posts = db.prepare(`
    SELECT p.*, u.name as author_name, u.avatar as author_avatar, u.bio as author_bio
    FROM posts p JOIN users u ON p.author_id = u.id
    ORDER BY p.created_at DESC
  `).all();
  res.json(posts.map(formatPost));
});

app.post('/api/posts', auth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (user.role !== 'writer')
    return res.status(403).json({ error: '작가만 글을 쓸 수 있습니다.' });
  if (user.status !== 'approved')
    return res.status(403).json({ error: '관리자 승인 후 글을 쓸 수 있습니다.' });

  const { title, content, image, music_title, tags } = req.body;
  if (!title || !content) return res.status(400).json({ error: '제목과 내용을 입력하세요.' });

  const excerpt = content.replace(/^#+ /gm, '').split('\n').find((l) => l.trim()) || '';
  const readTime = `${Math.max(1, Math.ceil(content.length / 300))}분`;

  const result = db.prepare(`
    INSERT INTO posts (author_id, title, content, excerpt, image, music_title, tags, read_time)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, title, content, excerpt.slice(0, 100), image || null, music_title || null, JSON.stringify(tags || []), readTime);

  const post = db.prepare(`
    SELECT p.*, u.name as author_name, u.avatar as author_avatar, u.bio as author_bio
    FROM posts p JOIN users u ON p.author_id = u.id WHERE p.id = ?
  `).get(Number(result.lastInsertRowid));

  res.status(201).json(formatPost(post));
});

app.put('/api/posts/:id', auth, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(Number(req.params.id));
  if (!post) return res.status(404).json({ error: '글을 찾을 수 없습니다.' });
  if (post.author_id !== req.user.id) return res.status(403).json({ error: '본인 글만 수정할 수 있습니다.' });

  const { title, content, image, music_title, tags } = req.body;
  const excerpt = content.replace(/^#+ /gm, '').split('\n').find((l) => l.trim()) || '';
  const readTime = `${Math.max(1, Math.ceil(content.length / 300))}분`;

  db.prepare(`
    UPDATE posts SET title=?, content=?, excerpt=?, image=?, music_title=?, tags=?, read_time=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(title, content, excerpt.slice(0, 100), image || null, music_title || null, JSON.stringify(tags || []), readTime, Number(req.params.id));

  const updated = db.prepare(`
    SELECT p.*, u.name as author_name, u.avatar as author_avatar, u.bio as author_bio
    FROM posts p JOIN users u ON p.author_id = u.id WHERE p.id = ?
  `).get(Number(req.params.id));

  res.json(formatPost(updated));
});

app.delete('/api/posts/:id', auth, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(Number(req.params.id));
  if (!post) return res.status(404).json({ error: '글을 찾을 수 없습니다.' });

  // 어드민이거나 본인 글이면 삭제 가능
  const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.user.id);
  if (post.author_id !== req.user.id && !user?.is_admin)
    return res.status(403).json({ error: '본인 글만 삭제할 수 있습니다.' });

  db.prepare('DELETE FROM posts WHERE id = ?').run(Number(req.params.id));
  res.json({ message: '삭제되었습니다.' });
});

// ══════════════════════════════════════════════════════════════════════════════
// 댓글 API
// ══════════════════════════════════════════════════════════════════════════════

// 댓글 목록
app.get('/api/posts/:id/comments', (req, res) => {
  const comments = db.prepare(`
    SELECT c.*, u.name as author_name, u.avatar as author_avatar
    FROM comments c JOIN users u ON c.author_id = u.id
    WHERE c.post_id = ? ORDER BY c.created_at ASC
  `).all(Number(req.params.id));

  res.json(comments.map((c) => ({
    id: c.id,
    postId: c.post_id,
    authorId: c.author_id,
    content: c.content,
    date: formatDate(c.created_at),
    author: { name: c.author_name, avatar: c.author_avatar },
  })));
});

// 댓글 작성
app.post('/api/posts/:id/comments', auth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (user.status !== 'approved')
    return res.status(403).json({ error: '승인된 회원만 댓글을 달 수 있습니다.' });

  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: '댓글 내용을 입력하세요.' });

  const result = db.prepare(`
    INSERT INTO comments (post_id, author_id, content) VALUES (?, ?, ?)
  `).run(Number(req.params.id), req.user.id, content.trim());

  const comment = db.prepare(`
    SELECT c.*, u.name as author_name, u.avatar as author_avatar
    FROM comments c JOIN users u ON c.author_id = u.id WHERE c.id = ?
  `).get(Number(result.lastInsertRowid));

  res.status(201).json({
    id: comment.id,
    postId: comment.post_id,
    authorId: comment.author_id,
    content: comment.content,
    date: formatDate(comment.created_at),
    author: { name: comment.author_name, avatar: comment.author_avatar },
  });
});

// 댓글 삭제 (본인 or 어드민)
app.delete('/api/comments/:id', auth, (req, res) => {
  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(Number(req.params.id));
  if (!comment) return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' });

  const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.user.id);
  if (comment.author_id !== req.user.id && !user?.is_admin)
    return res.status(403).json({ error: '본인 댓글만 삭제할 수 있습니다.' });

  db.prepare('DELETE FROM comments WHERE id = ?').run(Number(req.params.id));
  res.json({ message: '삭제됨' });
});

// ─── 프론트엔드 정적 파일 서빙 (프로덕션) ────────────────────────────────────
const distPath = join(__dirname, '../dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  // React Router를 위한 catch-all (API 제외)
  app.get('*', (req, res) => {
    res.sendFile(join(distPath, 'index.html'));
  });
  console.log(`📦 프론트엔드 정적 파일 서빙: ${distPath}`);
}

// ─── 서버 시작 ────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 글터 서버 실행 중: http://localhost:${PORT}`);
});
