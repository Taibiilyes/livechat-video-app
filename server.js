require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');

const db = require('./db');
const store = require('./admin-store');
const platform = require('./platform-store');
const { sendVerificationEmail } = require('./mailer');
const { sendVerificationSms } = require('./sms');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const JWT_SECRET = process.env.JWT_SECRET || 'livechat_jwt_secret_key_2026';
const CODE_TTL_MS = 10 * 60 * 1000;
const AVATAR_COLORS = ['#ec4899', '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#6366f1'];
const STAFF_ROLES = ['owner', 'admin', 'moderator', 'seller'];
const ROLE_PERMISSIONS = {
  owner: ['*'],
  admin: ['viewStats','viewUsers','manageUsers','manageContent','manageGifts','managePayments','manageCoinPackages','moderateMessages','manageSettings','viewAudit'],
  moderator: ['viewStats','viewUsers','manageContent','moderateMessages'],
  seller: ['viewStats','viewUsers','managePayments'],
  member: []
};
function userRole(user) { return user.role || (user.is_admin ? 'admin' : 'member'); }
function permissionsFor(user) { return ROLE_PERMISSIONS[userRole(user)] || []; }
function hasPermission(user, permission) { const p=permissionsFor(user); return p.includes('*') || p.includes(permission); }
function permit(permission) { return (req,res,next) => hasPermission(req.admin,permission) ? next() : res.status(403).json({ error: 'رتبتك لا تسمح بهذا الإجراء.' }); }

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Gift catalog is editable from the administration dashboard.
let GIFTS_CATALOG = platform.getGifts(true);

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
    role: userRole(u),
    language: u.language || 'ar',
    verified: !!u.verified,
  };
}

function normalizePhone(p) {
  return (p || '').replace(/[\s\-\(\)\.]/g, '');
}

function issueToken(user) {
  return jwt.sign({ uid: user.id }, JWT_SECRET, { expiresIn: '30d' });
}

function issueAdminToken(user) {
  return jwt.sign({ uid: user.id, scope: 'admin', accountRole: userRole(user) }, JWT_SECRET, { expiresIn: '12h' });
}

// Admin account bootstrap (configurable through env vars)
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'servinfoh@gmail.com').toLowerCase().trim();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TaTe1989';
const ADMIN_NAME = process.env.ADMIN_NAME || 'مدير المنصة';

async function ensureAdminUser() {
  try {
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    const existing = store.findUserByEmail(ADMIN_EMAIL);
    if (existing) {
      store.updateUser(existing.id, {
        password_hash: hash, is_admin: 1, role: 'owner', verified: 1, banned: 0
      });
      console.log('🛡️  Admin account refreshed:', ADMIN_EMAIL);
    } else {
      store.createAdminUser({
        display_name: ADMIN_NAME, email: ADMIN_EMAIL, password_hash: hash
      });
      console.log('🛡️  Admin account created:', ADMIN_EMAIL);
    }
  } catch (e) {
    console.error('Failed to bootstrap admin account:', e.message);
  }
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
      console.log('✅ LumaLive Seed users ready.');
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
        thumbnailGradient: 'linear-gradient(135deg, #f9a8d4, #c4b5fd)',
        videoUrl: '/videos/music-live.mp4',
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
        thumbnailGradient: 'linear-gradient(135deg, #93c5fd, #6ee7b7)',
        videoUrl: '/videos/gaming-live.mp4',
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
        thumbnailGradient: 'linear-gradient(135deg, #fde68a, #fda4af)',
        videoUrl: '/videos/chat-live.mp4',
        startedAt: Date.now() - 1000 * 60 * 45,
        isSimulated: true
      });
    }
  } catch (e) {
    console.error('Seed error:', e);
  }
}
initSeedData().then(ensureAdminUser);

// Auth Middleware
function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.cookies.token;
  if (!token) return res.status(401).json({ error: 'غير مصرح، الرجاء تسجيل الدخول' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.uid);
    if (!user) return res.status(401).json({ error: 'المستخدم غير موجود' });
    if (user.banned) return res.status(403).json({ error: 'تم حظر هذا الحساب من قبل الإدارة.' });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'جلسة غير صالحة، الرجاء تسجيل الدخول' });
  }
}

// Admin-only middleware
function adminMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.cookies.admin_token;
  if (!token) return res.status(401).json({ error: 'غير مصرح، الرجاء تسجيل الدخول كمسؤول' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.scope !== 'admin') return res.status(403).json({ error: 'هذه الصفحة مخصصة لفريق الإدارة فقط' });
    const user = store.findUserById(payload.uid);
    if (!user || !STAFF_ROLES.includes(userRole(user))) return res.status(403).json({ error: 'صلاحيات فريق الإدارة غير متوفرة' });
    req.admin = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'جلسة المسؤول منتهية، الرجاء تسجيل الدخول من جديد' });
  }
}

// ---------------- Admin Dashboard APIs ----------------

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.post('/api/admin/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').toLowerCase().trim();
    const password = String(req.body.password || '');
    if (!email || !password) return res.status(400).json({ error: 'الرجاء إدخال البريد وكلمة المرور.' });

    const user = store.findUserByEmail(email);
    if (!user || !STAFF_ROLES.includes(userRole(user))) {
      return res.status(401).json({ error: 'الحساب لا يملك رتبة إدارية.' });
    }
    const ok = await bcrypt.compare(password, user.password_hash || '');
    if (!ok) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة.' });

    const token = issueAdminToken(user);
    res.cookie('admin_token', token, { httpOnly: true, sameSite: 'lax', maxAge: 12 * 3600 * 1000 });
    res.json({ ok: true, token, admin: { id: user.id, displayName: user.display_name, email: user.email, role: userRole(user), permissions: permissionsFor(user) } });
  } catch (e) {
    res.status(500).json({ error: 'خطأ في تسجيل دخول المسؤول: ' + e.message });
  }
});

app.post('/api/admin/logout', (req, res) => {
  res.clearCookie('admin_token');
  res.json({ ok: true });
});

// One-click secure transition from a signed-in staff profile to the Admin Center.
app.post('/api/admin/sso', authMiddleware, (req, res) => {
  if (!STAFF_ROLES.includes(userRole(req.user))) {
    return res.status(403).json({ error: 'هذا الحساب لا يملك صلاحية دخول لوحة التحكم.' });
  }
  const token = issueAdminToken(req.user);
  platform.addAudit(req.user.email || req.user.phone, 'دخول لوحة التحكم', `رتبة: ${userRole(req.user)}`);
  res.json({ ok: true, token, role: userRole(req.user), permissions: permissionsFor(req.user) });
});

app.get('/api/admin/me', adminMiddleware, (req, res) => {
  res.json({ admin: { id: req.admin.id, displayName: req.admin.display_name, email: req.admin.email, role: userRole(req.admin), permissions: permissionsFor(req.admin) } });
});

app.get('/api/admin/stats', adminMiddleware, permit('viewStats'), (req, res) => {
  const users = store.allUsers();
  const streams = Array.from(activeLiveStreams.values());
  res.json({
    totalUsers: users.length,
    verifiedUsers: users.filter(u => u.verified).length,
    bannedUsers: users.filter(u => u.banned).length,
    onlineUsers: onlineUsers.size,
    activeStreams: streams.length,
    totalViewers: streams.reduce((n, s) => n + (s.viewersCount || 0), 0),
    totalMessages: store.messageCount(),
    totalCoins: users.reduce((n, u) => n + (u.coins || 0), 0),
    totalDiamonds: users.reduce((n, u) => n + (u.diamonds || 0), 0),
    roleCounts: ['owner','admin','moderator','seller','member'].reduce((out,role)=>{out[role]=users.filter(u=>userRole(u)===role).length;return out;},{}),
    pendingPayments: platform.getPaymentOrders({status:'pending'}).length,
    engine: store.isFallback ? 'JSON-DB (fallback)' : 'SQLite (better-sqlite3)',
    uptimeSeconds: Math.round(process.uptime())
  });
});

app.get('/api/admin/users', adminMiddleware, permit('viewUsers'), (req, res) => {
  const q = String(req.query.q || '').toLowerCase().trim();
  let users = store.allUsers();
  if (q) {
    users = users.filter(u =>
      (u.display_name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.phone || '').includes(q) ||
      String(u.id) === q
    );
  }
  res.json({
    users: users.map(u => ({
      id: u.id,
      displayName: u.display_name,
      email: u.email,
      phone: u.phone,
      verified: !!u.verified,
      banned: !!u.banned,
      isAdmin: ['owner','admin'].includes(userRole(u)),
      role: userRole(u),
      language: u.language || 'ar',
      coins: u.coins || 0,
      diamonds: u.diamonds || 0,
      level: u.level || 1,
      avatarColor: u.avatar_color || '#8b5cf6',
      online: onlineUsers.has(u.id),
      createdAt: u.created_at
    }))
  });
});

app.post('/api/admin/users', adminMiddleware, permit('manageUsers'), async (req, res) => {
  const b = req.body || {};
  const displayName = String(b.displayName || '').trim();
  const email = String(b.email || '').toLowerCase().trim() || null;
  const phone = normalizePhone(String(b.phone || '')) || null;
  if (!displayName || (!email && !phone) || String(b.password || '').length < 6) {
    return res.status(400).json({ error: 'الاسم ووسيلة تواصل وكلمة مرور من 6 أحرف مطلوبة.' });
  }
  if (email && store.findUserByEmail(email)) return res.status(409).json({ error: 'البريد مستخدم مسبقاً.' });
  const requestedRole=['owner','admin','moderator','seller','member'].includes(b.role)?b.role:'member';
  if(requestedRole==='owner'&&userRole(req.admin)!=='owner') return res.status(403).json({error:'المالك فقط يمكنه إنشاء مالك آخر.'});
  const user = store.createUser({
    display_name: displayName, email, phone,
    password_hash: await bcrypt.hash(String(b.password), 10),
    verified: b.verified !== false, role: requestedRole, language: ['ar','en','fr'].includes(b.language) ? b.language : 'ar',
    coins: Math.max(0, parseInt(b.coins, 10) || platform.getSettings().defaultCoins),
    level: Math.max(1, parseInt(b.level, 10) || 1), avatar_color: b.avatarColor
  });
  platform.addAudit(req.admin.email, 'إنشاء مستخدم', `#${user.id} ${displayName}`);
  res.status(201).json({ ok: true, id: user.id });
});

app.patch('/api/admin/users/:id', adminMiddleware, permit('manageUsers'), async (req, res) => {
  const user = store.findUserById(req.params.id);
  if (!user) return res.status(404).json({ error: 'المستخدم غير موجود.' });

  const fields = {};
  const b = req.body || {};
  if (b.verified !== undefined) fields.verified = b.verified ? 1 : 0;
  if (b.banned !== undefined) fields.banned = b.banned ? 1 : 0;
  if (b.displayName !== undefined) fields.display_name = String(b.displayName).trim();
  if (b.email !== undefined) fields.email = String(b.email || '').toLowerCase().trim() || null;
  if (b.phone !== undefined) fields.phone = normalizePhone(String(b.phone || '')) || null;
  if (b.language !== undefined && ['ar','en','fr'].includes(b.language)) fields.language = b.language;
  if (b.avatarColor !== undefined && /^#[0-9a-f]{6}$/i.test(b.avatarColor)) fields.avatar_color = b.avatarColor;
  if (b.coins !== undefined) fields.coins = Math.max(0, parseInt(b.coins, 10) || 0);
  if (b.diamonds !== undefined) fields.diamonds = Math.max(0, parseInt(b.diamonds, 10) || 0);
  if (b.level !== undefined) fields.level = Math.max(1, parseInt(b.level, 10) || 1);
  if (b.role !== undefined && ['owner','admin','moderator','seller','member'].includes(b.role)) {
    if (b.role === 'owner' && userRole(req.admin) !== 'owner') return res.status(403).json({ error: 'المالك فقط يمكنه منح رتبة المالك.' });
    fields.role = b.role;
    fields.is_admin = ['owner','admin'].includes(b.role) ? 1 : 0;
  }
  if (b.password) fields.password_hash = await bcrypt.hash(String(b.password), 10);

  if (user.is_admin && fields.banned === 1) {
    return res.status(400).json({ error: 'لا يمكن حظر حساب مسؤول.' });
  }
  if (userRole(user) === 'owner' && userRole(req.admin) !== 'owner') return res.status(403).json({ error: 'لا يمكن تعديل حساب المالك.' });
  if (user.id === req.admin.id && fields.role && fields.role !== userRole(user)) {
    return res.status(400).json({ error: 'لا يمكنك تغيير رتبتك بنفسك.' });
  }

  const updated = store.updateUser(user.id, fields);
  platform.addAudit(req.admin.email, 'تعديل مستخدم', `#${user.id} ${user.display_name}`);
  if (fields.banned === 1) {
    io.emit('admin:banned', { userId: user.id });
  }
  res.json({ ok: true, user: { id: updated.id, verified: !!updated.verified, banned: !!updated.banned, coins: updated.coins, diamonds: updated.diamonds, level: updated.level, displayName: updated.display_name, role: userRole(updated) } });
});

app.delete('/api/admin/users/:id', adminMiddleware, permit('manageUsers'), (req, res) => {
  const user = store.findUserById(req.params.id);
  if (!user) return res.status(404).json({ error: 'المستخدم غير موجود.' });
  if (userRole(user) === 'owner') return res.status(400).json({ error: 'لا يمكن حذف حساب المالك.' });
  if (userRole(user) === 'admin' && userRole(req.admin) !== 'owner') return res.status(403).json({ error: 'المالك فقط يمكنه حذف حساب مسؤول.' });
  store.deleteUser(user.id);
  platform.addAudit(req.admin.email, 'حذف مستخدم', `#${user.id} ${user.display_name}`);
  res.json({ ok: true });
});

app.get('/api/admin/streams', adminMiddleware, permit('manageContent'), (req, res) => {
  res.json({ streams: Array.from(activeLiveStreams.values()) });
});

app.delete('/api/admin/streams/:id', adminMiddleware, permit('manageContent'), (req, res) => {
  const id = req.params.id;
  if (!activeLiveStreams.has(id)) return res.status(404).json({ error: 'البث غير موجود.' });
  activeLiveStreams.delete(id);
  io.to(`stream:${id}`).emit('stream:ended', { streamId: id, reason: 'admin' });
  io.emit('streams:updated', { streams: Array.from(activeLiveStreams.values()) });
  res.json({ ok: true });
});

app.get('/api/admin/messages', adminMiddleware, permit('moderateMessages'), (req, res) => {
  const limit = Math.min(100, parseInt(req.query.limit, 10) || 20);
  const rows = store.recentMessages(limit);
  res.json({
    messages: rows.map(m => ({
      id: m.id, from: m.from_user_id, to: m.to_user_id,
      body: m.body, createdAt: m.created_at
    }))
  });
});

app.delete('/api/admin/messages/:id', adminMiddleware, permit('moderateMessages'), (req, res) => {
  if (!store.deleteMessage(req.params.id)) return res.status(404).json({ error: 'الرسالة غير موجودة.' });
  platform.addAudit(req.admin.email, 'حذف رسالة', `رسالة #${req.params.id}`);
  res.json({ ok: true });
});

app.get('/api/admin/settings', adminMiddleware, permit('manageSettings'), (req, res) => {
  res.json({ settings: platform.getSettings() });
});

app.patch('/api/admin/settings', adminMiddleware, permit('manageSettings'), (req, res) => {
  const b = req.body || {};
  const patch = {
    siteName: String(b.siteName || 'LumaLive').trim().slice(0, 40),
    tagline: String(b.tagline || '').trim().slice(0, 160),
    taglineEn: String(b.taglineEn || '').trim().slice(0, 160),
    taglineFr: String(b.taglineFr || '').trim().slice(0, 160),
    version: String(b.version || '1.6.1').trim().slice(0, 20),
    supportEmail: String(b.supportEmail || '').trim().slice(0, 100),
    primaryColor: /^#[0-9a-f]{6}$/i.test(b.primaryColor) ? b.primaryColor : '#ff72ad',
    secondaryColor: /^#[0-9a-f]{6}$/i.test(b.secondaryColor) ? b.secondaryColor : '#9b8afb',
    backgroundColor: /^#[0-9a-f]{6}$/i.test(b.backgroundColor) ? b.backgroundColor : '#f7f8ff',
    surfaceColor: /^#[0-9a-f]{6}$/i.test(b.surfaceColor) ? b.surfaceColor : '#ffffff',
    textColor: /^#[0-9a-f]{6}$/i.test(b.textColor) ? b.textColor : '#29283b',
    themeMode: ['light','dark','aurora'].includes(b.themeMode) ? b.themeMode : 'light',
    fontScale: Math.min(1.2, Math.max(0.85, Number(b.fontScale) || 1)),
    borderRadius: Math.min(28, Math.max(8, parseInt(b.borderRadius, 10) || 18)),
    logoEmoji: String(b.logoEmoji || '🎥').trim().slice(0, 8),
    heroTitle: String(b.heroTitle || '').trim().slice(0, 100),
    heroTitleEn: String(b.heroTitleEn || '').trim().slice(0, 100),
    heroTitleFr: String(b.heroTitleFr || '').trim().slice(0, 100),
    heroSubtitle: String(b.heroSubtitle || '').trim().slice(0, 180),
    heroSubtitleEn: String(b.heroSubtitleEn || '').trim().slice(0, 180),
    heroSubtitleFr: String(b.heroSubtitleFr || '').trim().slice(0, 180),
    maintenanceMode: !!b.maintenanceMode,
    registrationEnabled: !!b.registrationEnabled,
    demoLoginEnabled: !!b.demoLoginEnabled,
    commentsEnabled: !!b.commentsEnabled,
    giftsEnabled: !!b.giftsEnabled,
    callsEnabled: !!b.callsEnabled,
    defaultCoins: Math.max(0, parseInt(b.defaultCoins, 10) || 0),
    maxMessageLength: Math.min(2000, Math.max(50, parseInt(b.maxMessageLength, 10) || 500))
  };
  const settings = platform.updateSettings(patch);
  platform.addAudit(req.admin.email, 'تحديث إعدادات المنصة', 'تم حفظ إعدادات التشغيل والمظهر');
  io.emit('platform:config', publicPlatformConfig());
  res.json({ ok: true, settings });
});

app.get('/api/admin/gifts', adminMiddleware, permit('manageGifts'), (req, res) => res.json({ gifts: platform.getGifts(true) }));
app.post('/api/admin/gifts', adminMiddleware, permit('manageGifts'), (req, res) => {
  const b = req.body || {};
  const id = String(b.id || b.name || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 30) || `gift_${Date.now()}`;
  const gift = platform.saveGift({ id, name: String(b.name || 'هدية').trim().slice(0, 40), icon: String(b.icon || '🎁').slice(0, 8), coins: Math.max(1, parseInt(b.coins, 10) || 1), enabled: b.enabled !== false });
  GIFTS_CATALOG = platform.getGifts(true);
  platform.addAudit(req.admin.email, 'حفظ هدية', `${gift.icon} ${gift.name}`);
  res.json({ ok: true, gift });
});
app.patch('/api/admin/gifts/:id', adminMiddleware, permit('manageGifts'), (req, res) => {
  if (!platform.getGifts(true).some(g => g.id === req.params.id)) return res.status(404).json({ error: 'الهدية غير موجودة.' });
  const b = req.body || {};
  const gift = platform.saveGift({ id: req.params.id, ...(b.name !== undefined ? { name: String(b.name).trim().slice(0, 40) } : {}), ...(b.icon !== undefined ? { icon: String(b.icon).slice(0, 8) } : {}), ...(b.coins !== undefined ? { coins: Math.max(1, parseInt(b.coins, 10) || 1) } : {}), ...(b.enabled !== undefined ? { enabled: !!b.enabled } : {}) });
  GIFTS_CATALOG = platform.getGifts(true);
  platform.addAudit(req.admin.email, 'تعديل هدية', gift.name);
  res.json({ ok: true, gift });
});
app.delete('/api/admin/gifts/:id', adminMiddleware, permit('manageGifts'), (req, res) => {
  if (!platform.deleteGift(req.params.id)) return res.status(404).json({ error: 'الهدية غير موجودة.' });
  GIFTS_CATALOG = platform.getGifts(true);
  platform.addAudit(req.admin.email, 'حذف هدية', req.params.id);
  res.json({ ok: true });
});

app.get('/api/admin/announcements', adminMiddleware, permit('manageContent'), (req, res) => res.json({ announcements: platform.getAnnouncements() }));
app.post('/api/admin/announcements', adminMiddleware, permit('manageContent'), (req, res) => {
  const b = req.body || {};
  if (!String(b.title || '').trim() || !String(b.body || '').trim()) return res.status(400).json({ error: 'العنوان والنص مطلوبان.' });
  const announcement = platform.addAnnouncement({ title: String(b.title).trim().slice(0, 80), body: String(b.body).trim().slice(0, 400), type: ['info','success','warning','danger'].includes(b.type) ? b.type : 'info', active: b.active !== false });
  platform.addAudit(req.admin.email, 'إضافة إعلان', announcement.title);
  io.emit('platform:announcement', announcement);
  res.status(201).json({ ok: true, announcement });
});
app.patch('/api/admin/announcements/:id', adminMiddleware, permit('manageContent'), (req, res) => {
  const announcement = platform.updateAnnouncement(req.params.id, { active: !!req.body.active });
  if (!announcement) return res.status(404).json({ error: 'الإعلان غير موجود.' });
  platform.addAudit(req.admin.email, 'تغيير حالة إعلان', announcement.title);
  res.json({ ok: true, announcement });
});
app.delete('/api/admin/announcements/:id', adminMiddleware, permit('manageContent'), (req, res) => {
  if (!platform.deleteAnnouncement(req.params.id)) return res.status(404).json({ error: 'الإعلان غير موجود.' });
  platform.addAudit(req.admin.email, 'حذف إعلان', req.params.id);
  res.json({ ok: true });
});

app.post('/api/admin/streams', adminMiddleware, permit('manageContent'), (req, res) => {
  const b = req.body || {};
  const id = `admin_stream_${Date.now()}`;
  const stream = { id, title: String(b.title || 'بث مميز').trim().slice(0, 100), category: ['music','gaming','chat'].includes(b.category) ? b.category : 'chat', host: { id: 0, displayName: String(b.hostName || 'إدارة LumaLive').trim().slice(0, 50), avatarColor: b.avatarColor || '#9b8afb', level: 99 }, viewersCount: Math.max(1, parseInt(b.viewersCount, 10) || 1), likesCount: 0, diamondsEarned: 0, tags: ['مميز'], thumbnailGradient: 'linear-gradient(135deg, #f9a8d4, #c4b5fd)', videoUrl: String(b.videoUrl || '').trim() || '/videos/chat-live.mp4', startedAt: Date.now(), isSimulated: true };
  activeLiveStreams.set(id, stream);
  platform.addAudit(req.admin.email, 'إنشاء بث مميز', stream.title);
  io.emit('streams:updated', { streams: Array.from(activeLiveStreams.values()) });
  res.status(201).json({ ok: true, stream });
});
app.patch('/api/admin/streams/:id', adminMiddleware, permit('manageContent'), (req, res) => {
  const stream = activeLiveStreams.get(req.params.id);
  if (!stream) return res.status(404).json({ error: 'البث غير موجود.' });
  const b = req.body || {};
  if (b.title !== undefined) stream.title = String(b.title).trim().slice(0, 100);
  if (b.category !== undefined && ['music','gaming','chat'].includes(b.category)) stream.category = b.category;
  if (b.viewersCount !== undefined) stream.viewersCount = Math.max(0, parseInt(b.viewersCount, 10) || 0);
  if (b.videoUrl !== undefined) stream.videoUrl = String(b.videoUrl).trim();
  platform.addAudit(req.admin.email, 'تعديل بث', stream.title);
  io.emit('streams:updated', { streams: Array.from(activeLiveStreams.values()) });
  res.json({ ok: true, stream });
});

app.get('/api/admin/audit', adminMiddleware, permit('viewAudit'), (req, res) => res.json({ audit: platform.getAudit(Math.min(300, parseInt(req.query.limit, 10) || 100)) }));

// Coin store, payment requests and manual confirmation workflow
app.get('/api/coin-store', (req, res) => res.json({ packages: platform.getCoinPackages(false), methods: platform.getPaymentMethods(false) }));
app.post('/api/payments/orders', authMiddleware, (req, res) => {
  const b=req.body||{};
  const pack=platform.getCoinPackages(false).find(p=>p.id===b.packageId);
  const method=platform.getPaymentMethods(false).find(m=>m.id===b.methodId);
  if(!pack||!method) return res.status(400).json({error:'الباقة أو وسيلة الدفع غير صالحة.'});
  if(!method.account) return res.status(503).json({error:'محفظة استلام USDT لم يتم إعدادها بعد من طرف المالك.'});
  if(!String(b.reference||'').trim()) return res.status(400).json({error:'رقم مرجع عملية الدفع مطلوب.'});
  const rawProof=String(b.proofUrl||'').trim();
  const proofUrl=/^https?:\/\//i.test(rawProof)?rawProof.slice(0,500):'';
  const order=platform.createPaymentOrder({userId:req.user.id,packageId:pack.id,packageName:pack.name,coins:pack.coins,price:pack.price,currency:pack.currency,methodId:method.id,methodName:`${method.name}${method.network?` (${method.network})`:''}`,reference:String(b.reference).trim().slice(0,80),proofUrl,note:String(b.note||'').trim().slice(0,300)});
  platform.addAudit(req.user.email||req.user.phone, 'طلب شراء عملات', `${order.id} - ${order.coins} عملة`);
  res.status(201).json({ok:true,order});
});
app.get('/api/payments/my', authMiddleware, (req,res)=>res.json({orders:platform.getPaymentOrders({userId:req.user.id})}));

app.get('/api/admin/payments', adminMiddleware, permit('managePayments'), (req,res)=>{
  const users=store.allUsers();
  const orders=platform.getPaymentOrders(req.query.status?{status:req.query.status}:{}).map(o=>({...o,user:publicUser(users.find(u=>u.id===o.userId))}));
  res.json({orders,packages:platform.getCoinPackages(true),methods:platform.getPaymentMethods(true)});
});
app.patch('/api/admin/payments/:id', adminMiddleware, permit('managePayments'), (req,res)=>{
  const order=platform.findPaymentOrder(req.params.id);
  if(!order) return res.status(404).json({error:'طلب الدفع غير موجود.'});
  const status=String(req.body.status||'');
  if(!['approved','rejected','pending'].includes(status)) return res.status(400).json({error:'حالة الطلب غير صالحة.'});
  if(order.creditedAt&&status!=='approved') return res.status(400).json({error:'لا يمكن تغيير طلب تم إضافة رصيده.'});
  if(status==='approved'&&!order.creditedAt){
    const user=store.findUserById(order.userId);
    if(!user) return res.status(404).json({error:'صاحب الطلب غير موجود.'});
    const newCoins=(user.coins||0)+order.coins;
    store.updateUser(user.id,{coins:newCoins});
    order.creditedAt=Date.now();
    io.to(`user:${user.id}`).emit('wallet:update',{coins:newCoins});
  }
  const updated=platform.updatePaymentOrder(order.id,{status,reviewedBy:req.admin.email,reviewNote:String(req.body.reviewNote||'').slice(0,300),reviewedAt:Date.now(),creditedAt:order.creditedAt||null});
  platform.addAudit(req.admin.email,status==='approved'?'تأكيد دفع وإضافة عملات':'تحديث طلب دفع',`${order.id} - ${status}`);
  res.json({ok:true,order:updated});
});
app.post('/api/admin/coin-packages', adminMiddleware, permit('manageCoinPackages'), (req,res)=>{
  const b=req.body||{};const id=String(b.id||`pack_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g,'');
  const item=platform.saveCoinPackage({id,name:String(b.name||'باقة عملات').slice(0,50),coins:Math.max(1,parseInt(b.coins,10)||1),price:Math.max(0,Number(b.price)||0),currency:'USD',enabled:b.enabled!==false});
  platform.addAudit(req.admin.email,'حفظ باقة عملات',item.name);res.json({ok:true,item});
});
app.delete('/api/admin/coin-packages/:id', adminMiddleware, permit('manageCoinPackages'), (req,res)=>res.json({ok:platform.deleteCoinPackage(req.params.id)}));
app.post('/api/admin/payment-methods', adminMiddleware, permit('managePaymentConfig'), (req,res)=>{
  const b=req.body||{};
  const network=String(b.network||'TRC20').toUpperCase().replace(/[^A-Z0-9_-]/g,'').slice(0,20);
  const account=String(b.account||'').trim().slice(0,150);
  if(account.length<10) return res.status(400).json({error:'عنوان محفظة USDT غير صالح أو قصير جداً.'});
  const item=platform.savePaymentMethod({id:'usdt',name:'USDT',network,account,enabled:true});
  platform.addAudit(req.admin.email,'تحديث محفظة استلام USDT',`الشبكة: ${network}`);res.json({ok:true,item});
});
app.delete('/api/admin/payment-methods/:id', adminMiddleware, permit('managePaymentConfig'), (req,res)=>res.status(405).json({error:'لا يمكن حذف محفظة USDT الأساسية، يمكن للمالك تغيير عنوانها فقط.'}));

function publicPlatformConfig() {
  const s = platform.getSettings();
  return { ...s, announcements: platform.getAnnouncements().filter(a => a.active).slice(0, 3) };
}
app.get('/api/config', (req, res) => res.json(publicPlatformConfig()));

// ---------------- REST APIs ----------------

// Health
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'livechat-platform',
    activeStreams: activeLiveStreams.size,
    onlineUsers: onlineUsers.size,
    timestamp: new Date().toISOString()
  });
});

// Demo Login
app.post('/api/demo-login', async (req, res) => {
  try {
    const settings = platform.getSettings();
    if (settings.maintenanceMode) return res.status(503).json({ error: 'المنصة في وضع الصيانة.' });
    if (!settings.demoLoginEnabled) return res.status(403).json({ error: 'الدخول التجريبي معطل من الإدارة.' });
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
    if (!platform.getSettings().registrationEnabled) return res.status(403).json({ error: 'التسجيل الجديد متوقف مؤقتاً.' });
    let { displayName, method, identifier, password, language } = req.body;
    language = ['ar','en','fr'].includes(language) ? language : 'ar';
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
      user = store.updateUser(user.id, { coins: platform.getSettings().defaultCoins, language });
    }
    user = store.updateUser(user.id, { language });

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
  if (platform.getSettings().maintenanceMode) return res.status(503).json({ error: 'المنصة في وضع الصيانة، حاول لاحقاً.' });
  const { identifier, password } = req.body;
  if (!identifier || !password) return res.status(400).json({ error: 'الرجاء إدخال البيانات.' });
  const id = identifier.trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email = ? OR phone = ?').get(id, normalizePhone(identifier.trim()));
  if (!user) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة.' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'كلمة المرور غير صحيحة.' });

  if (user.banned) {
    return res.status(403).json({ error: 'تم حظر هذا الحساب من قبل الإدارة.' });
  }

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
  res.status(410).json({ error: 'الشحن المجاني متوقف. استخدم متجر العملات وأرسل إثبات الدفع.' });
});

// Gifts Catalog
app.get('/api/gifts', (req, res) => {
  if (!platform.getSettings().giftsEnabled) return res.json({ gifts: [] });
  res.json({ gifts: GIFTS_CATALOG.filter(g => g.enabled !== false) });
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
    const settings = platform.getSettings();
    if (!settings.commentsEnabled) return socket.emit('error:toast', { message: 'التعليقات معطلة حالياً.' });
    if (!body || !body.trim()) return;
    body = String(body).slice(0, settings.maxMessageLength);
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

  // Sending Gifts (LumaLive Virtual Gifts)
  socket.on('stream:gift', ({ streamId, giftId }) => {
    if (!platform.getSettings().giftsEnabled) return socket.emit('error:toast', { message: 'الهدايا معطلة حالياً.' });
    const gift = GIFTS_CATALOG.find(g => g.id === giftId && g.enabled !== false);
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
    const maxLength = platform.getSettings().maxMessageLength;
    if (!to || !body || !body.trim()) return;
    body = String(body).slice(0, maxLength);
    const info = db.prepare(`INSERT INTO messages (from_user_id, to_user_id, body, created_at, is_read)
      VALUES (?, ?, ?, ?, 0)`).run(uid, to, body.trim(), Date.now());
    const payload = { id: info.lastInsertRowid, from: uid, to, body: body.trim(), createdAt: Date.now() };
    io.to(`user:${to}`).emit('chat:message', payload);
    socket.emit('chat:message', payload);
  });

  socket.on('call:invite', ({ to, isVideo = true }) => {
    if (!platform.getSettings().callsEnabled) return socket.emit('error:toast', { message: 'المكالمات معطلة حالياً.' });
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
  console.log(`🌟 LumaLive Platform running on http://0.0.0.0:${PORT}`);
});
