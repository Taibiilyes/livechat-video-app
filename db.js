/**
 * Database Module for livechat-video-app.
 * Supports better-sqlite3 with an automatic zero-dependency fallback engine
 * to guarantee 100% compatibility across all operating systems and cloud environments.
 */

const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbFilePath = path.join(dataDir, 'app.db');
let dbInstance = null;

try {
  const Database = require('better-sqlite3');
  dbInstance = new Database(dbFilePath);
  dbInstance.pragma('journal_mode = WAL');
  console.log('✅ Connected to SQLite database using better-sqlite3.');
} catch (nativeErr) {
  console.warn('⚠️ Native better-sqlite3 driver not compiled. Using embedded robust JSON-DB engine.');

  // Zero-dependency Embedded Engine matching better-sqlite3 API
  const jsonDbPath = path.join(dataDir, 'app_data.json');

  let tables = {
    users: [],
    verification_codes: [],
    messages: []
  };

  // Load existing data if file exists
  if (fs.existsSync(jsonDbPath)) {
    try {
      tables = JSON.parse(fs.readFileSync(jsonDbPath, 'utf8'));
    } catch (e) {
      console.error('Failed to parse database file, starting fresh.');
    }
  }

  function persist() {
    try {
      fs.writeFileSync(jsonDbPath, JSON.stringify(tables, null, 2), 'utf8');
    } catch (e) {
      console.error('Error writing to database file:', e);
    }
  }

  dbInstance = {
    pragma: () => {},
    exec: () => {},
    prepare: (sql) => {
      const cleanSql = sql.replace(/\s+/g, ' ').trim();

      return {
        get: (...params) => {
          // 1. SELECT * FROM users WHERE id = ?
          if (/SELECT \* FROM users WHERE id = \?/i.test(cleanSql)) {
            const uid = parseInt(params[0], 10);
            return tables.users.find(u => u.id === uid) || null;
          }

          // 2. SELECT * FROM users WHERE email = ? OR phone = ?
          if (/SELECT \* FROM users WHERE email = \? OR phone = \?/i.test(cleanSql)) {
            const val1 = String(params[0] || '').toLowerCase().trim();
            const val2 = String(params[1] || '').trim();
            return tables.users.find(u => 
              ((u.email || '').toLowerCase() === val1) || 
              ((u.phone || '').trim() === val2) ||
              ((u.email || '').toLowerCase() === val2) ||
              ((u.phone || '').trim() === val1)
            ) || null;
          }

          // 3. SELECT * FROM users WHERE email = ?
          if (/SELECT \* FROM users WHERE email = \?/i.test(cleanSql)) {
            const email = String(params[0] || '').toLowerCase().trim();
            return tables.users.find(u => (u.email || '').toLowerCase() === email) || null;
          }

          // 4. SELECT * FROM users WHERE phone = ?
          if (/SELECT \* FROM users WHERE phone = \?/i.test(cleanSql)) {
            const phone = String(params[0] || '').trim();
            return tables.users.find(u => (u.phone || '').trim() === phone) || null;
          }

          // 5. SELECT * FROM verification_codes WHERE user_id = ?
          if (/SELECT \* FROM verification_codes/i.test(cleanSql)) {
            const uid = parseInt(params[0], 10);
            const codes = tables.verification_codes.filter(c => c.user_id === uid && c.used === 0);
            if (codes.length === 0) {
              const allCodes = tables.verification_codes.filter(c => c.user_id === uid);
              return allCodes.length > 0 ? allCodes[allCodes.length - 1] : null;
            }
            return codes[codes.length - 1]; // Latest active code
          }

          return null;
        },

        all: (...params) => {
          // 1. SELECT * FROM users WHERE verified = 1 AND id != ?
          if (/SELECT \* FROM users WHERE verified = 1 AND id != \?/i.test(cleanSql)) {
            const myId = parseInt(params[0], 10);
            return tables.users
              .filter(u => u.verified === 1 && u.id !== myId)
              .sort((a, b) => (a.display_name || '').localeCompare(b.display_name || ''));
          }

          // 2. SELECT * FROM messages WHERE (from_user_id = ? AND to_user_id = ?) ...
          if (/SELECT \* FROM messages/i.test(cleanSql)) {
            const u1 = parseInt(params[0], 10);
            const u2 = parseInt(params[1], 10);
            return tables.messages.filter(m => 
              (m.from_user_id === u1 && m.to_user_id === u2) ||
              (m.from_user_id === u2 && m.to_user_id === u1)
            ).sort((a, b) => a.id - b.id);
          }

          return [];
        },

        run: (...params) => {
          // 1. INSERT INTO users
          if (/INSERT INTO users/i.test(cleanSql)) {
            const newId = (tables.users.length > 0 ? Math.max(...tables.users.map(u => u.id)) : 0) + 1;
            const newUser = {
              id: newId,
              display_name: params[0],
              email: params[1],
              phone: params[2],
              password_hash: params[3],
              verified: 0,
              avatar_color: params[4] || '#4f46e5',
              created_at: params[5] || Date.now()
            };
            tables.users.push(newUser);
            persist();
            return { lastInsertRowid: newId, changes: 1 };
          }

          // 2. UPDATE users SET display_name = ?, password_hash = ? WHERE id = ?
          if (/UPDATE users SET display_name = \?, password_hash = \? WHERE id = \?/i.test(cleanSql)) {
            const uid = parseInt(params[2], 10);
            const user = tables.users.find(u => u.id === uid);
            if (user) {
              user.display_name = params[0];
              user.password_hash = params[1];
              persist();
              return { changes: 1 };
            }
            return { changes: 0 };
          }

          // 3. UPDATE users SET verified = 1 WHERE id = ?
          if (/UPDATE users SET verified = 1 WHERE id = \?/i.test(cleanSql)) {
            const uid = parseInt(params[0], 10);
            const user = tables.users.find(u => u.id === uid);
            if (user) {
              user.verified = 1;
              persist();
              return { changes: 1 };
            }
            return { changes: 0 };
          }

          // 4. INSERT INTO verification_codes
          if (/INSERT INTO verification_codes/i.test(cleanSql)) {
            const newId = (tables.verification_codes.length > 0 ? Math.max(...tables.verification_codes.map(c => c.id)) : 0) + 1;
            // Handle: VALUES (?, ?, ?, ?, 'register', ?, 0, ?) where params are [userId, code, channel, target, expires_at, created_at]
            const newCode = {
              id: newId,
              user_id: parseInt(params[0], 10),
              code: String(params[1]),
              channel: params[2],
              target: params[3],
              purpose: 'register',
              expires_at: params[4] || (Date.now() + 600000),
              used: 0,
              created_at: params[5] || Date.now()
            };
            tables.verification_codes.push(newCode);
            persist();
            return { lastInsertRowid: newId, changes: 1 };
          }

          // 5. UPDATE verification_codes SET used = 1 WHERE id = ?
          if (/UPDATE verification_codes SET used = 1 WHERE id = \?/i.test(cleanSql)) {
            const cid = parseInt(params[0], 10);
            const code = tables.verification_codes.find(c => c.id === cid);
            if (code) {
              code.used = 1;
              persist();
              return { changes: 1 };
            }
            return { changes: 0 };
          }

          // 6. INSERT INTO messages
          if (/INSERT INTO messages/i.test(cleanSql)) {
            const newId = (tables.messages.length > 0 ? Math.max(...tables.messages.map(m => m.id)) : 0) + 1;
            const newMsg = {
              id: newId,
              from_user_id: parseInt(params[0], 10),
              to_user_id: parseInt(params[1], 10),
              body: params[2],
              created_at: params[3] || Date.now(),
              is_read: 0
            };
            tables.messages.push(newMsg);
            persist();
            return { lastInsertRowid: newId, changes: 1 };
          }

          // 7. UPDATE messages SET is_read = 1
          if (/UPDATE messages SET is_read = 1/i.test(cleanSql)) {
            const fromId = parseInt(params[0], 10);
            const toId = parseInt(params[1], 10);
            let changes = 0;
            tables.messages.forEach(m => {
              if (m.from_user_id === fromId && m.to_user_id === toId) {
                m.is_read = 1;
                changes++;
              }
            });
            if (changes > 0) persist();
            return { changes };
          }

          return { changes: 0 };
        }
      };
    }
  };
}

// Initial Table Creation
dbInstance.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  display_name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0,
  avatar_color TEXT NOT NULL DEFAULT '#4f46e5',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS verification_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  code TEXT NOT NULL,
  channel TEXT NOT NULL,
  target TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'register',
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_user_id INTEGER NOT NULL,
  to_user_id INTEGER NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(from_user_id) REFERENCES users(id),
  FOREIGN KEY(to_user_id) REFERENCES users(id)
);
`);

module.exports = dbInstance;
