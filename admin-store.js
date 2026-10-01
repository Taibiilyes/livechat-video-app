/**
 * Engine-agnostic data access for the admin dashboard.
 * Works both with the native better-sqlite3 driver and with the
 * embedded JSON-DB fallback engine (which only understands a fixed
 * set of SQL statements).
 */

const db = require('./db');

// The fallback engine exposes its in-memory tables; native sqlite does not.
const isFallback = !!db.rawTables;

function persist() {
  if (isFallback && typeof db.save === 'function') db.save();
}

function allUsers() {
  if (isFallback) return db.rawTables.users.slice();
  return db.prepare('SELECT * FROM users ORDER BY id ASC').all();
}

function findUserById(id) {
  const uid = parseInt(id, 10);
  if (isFallback) return db.rawTables.users.find(u => u.id === uid) || null;
  return db.prepare('SELECT * FROM users WHERE id = ?').get(uid) || null;
}

function findUserByEmail(email) {
  const e = String(email || '').toLowerCase().trim();
  if (isFallback) {
    return db.rawTables.users.find(u => (u.email || '').toLowerCase() === e) || null;
  }
  return db.prepare('SELECT * FROM users WHERE email = ?').get(e) || null;
}

const UPDATABLE = [
  'display_name', 'email', 'phone', 'password_hash', 'verified',
  'banned', 'is_admin', 'role', 'coins', 'diamonds', 'level', 'avatar_color'
];

function updateUser(id, fields) {
  const uid = parseInt(id, 10);
  const entries = Object.entries(fields).filter(([k]) => UPDATABLE.includes(k));
  if (entries.length === 0) return findUserById(uid);

  if (isFallback) {
    const user = db.rawTables.users.find(u => u.id === uid);
    if (!user) return null;
    for (const [k, v] of entries) user[k] = v;
    persist();
    return user;
  }

  const setSql = entries.map(([k]) => `${k} = ?`).join(', ');
  db.prepare(`UPDATE users SET ${setSql} WHERE id = ?`)
    .run(...entries.map(([, v]) => v), uid);
  return findUserById(uid);
}

function deleteUser(id) {
  const uid = parseInt(id, 10);
  if (isFallback) {
    const t = db.rawTables;
    const before = t.users.length;
    t.users = t.users.filter(u => u.id !== uid);
    t.messages = t.messages.filter(m => m.from_user_id !== uid && m.to_user_id !== uid);
    t.verification_codes = t.verification_codes.filter(c => c.user_id !== uid);
    // keep the exported object in sync (rawTables is the same reference used by prepare())
    db.rawTables.users = t.users;
    db.rawTables.messages = t.messages;
    db.rawTables.verification_codes = t.verification_codes;
    persist();
    return before !== t.users.length;
  }
  db.prepare('DELETE FROM messages WHERE from_user_id = ? OR to_user_id = ?').run(uid, uid);
  db.prepare('DELETE FROM verification_codes WHERE user_id = ?').run(uid);
  const info = db.prepare('DELETE FROM users WHERE id = ?').run(uid);
  return info.changes > 0;
}

function createAdminUser({ display_name, email, password_hash, avatar_color }) {
  if (isFallback) {
    const users = db.rawTables.users;
    const newId = (users.length > 0 ? Math.max(...users.map(u => u.id)) : 0) + 1;
    const user = {
      id: newId,
      display_name,
      email,
      phone: null,
      password_hash,
      verified: 1,
      avatar_color: avatar_color || '#ef4444',
      avatar_img: null,
      coins: 999999,
      diamonds: 0,
      level: 99,
      followers_count: 0,
      is_admin: 1,
      role: 'owner',
      banned: 0,
      created_at: Date.now()
    };
    users.push(user);
    persist();
    return user;
  }
  const info = db.prepare(`
    INSERT INTO users (display_name, email, phone, password_hash, verified,
                       avatar_color, coins, diamonds, level, followers_count,
                       is_admin, role, banned, created_at)
    VALUES (?, ?, NULL, ?, 1, ?, 999999, 0, 99, 0, 1, 'owner', 0, ?)
  `).run(display_name, email, password_hash, avatar_color || '#ef4444', Date.now());
  return findUserById(info.lastInsertRowid);
}

function createUser(data) {
  if (isFallback) {
    const users = db.rawTables.users;
    const newId = (users.length ? Math.max(...users.map(u => u.id)) : 0) + 1;
    const user = {
      id: newId,
      display_name: data.display_name,
      email: data.email || null,
      phone: data.phone || null,
      password_hash: data.password_hash,
      verified: data.verified ? 1 : 0,
      avatar_color: data.avatar_color || '#8b5cf6',
      avatar_img: null,
      coins: data.coins || 0,
      diamonds: data.diamonds || 0,
      level: data.level || 1,
      followers_count: 0,
      is_admin: ['owner', 'admin'].includes(data.role) || data.is_admin ? 1 : 0,
      role: data.role || (data.is_admin ? 'admin' : 'member'),
      banned: 0,
      created_at: Date.now()
    };
    users.push(user); persist(); return user;
  }
  const role = data.role || (data.is_admin ? 'admin' : 'member');
  const info = db.prepare(`INSERT INTO users
    (display_name, email, phone, password_hash, verified, avatar_color, coins, diamonds, level, followers_count, is_admin, role, banned, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 0, ?)`)
    .run(data.display_name, data.email || null, data.phone || null, data.password_hash,
      data.verified ? 1 : 0, data.avatar_color || '#8b5cf6', data.coins || 0,
      data.diamonds || 0, data.level || 1, ['owner', 'admin'].includes(role) ? 1 : 0, role, Date.now());
  return findUserById(info.lastInsertRowid);
}

function messageCount() {
  if (isFallback) return db.rawTables.messages.length;
  return db.prepare('SELECT COUNT(*) AS c FROM messages').get().c;
}

function deleteMessage(id) {
  const mid = parseInt(id, 10);
  if (isFallback) {
    const before = db.rawTables.messages.length;
    db.rawTables.messages = db.rawTables.messages.filter(m => m.id !== mid);
    persist();
    return before !== db.rawTables.messages.length;
  }
  return db.prepare('DELETE FROM messages WHERE id = ?').run(mid).changes > 0;
}

function recentMessages(limit = 20) {
  if (isFallback) {
    return db.rawTables.messages.slice(-limit).reverse();
  }
  return db.prepare('SELECT * FROM messages ORDER BY id DESC LIMIT ?').all(limit);
}

module.exports = {
  isFallback,
  allUsers,
  findUserById,
  findUserByEmail,
  updateUser,
  deleteUser,
  createAdminUser,
  createUser,
  messageCount,
  deleteMessage,
  recentMessages
};
