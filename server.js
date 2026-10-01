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
const CODE_TTL_MS = 10 * 60 * 1000;
const AVATAR_COLORS = ['#ec4899', '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#6366f1'];

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// GIFTS CATALOG (Tango & SuperLive Style)
const GIFTS_CATALOG = [
  { id: 'rose', name: 'وردة حمراء', icon: '🌹', coins: 1, sound: 'sparkle', animation: 'float' },
  { id: 'heart', name: 'قلب ناري', icon: '💖', coins: 5, sound: 'pop', animation: 'heartbeat' },
  { id: 'coffee', name: 'قهوة', icon: '☕', coins: 10, sound: 'cheer', animation: 'bounce' },
  { id: 'perfume', name: 'عطر فاخر', icon: '✨', coins: 25, sound: 'magic', animation: 'sparkle' },
  { id: 'rocket', name: 'صاروخ فضائي', icon: '🚀', coins: 50, sound: 'launch', animation: 'fly_across' },
  { id: 'crown', name: 'تاج الملكي', icon: '👑', coins: 100, sound: 'fanfare', animation: 'crown_drop' },
  { id: 'car', name: 'سيارة رياضية', icon: '🏎️', coins: 500, sound: 'engine', animation: 'car_zoom' },
  { id: 'castle', name: 'قصر الأحلام', icon: '🏰', coins: 1000, sound: 'triumph', animation: 'castle_epic' }
];

// Helper Functions
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
    avatarColor: u.avatar_color || '#8b5cf6',
    coins: u.coins !== undefined ? u.coins : 500,
    diamonds: u.diamonds || 0,
    level: u.level || 1,
    followersCount: u.followers_count || 12,
    verified: !!u.verified,
  };
}

function normalizePhone(p) {
  return (p || '').replace(/[\s\-\(\)\.]/g, '');
}

function issueToken(user) {
  return jwt.sign({ uid: user.id }, JWT_SECRET, { expiresIn: '30d' });
}

// Global In-Memory Streams Map for fast realtime broadcast
const activeLiveStreams = new Map();

// Seed initial creators and simulated streams
async function initSeedData() {
  try {
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(1);
    if (!existing) {
      const hash = await bcrypt.hash('password123', 10);
      db.prepare(`INSERT INTO users (display_name, email, phone, password_hash, verified, avatar_color, created_at)
        VALUES (?, ?, ?, ?, 1, ?, ?)`).run('إلياس طايبي ⭐', 'ilyes@livechat.com', '0555000001', hash, '#ec4899', Date.now());
      db.prepare(`INSERT INTO users (display_name, email, phone, password_hash, verified, avatar_color, created_at)
        VALUES (?, ?, ?, ?, 1, ?, ?)`).run('سارة لايف 🎤', 'sara@livechat.com', '0555000002', hash, '#8b5cf6', Date.now());
      db.prepare(`INSERT INTO users (display_name, email, phone, password_hash, verified, avatar_color, created_at)
        VALUES (?, ?, ?, ?, 1, ?, ?)`).run('أمين جيمينغ 🎮', 'amine@livechat.com', '0555000003', hash, '#10b981', Date.now());
      db.prepare(`INSERT INTO users (display_name, email, phone, password_hash, verified, avatar_color, created_at)
        VALUES (?, ?, ?, ?, 1, ?, ?)`).run('نور التونسية 💃', 'nour@livechat.com', '0555000004', hash, '#f59e0b', Date.now());
      console.log('✅ Tango/SuperLive Seed users ready.');
    }

    // Seed default simulated active streams
    if (activeLiveStreams.size === 0) {
      activeLiveStreams.set('stream_101', {
        id: 'stream_101',
        title: '🔥 سهرة موسيقية حية مع المتابعين وغناء مباشر',
        category: 'music',
        host: { id: 2, displayName: 'سارة لايف 🎤', avatarColor: '#8b5cf6', level: 12 },
        viewersCount: 348,
        likesCount: 1420,
        diamondsEarned: 2850,
        tags: ['موسيقى', 'غناء', 'تفاعل'],
        thumbnailGradient: 'linear-gradient(135deg, #ec4899, #8b5cf6)',
        startedAt: Date.now() - 1000 * 60 * 25,
        isSimulated: true
      });

      activeLiveStreams.set('stream_102', {
        id: 'stream_102',
        title: '🎮 بث مباشر وتحدي ألعاب مع الجماهير والهدايا',
        category: 'gaming',
        host: { id: 3, displayName: 'أمين جيمينغ 🎮', avatarColor: '#10b981', level: 9 },
        viewersCount: 215,
        likesCount: 980,
        diamondsEarned: 1320,
        tags: ['ألعاب', 'تحديات', 'مرح'],
        thumbnailGradient: 'linear-gradient(135deg, #3b82f6, #10b981)',
        startedAt: Date.now() - 1000 * 60 * 12,
        isSimulated: true
      });

      activeLiveStreams.set('stream_103', {
        id: 'stream_103',
        title: '☕ دردشة ومناقشة مواضيع شيقة وإجابة على الأسئلة',
        category: 'chat',
        host: { id: 4, displayName: 'نور التونسية 💃', avatarColor: '#f59e0b', level: 15 },
        viewersCount: 512,
        likesCount: 3200,
        diamondsEarned: 5400,
        tags: ['دردشة', 'تفاعل', 'نصائح'],
        thumbnailGradient: 'linear-gradient(135deg, #f59e0b, #ef4444)',
        startedAt: Date.now() - 1000 * 60 * 45,
        isSimulated: true
      });
    }
  } catch (e) {
    console.error('Seed error:', e);
  }
}
initSeedData();

// Auth Middleware
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
    return res.status(401).json({ error: 'جلسة غير صالحة، الرجاء تسجيل الدخول' });
  }
}

// ---------------- REST APIs ----------------

// Health
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'tango-superlive-platform',
    activeStreams: activeLiveStreams.size,
    onlineUsers: onlineUsers.size,
    timestamp: new Date().toISOString()
  });
});

// Demo Login
app.post('/api/demo-login', async (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE verified = 1 ORDER BY id ASC LIMIT 1').get();
    if (!user) return res.status(404).json({ error: 'لا يوجد مستخدم تجريبي متاح.' });
    const token = issueToken(user);
    res.json({ ok: true, token, user: publicUser(user) });
  } catch (e) {
    res.status(500).json({ error: 'خطأ في الدخول التجريبي: ' + e.message });
  }
});

// Register
app.post('/api/register', async (req, res) => {
  try {
    let { displayName, method, identifier, password } = req.body;
    if (!displayName || !method || !identifier || !password) {
      return res.status(400).json({ error: 'الرجاء تعبئة جميع الحقول.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل.' });
    }
    displayName = displayName.trim();

    let email = null, phone = null;
    if (method === 'email') {
      email = identifier.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'صيغة البريد الإلكتروني غير صحيحة.' });
      }
    } else {
      phone = normalizePhone(identifier.trim());
      if (phone.length < 6) return res.status(400).json({ error: 'رقم الهاتف قصير جداً.' });
    }

    const existing = email
      ? db.prepare('SELECT * FROM users WHERE email = ?').get(email)
      : db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);

    let user;
    if (existing) {
      if (existing.verified) {
        return res.status(409).json({ error: 'هذا الحساب مسجل بالفعل، يرجى تسجيل الدخول مباشرة.' });
      }
      const password_hash = await bcrypt.hash(password, 10);
      db.prepare('UPDATE users SET display_name = ?, password_hash = ? WHERE id = ?')
        .run(displayName, password_hash, existing.id);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(existing.id);
    } else {
      const password_hash = await bcrypt.hash(password, 10);
      const info = db.prepare(`INSERT INTO users (display_name, email, phone, password_hash, verified, avatar_color, created_at)
        VALUES (?, ?, ?, ?, 0, ?, ?)`).run(displayName, email, phone, password_hash, pickAvatarColor(), Date.now());
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    }

    const code = genCode();
    const target = email || phone;
    const channel = email ? 'email' : 'phone';
    db.prepare(`INSERT INTO verification_codes (user_id, code, channel, target, purpose, expires_at, used, created_at)
      VALUES (?, ?, ?, ?, 'register', ?, 0, ?)`).run(user.id, code, channel, target, Date.now() + CODE_TTL_MS, Date.now());

    if (channel === 'email') {
      await sendVerificationEmail(email, code, displayName);
    } else {
      sendVerificationSms(phone, code);
    }

    res.json({ ok: true, userId: user.id, channel, target, devHint: code, message: 'تم إرسال رمز التأكيد.' });
  } catch (e) {
    res.status(500).json({ error: 'خطأ أثناء التسجيل: ' + e.message });
  }
});

// Verify
app.post('/api/verify', (req, res) => {
  const { userId, code } = req.body;
  if (!userId || !code) return res.status(400).json({ error: 'يرجى إدخال الرمز.' });

  const row = db.prepare(`SELECT * FROM verification_codes WHERE user_id = ? AND purpose='register'
    ORDER BY id DESC LIMIT 1`).get(userId);

  if (!row) return res.status(400).json({ error: 'لا يوجد رمز تأكيد نشط.' });
  if (row.used) return res.status(400).json({ error: 'تم استخدام هذا الرمز مسبقاً.' });
  if (row.code !== String(code).trim()) return res.status(400).json({ error: 'رمز التأكيد غير صحيح.' });

  db.prepare('UPDATE verification_codes SET used = 1 WHERE id = ?').run(row.id);
  db.prepare('UPDATE users SET verified = 1 WHERE id = ?').run(userId);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const token = issueToken(user);
  res.json({ ok: true, token, user: publicUser(user) });
});

// Resend Code
app.post('/api/resend', async (req, res) => {
  const { userId } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'المستخدم غير موجود.' });

  const code = genCode();
  const channel = user.email ? 'email' : 'phone';
  const target = user.email || user.phone;
  db.prepare(`INSERT INTO verification_codes (user_id, code, channel, target, purpose, expires_at, used, created_at)
    VALUES (?, ?, ?, ?, 'register', ?, 0, ?)`).run(user.id, code, channel, target, Date.now() + CODE_TTL_MS, Date.now());

  if (channel === 'email') {
    await sendVerificationEmail(user.email, code, user.display_name);
  } else {
    sendVerificationSms(user.phone, code);
  }
  res.json({ ok: true, devHint: code, message: 'تم إرسال رمز جديد.' });
});

// Login
app.post('/api/login', async (req, res) => {
  const { identifier, password } = req.body;
  if (!identifier || !password) return res.status(400).json({ error: 'الرجاء إدخال البيانات.' });
  const id = identifier.trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email = ? OR phone = ?').get(id, normalizePhone(identifier.trim()));
  if (!user) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة.' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'كلمة المرور غير صحيحة.' });

  if (!user.verified) {
    return res.status(403).json({ error: 'الحساب غير مؤكد بعد.', needsVerification: true, userId: user.id });
  }

  const token = issueToken(user);
  res.json({ ok: true, token, user: publicUser(user) });
});

// Profile / Me
app.get('/api/me', authMiddleware, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// Top-up Free Coins
app.post('/api/wallet/topup', authMiddleware, (req, res) => {
  const amount = parseInt(req.body.amount, 10) || 500;
  req.user.coins = (req.user.coins || 0) + amount;
  if (db.save) db.save();
  res.json({ ok: true, coins: req.user.coins, message: `🎉 تم شحن ${amount} عملة مجاناً في محفظتك!` });
});

// Gifts Catalog
app.get('/api/gifts', (req, res) => {
  res.json({ gifts: GIFTS_CATALOG });
});

// Get Active Live Streams
app.get('/api/streams', (req, res) => {
  const streams = Array.from(activeLiveStreams.values());
  res.json({ streams });
});

// Start a New Live Stream (Broadcast)
app.post('/api/streams/start', authMiddleware, (req, res) => {
  const { title, category, tags } = req.body;
  const streamId = 'stream_' + Date.now();
  const newStream = {
    id: streamId,
    title: title || `${req.user.display_name} في بث مباشر الآن 🔥`,
    category: category || 'chat',
    host: publicUser(req.user),
    viewersCount: 1,
    likesCount: 0,
    diamondsEarned: 0,
    tags: tags || ['بث مباشر', 'تفاعل'],
    thumbnailGradient: 'linear-gradient(135deg, #ec4899, #6366f1)',
    startedAt: Date.now(),
    isSimulated: false
  };

  activeLiveStreams.set(streamId, newStream);
  io.emit('streams:updated', { streams: Array.from(activeLiveStreams.values()) });
  res.json({ ok: true, stream: newStream });
});

// Stop Live Stream
app.post('/api/streams/stop', authMiddleware, (req, res) => {
  const { streamId } = req.body;
  if (activeLiveStreams.has(streamId)) {
    const s = activeLiveStreams.get(streamId);
    if (s.host.id === req.user.id || req.user.id === 1) {
      activeLiveStreams.delete(streamId);
      io.to(`stream:${streamId}`).emit('stream:ended', { streamId });
      io.emit('streams:updated', { streams: Array.from(activeLiveStreams.values()) });
      return res.json({ ok: true, message: 'تم إنهاء البث بنجاح.' });
    }
  }
  res.json({ ok: true });
});

// Leaderboard (Top Streamers & Top Gifters)
app.get('/api/leaderboard', (req, res) => {
  const users = db.prepare('SELECT * FROM users WHERE verified = 1').all();
  const topStreamers = users
    .map(publicUser)
    .sort((a, b) => (b.diamonds || 0) - (a.diamonds || 0))
    .slice(0, 10);

  const topGifters = users
    .map(publicUser)
    .sort((a, b) => (b.coins || 0) - (a.coins || 0))
    .slice(0, 10);

  res.json({ topStreamers, topGifters });
});

// Users List for 1:1 direct chat
app.get('/api/users', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT * FROM users WHERE verified = 1 AND id != ? ORDER BY display_name')
    .all(req.user.id);
  res.json({ users: rows.map(publicUser).map(u => ({ ...u, online: onlineUsers.has(u.id) })) });
});

// Messages History
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

// ================= Socket.IO Real-Time Engine =================
const onlineUsers = new Map();
const streamRoomViewers = new Map(); // streamId -> Set(userId)

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

  // ---------- Live Stream Rooms ----------
  socket.on('stream:join', ({ streamId }) => {
    socket.join(`stream:${streamId}`);
    if (!streamRoomViewers.has(streamId)) streamRoomViewers.set(streamId, new Set());
    streamRoomViewers.get(streamId).add(uid);

    const stream = activeLiveStreams.get(streamId);
    if (stream) {
      stream.viewersCount = Math.max(stream.viewersCount, streamRoomViewers.get(streamId).size);
      io.to(`stream:${streamId}`).emit('stream:viewers_update', {
        streamId,
        viewersCount: stream.viewersCount,
        viewer: socket.user
      });
    }

    // Announce user entered stream
    io.to(`stream:${streamId}`).emit('stream:comment', {
      id: Date.now(),
      streamId,
      user: socket.user,
      body: 'انضم إلى البث المباشر 👋',
      isSystem: true
    });
  });

  socket.on('stream:leave', ({ streamId }) => {
    socket.leave(`stream:${streamId}`);
    if (streamRoomViewers.has(streamId)) {
      streamRoomViewers.get(streamId).delete(uid);
      const stream = activeLiveStreams.get(streamId);
      if (stream) {
        stream.viewersCount = Math.max(1, streamRoomViewers.get(streamId).size);
        io.to(`stream:${streamId}`).emit('stream:viewers_update', {
          streamId,
          viewersCount: stream.viewersCount
        });
      }
    }
  });

  // Floating Live Comments
  socket.on('stream:comment', ({ streamId, body }) => {
    if (!body || !body.trim()) return;
    const commentPayload = {
      id: Date.now(),
      streamId,
      user: socket.user,
      body: body.trim(),
      level: socket.user.level || 1,
      createdAt: Date.now()
    };
    io.to(`stream:${streamId}`).emit('stream:comment', commentPayload);
  });

  // Flying Hearts / Likes
  socket.on('stream:like', ({ streamId }) => {
    const stream = activeLiveStreams.get(streamId);
    if (stream) {
      stream.likesCount = (stream.likesCount || 0) + 1;
      io.to(`stream:${streamId}`).emit('stream:like', {
        streamId,
        likesCount: stream.likesCount,
        sender: socket.user
      });
    }
  });

  // Sending Gifts (Tango / SuperLive Virtual Gifts)
  socket.on('stream:gift', ({ streamId, giftId }) => {
    const gift = GIFTS_CATALOG.find(g => g.id === giftId);
    const stream = activeLiveStreams.get(streamId);
    if (!gift || !stream) return;

    // Check coins balance
    const sender = db.prepare('SELECT * FROM users WHERE id = ?').get(uid);
    if (!sender || (sender.coins || 0) < gift.coins) {
      return socket.emit('error:toast', { message: 'رصيد العملات غير كافٍ! اشحن محفظتك مجاناً.' });
    }

    // Deduct coins & reward diamonds
    sender.coins -= gift.coins;
    stream.diamondsEarned = (stream.diamondsEarned || 0) + gift.coins;
    if (db.save) db.save();

    const giftEvent = {
      id: Date.now(),
      streamId,
      gift,
      sender: publicUser(sender),
      hostId: stream.host.id,
      diamondsTotal: stream.diamondsEarned,
      createdAt: Date.now()
    };

    // Broadcast animated gift to whole stream room
    io.to(`stream:${streamId}`).emit('stream:gift', giftEvent);
    socket.emit('wallet:update', { coins: sender.coins });
  });

  // Follow Streamer
  socket.on('stream:follow', ({ streamId, hostId }) => {
    io.to(`stream:${streamId}`).emit('stream:comment', {
      id: Date.now(),
      streamId,
      user: socket.user,
      body: '🌟 بدأ بمتابعة المضيف!',
      isSystem: true
    });
  });

  // ---------- 1:1 Direct Chat & WebRTC ----------
  socket.on('chat:send', ({ to, body }) => {
    if (!to || !body || !body.trim()) return;
    const info = db.prepare(`INSERT INTO messages (from_user_id, to_user_id, body, created_at, is_read)
      VALUES (?, ?, ?, ?, 0)`).run(uid, to, body.trim(), Date.now());
    const payload = { id: info.lastInsertRowid, from: uid, to, body: body.trim(), createdAt: Date.now() };
    io.to(`user:${to}`).emit('chat:message', payload);
    socket.emit('chat:message', payload);
  });

  socket.on('call:invite', ({ to, isVideo = true }) => {
    io.to(`user:${to}`).emit('call:invite', { from: socket.user, isVideo });
  });
  socket.on('call:accept', ({ to }) => io.to(`user:${to}`).emit('call:accept', { from: uid }));
  socket.on('call:reject', ({ to }) => io.to(`user:${to}`).emit('call:reject', { from: uid }));
  socket.on('call:cancel', ({ to }) => io.to(`user:${to}`).emit('call:cancel', { from: uid }));
  socket.on('call:end', ({ to }) => io.to(`user:${to}`).emit('call:end', { from: uid }));
  socket.on('webrtc:offer', ({ to, sdp }) => io.to(`user:${to}`).emit('webrtc:offer', { from: uid, sdp }));
  socket.on('webrtc:answer', ({ to, sdp }) => io.to(`user:${to}`).emit('webrtc:answer', { from: uid, sdp }));
  socket.on('webrtc:ice', ({ to, candidate }) => io.to(`user:${to}`).emit('webrtc:ice', { from: uid, candidate }));

  // Disconnect
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
  console.log(`🌟 Tango & SuperLive Platform running on http://0.0.0.0:${PORT}`);
});
