require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');

const db = require('./db');
const { sendVerificationEmail } = require('./mailer');
const { sendVerificationSms } = require('./sms');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const JWT_SECRET = process.env.JWT_SECRET || 'livechat_jwt_secret_key_2026';
const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const AVATAR_COLORS = ['#4f46e5', '#7c3aed', '#0ea5e9', '#059669', '#d97706', '#dc2626', '#db2777', '#0891b2'];

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function pickAvatarColor() {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    displayName: u.display_name,
    email: u.email,
    phone: u.phone,
    avatarColor: u.avatar_color,
    verified: !!u.verified,
  };
}

function normalizePhone(p) {
  return (p || '').replace(/[\s-]/g, '');
}

function issueToken(user) {
  return jwt.sign({ uid: user.id }, JWT_SECRET, { expiresIn: '30d' });
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.cookies.token;
  if (!token) return res.status(401).json({ error: 'غير مصرح، الرجاء تسجيل الدخول' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.uid);
    if (!user) return res.status(401).json({ error: 'المستخدم غير موجود' });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'جلسة غير صالحة، الرجاء تسجيل الدخول من جديد' });
  }
}

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'livechat-video-app',
    onlineUsersCount: onlineUsers.size,
    timestamp: new Date().toISOString()
  });
});

// ---------- Register ----------
app.post('/api/register', async (req, res) => {
  try {
    let { displayName, method, identifier, password } = req.body;
    if (!displayName || !method || !identifier || !password) {
      return res.status(400).json({ error: 'الرجاء تعبئة جميع الحقول' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
    }
    displayName = displayName.trim();

    let email = null, phone = null;
    if (method === 'email') {
      email = identifier.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'صيغة البريد الإلكتروني غير صحيحة' });
      }
    } else if (method === 'phone') {
      phone = normalizePhone(identifier.trim());
      if (!/^\+?[0-9]{8,15}$/.test(phone)) {
        return res.status(400).json({ error: 'صيغة رقم الهاتف غير صحيحة' });
      }
    } else {
      return res.status(400).json({ error: 'طريقة تسجيل غير معروفة' });
    }

    const existing = email
      ? db.prepare('SELECT * FROM users WHERE email = ?').get(email)
      : db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);

    let user;
    if (existing) {
      if (existing.verified) {
        return res.status(409).json({ error: 'هذا الحساب موجود بالفعل ومؤكد، الرجاء تسجيل الدخول' });
      }
      // existing but not verified -> update password/name and resend code
      const password_hash = await bcrypt.hash(password, 10);
      db.prepare('UPDATE users SET display_name = ?, password_hash = ? WHERE id = ?')
        .run(displayName, password_hash, existing.id);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(existing.id);
    } else {
      const password_hash = await bcrypt.hash(password, 10);
      const info = db.prepare(`INSERT INTO users (display_name, email, phone, password_hash, verified, avatar_color, created_at)
        VALUES (?, ?, ?, ?, 0, ?, ?)`)
        .run(displayName, email, phone, password_hash, pickAvatarColor(), Date.now());
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    }

    const code = genCode();
    const target = email || phone;
    const channel = email ? 'email' : 'phone';
    db.prepare(`INSERT INTO verification_codes (user_id, code, channel, target, purpose, expires_at, used, created_at)
      VALUES (?, ?, ?, ?, 'register', ?, 0, ?)`)
      .run(user.id, code, channel, target, Date.now() + CODE_TTL_MS, Date.now());

    let devHint = null;
    if (channel === 'email') {
      const mailRes = await sendVerificationEmail(email, code, displayName);
      if (mailRes && mailRes.simulated) {
        devHint = code;
      }
    } else {
      sendVerificationSms(phone, code);
      devHint = code;
    }

    res.json({
      ok: true,
      userId: user.id,
      channel,
      target,
      devHint,
      message: channel === 'email'
        ? (devHint ? 'تم إنشاء رمز التأكيد (وضع تجريبي)' : 'تم إرسال رمز التأكيد إلى بريدك الإلكتروني')
        : 'تم توليد رمز التأكيد للهاتف (وضع تجريبي)'
    });
  } catch (e) {
    console.error('Registration Error:', e);
    res.status(500).json({ error: 'حدث خطأ في الخادم أثناء التسجيل: ' + e.message });
  }
});

// ---------- Verify ----------
app.post('/api/verify', (req, res) => {
  const { userId, code } = req.body;
  if (!userId || !code) return res.status(400).json({ error: 'بيانات ناقصة' });

  const row = db.prepare(`SELECT * FROM verification_codes WHERE user_id = ? AND purpose='register'
    ORDER BY id DESC LIMIT 1`).get(userId);

  if (!row) return res.status(400).json({ error: 'لا يوجد رمز تأكيد لهذا الحساب' });
  if (row.used) return res.status(400).json({ error: 'تم استخدام هذا الرمز مسبقًا' });
  if (Date.now() > row.expires_at) return res.status(400).json({ error: 'انتهت صلاحية الرمز، اطلب رمزًا جديدًا' });
  if (row.code !== String(code).trim()) return res.status(400).json({ error: 'الرمز غير صحيح' });

  db.prepare('UPDATE verification_codes SET used = 1 WHERE id = ?').run(row.id);
  db.prepare('UPDATE users SET verified = 1 WHERE id = ?').run(userId);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const token = issueToken(user);
  res.json({ ok: true, token, user: publicUser(user) });
});

// ---------- Resend code ----------
app.post('/api/resend', async (req, res) => {
  const { userId } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
  if (user.verified) return res.status(400).json({ error: 'الحساب مؤكد بالفعل' });

  const code = genCode();
  const channel = user.email ? 'email' : 'phone';
  const target = user.email || user.phone;
  db.prepare(`INSERT INTO verification_codes (user_id, code, channel, target, purpose, expires_at, used, created_at)
    VALUES (?, ?, ?, ?, 'register', ?, 0, ?)`)
    .run(user.id, code, channel, target, Date.now() + CODE_TTL_MS, Date.now());

  let devHint = null;
  if (channel === 'email') {
    const mailRes = await sendVerificationEmail(user.email, code, user.display_name);
    if (mailRes && mailRes.simulated) devHint = code;
  } else {
    sendVerificationSms(user.phone, code);
    devHint = code;
  }
  res.json({ ok: true, devHint, message: 'تم إرسال رمز جديد' });
});

// ---------- Login ----------
app.post('/api/login', async (req, res) => {
  const { identifier, password } = req.body;
  if (!identifier || !password) return res.status(400).json({ error: 'الرجاء إدخال البيانات' });
  const id = identifier.trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email = ? OR phone = ?').get(id, normalizePhone(identifier.trim()));
  if (!user) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });

  if (!user.verified) {
    return res.status(403).json({
      error: 'الحساب غير مؤكد بعد',
      needsVerification: true,
      userId: user.id,
    });
  }

  const token = issueToken(user);
  res.json({ ok: true, token, user: publicUser(user) });
});

// ---------- Me ----------
app.get('/api/me', authMiddleware, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// ---------- Users list ----------
app.get('/api/users', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT * FROM users WHERE verified = 1 AND id != ? ORDER BY display_name')
    .all(req.user.id);
  res.json({ users: rows.map(publicUser).map(u => ({ ...u, online: onlineUsers.has(u.id) })) });
});

// ---------- Message history ----------
app.get('/api/messages/:otherId', authMiddleware, (req, res) => {
  const otherId = parseInt(req.params.otherId, 10);
  const rows = db.prepare(`
    SELECT * FROM messages
    WHERE (from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?)
    ORDER BY id ASC LIMIT 500
  `).all(req.user.id, otherId, otherId, req.user.id);
  db.prepare(`UPDATE messages SET is_read = 1 WHERE from_user_id = ? AND to_user_id = ?`).run(otherId, req.user.id);
  res.json({ messages: rows.map(r => ({
    id: r.id, from: r.from_user_id, to: r.to_user_id, body: r.body, createdAt: r.created_at, read: !!r.is_read,
  })) });
});

// ================= Socket.IO =================
const onlineUsers = new Map(); // userId -> Set(socketIds)

function broadcastPresence(userId, online) {
  io.emit('presence', { userId, online });
}

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('unauthorized'));
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.uid);
    if (!user) return next(new Error('unauthorized'));
    socket.user = publicUser(user);
    next();
  } catch (e) {
    next(new Error('unauthorized'));
  }
});

io.on('connection', (socket) => {
  const uid = socket.user.id;
  if (!onlineUsers.has(uid)) onlineUsers.set(uid, new Set());
  onlineUsers.get(uid).add(socket.id);
  socket.join(`user:${uid}`);
  broadcastPresence(uid, true);

  socket.on('chat:send', ({ to, body }) => {
    if (!to || !body || !body.trim()) return;
    const info = db.prepare(`INSERT INTO messages (from_user_id, to_user_id, body, created_at, is_read)
      VALUES (?, ?, ?, ?, 0)`).run(uid, to, body.trim(), Date.now());
    const payload = { id: info.lastInsertRowid, from: uid, to, body: body.trim(), createdAt: Date.now() };
    io.to(`user:${to}`).emit('chat:message', payload);
    socket.emit('chat:message', payload);
  });

  socket.on('typing', ({ to, isTyping }) => {
    io.to(`user:${to}`).emit('typing', { from: uid, isTyping: !!isTyping });
  });

  // ---- WebRTC 1:1 signaling ----
  socket.on('call:invite', ({ to, isVideo = true }) => {
    io.to(`user:${to}`).emit('call:invite', { from: socket.user, isVideo });
  });
  socket.on('call:accept', ({ to }) => {
    io.to(`user:${to}`).emit('call:accept', { from: uid });
  });
  socket.on('call:reject', ({ to }) => {
    io.to(`user:${to}`).emit('call:reject', { from: uid });
  });
  socket.on('call:cancel', ({ to }) => {
    io.to(`user:${to}`).emit('call:cancel', { from: uid });
  });
  socket.on('call:end', ({ to }) => {
    io.to(`user:${to}`).emit('call:end', { from: uid });
  });
  socket.on('webrtc:offer', ({ to, sdp }) => {
    io.to(`user:${to}`).emit('webrtc:offer', { from: uid, sdp });
  });
  socket.on('webrtc:answer', ({ to, sdp }) => {
    io.to(`user:${to}`).emit('webrtc:answer', { from: uid, sdp });
  });
  socket.on('webrtc:ice', ({ to, candidate }) => {
    io.to(`user:${to}`).emit('webrtc:ice', { from: uid, candidate });
  });

  socket.on('disconnect', () => {
    const set = onlineUsers.get(uid);
    if (set) {
      set.delete(socket.id);
      if (set.size === 0) {
        onlineUsers.delete(uid);
        broadcastPresence(uid, false);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 LiveChat Server running on http://0.0.0.0:${PORT}`);
});
