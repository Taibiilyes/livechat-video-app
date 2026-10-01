/**
 * Database Module for livechat-video-app (Tango / SuperLive Edition).
 * Supports better-sqlite3 with an automatic zero-dependency fallback engine.
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

  const jsonDbPath = path.join(dataDir, 'app_data.json');

  let tables = {
    users: [],
    verification_codes: [],
    messages: [],
    streams: [],
    gifts_history: [],
    follows: []
  };

  if (fs.existsSync(jsonDbPath)) {
    try {
      tables = JSON.parse(fs.readFileSync(jsonDbPath, 'utf8'));
      if (!tables.streams) tables.streams = [];
      if (!tables.gifts_history) tables.gifts_history = [];
      if (!tables.follows) tables.follows = [];
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
    rawTables: tables,
    save: persist,
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

          // 5. SELECT * FROM verification_codes
          if (/SELECT \* FROM verification_codes/i.test(cleanSql)) {
            const uid = parseInt(params[0], 10);
            const codes = tables.verification_codes.filter(c => c.user_id === uid && c.used === 0);
            if (codes.length === 0) {
              const allCodes = tables.verification_codes.filter(c => c.user_id === uid);
              return allCodes.length > 0 ? allCodes[allCodes.length - 1] : null;
            }
            return codes[codes.length - 1];
          }

          // 6. SELECT * FROM streams WHERE id = ?
          if (/SELECT \* FROM streams WHERE id = \?/i.test(cleanSql)) {
            const sid = String(params[0]);
            return tables.streams.find(s => String(s.id) === sid) || null;
          }

          // 7. First verified user
          if (/SELECT \* FROM users WHERE verified = 1 ORDER BY id ASC LIMIT 1/i.test(cleanSql)) {
            return tables.users.find(u => u.verified === 1) || null;
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

          // 2. SELECT * FROM users WHERE verified = 1
          if (/SELECT \* FROM users WHERE verified = 1/i.test(cleanSql)) {
            return tables.users.filter(u => u.verified === 1);
          }

          // 3. SELECT * FROM messages
          if (/SELECT \* FROM messages/i.test(cleanSql)) {
            const u1 = parseInt(params[0], 10);
            const u2 = parseInt(params[1], 10);
            return tables.messages.filter(m => 
              (m.from_user_id === u1 && m.to_user_id === u2) ||
              (m.from_user_id === u2 && m.to_user_id === u1)
            ).sort((a, b) => a.id - b.id);
          }

          // 4. SELECT * FROM streams WHERE status = 'live'
          if (/SELECT \* FROM streams/i.test(cleanSql)) {
            return tables.streams.filter(s => s.status === 'live');
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
              verified: params[4] !== undefined ? params[4] : 0,
              avatar_color: params[5] || '#4f46e5',
              avatar_img: params[6] || `https://api.dicebear.com/7.x/bottts/svg?seed=user_${newId}`,
              coins: 500, // Initial free welcome balance
              diamonds: 0,
              level: 1,
              followers_count: Math.floor(Math.random() * 50 + 10),
              created_at: Date.now()
            };
            tables.users.push(newUser);
            persist();
            return { lastInsertRowid: newId, changes: 1 };
          }

          // 2. UPDATE users (general update)
          if (/UPDATE users/i.test(cleanSql)) {
            persist();
            return { changes: 1 };
          }

          // 3. INSERT INTO verification_codes
          if (/INSERT INTO verification_codes/i.test(cleanSql)) {
            const newId = (tables.verification_codes.length > 0 ? Math.max(...tables.verification_codes.map(c => c.id)) : 0) + 1;
            const newCode = {
              id: newId,
              user_id: parseInt(params[0], 10),
              code: String(params[1]),
              channel: params[2],
              target: params[3],
              purpose: 'register',
              expires_at: params[4] || (Date.now() + 600000),
              used: 0,
              created_at: Date.now()
            };
            tables.verification_codes.push(newCode);
            persist();
            return { lastInsertRowid: newId, changes: 1 };
          }

          // 4. UPDATE verification_codes SET used = 1
          if (/UPDATE verification_codes SET used = 1/i.test(cleanSql)) {
            const cid = parseInt(params[0], 10);
            const code = tables.verification_codes.find(c => c.id === cid);
            if (code) {
              code.used = 1;
              persist();
              return { changes: 1 };
            }
            return { changes: 0 };
          }

          // 5. INSERT INTO messages
          if (/INSERT INTO messages/i.test(cleanSql)) {
            const newId = (tables.messages.length > 0 ? Math.max(...tables.messages.map(m => m.id)) : 0) + 1;
            const newMsg = {
              id: newId,
              from_user_id: parseInt(params[0], 10),
              to_user_id: parseInt(params[1], 10),
              body: params[2],
              created_at: Date.now(),
              is_read: 0
            };
            tables.messages.push(newMsg);
            persist();
            return { lastInsertRowid: newId, changes: 1 };
          }

          // 6. UPDATE messages SET is_read = 1
          if (/UPDATE messages SET is_read = 1/i.test(cleanSql)) {
            const fromId = parseInt(params[0], 10);
            const toId = parseInt(params[1], 10);
            tables.messages.forEach(m => {
              if (m.from_user_id === fromId && m.to_user_id === toId) {
                m.is_read = 1;
              }
            });
            persist();
            return { changes: 1 };
          }

          return { changes: 0 };
        }
      };
    }
  };
}

module.exports = dbInstance;
