import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── .env 수동 로드 (dotenv 없이) ─────────────────────────────────────────────
function loadEnv() {
  try {
    const content = readFileSync(join(__dirname, '.env'), 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  } catch { /* .env 없으면 무시 */ }
}
loadEnv();

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const APP_URL = process.env.APP_URL || 'http://localhost:5173';

// ─── 트랜스포터 (nodemailer 동적 로드) ────────────────────────────────────────
let _transporter = null;
async function getTransporter() {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) return null;
  if (_transporter) return _transporter;
  try {
    const nodemailer = (await import('nodemailer')).default;
    _transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    });
    return _transporter;
  } catch {
    console.warn('⚠️  nodemailer 미설치 — 이메일이 콘솔에 출력됩니다.');
    return null;
  }
}

// ─── 발송 핵심 함수 ────────────────────────────────────────────────────────────
async function sendMail({ to, subject, html }) {
  const transporter = await getTransporter();
  if (!transporter) {
    console.log(`\n📧 [이메일 콘솔 출력]\nTo: ${to}\nSubject: ${subject}\n${'─'.repeat(40)}`);
    return;
  }
  try {
    await transporter.sendMail({ from: `글터 <${GMAIL_USER}>`, to, subject, html });
    console.log(`✉️  이메일 발송 완료 → ${to}`);
  } catch (err) {
    console.error('❌ 이메일 발송 실패:', err.message);
  }
}

// ─── 가입 축하 이메일 ──────────────────────────────────────────────────────────
export async function sendWelcomeEmail({ to, name, role }) {
  const roleText = role === 'writer' ? '작가' : '독자';
  await sendMail({
    to,
    subject: '글터에 오신 걸 환영해요 🌸',
    html: `
      <div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;padding:40px 24px;color:#1a1a1a;">
        <h1 style="font-size:22px;margin-bottom:8px;">안녕하세요, ${name}님 👋</h1>
        <p style="color:#555;line-height:1.9;font-size:15px;">
          글터에 <strong>${roleText}</strong>으로 가입해 주셔서 감사해요.<br>
          ${role === 'writer'
            ? '관리자 승인 후 글을 발행할 수 있게 됩니다. 조금만 기다려 주세요!'
            : '오늘도 좋은 글로 하루를 채워보세요.'}
        </p>
        <div style="margin:28px 0;">
          <a href="${APP_URL}" style="background:#1a1a2e;color:#fff;padding:12px 28px;border-radius:24px;text-decoration:none;font-size:14px;font-family:sans-serif;">
            글터 바로가기 →
          </a>
        </div>
        <hr style="border:none;border-top:1px solid #eee;margin:28px 0;">
        <p style="color:#aaa;font-size:12px;font-family:sans-serif;">글터 (Geulter) · 글로 연결되는 공간</p>
      </div>
    `,
  });
}

// ─── 비밀번호 재설정 이메일 ────────────────────────────────────────────────────
export async function sendPasswordResetEmail({ to, name, token }) {
  const resetLink = `${APP_URL}?reset_token=${token}`;
  await sendMail({
    to,
    subject: '글터 비밀번호 재설정 안내',
    html: `
      <div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;padding:40px 24px;color:#1a1a1a;">
        <h1 style="font-size:22px;margin-bottom:8px;">비밀번호를 잊으셨나요?</h1>
        <p style="color:#555;line-height:1.9;font-size:15px;">
          ${name}님, 아래 버튼을 눌러 비밀번호를 재설정하세요.<br>
          링크는 <strong>1시간</strong> 후에 만료됩니다.
        </p>
        <div style="margin:28px 0;">
          <a href="${resetLink}" style="background:#1a1a2e;color:#fff;padding:12px 28px;border-radius:24px;text-decoration:none;font-size:14px;font-family:sans-serif;">
            비밀번호 재설정하기
          </a>
        </div>
        <p style="color:#aaa;font-size:12px;font-family:sans-serif;">
          이 이메일을 요청하지 않으셨다면 무시해 주세요.<br>
          링크: ${resetLink}
        </p>
        <hr style="border:none;border-top:1px solid #eee;margin:28px 0;">
        <p style="color:#aaa;font-size:12px;font-family:sans-serif;">글터 (Geulter) · 글로 연결되는 공간</p>
      </div>
    `,
  });
}

export { APP_URL };
