/**
 * Database Module for livechat-video-app (Tango / SuperLive Edition).
 * Supports better-sqlite3 with an automatic zero-dependency fallback engine.
 */

const fs = require('fs');
const path = require('path');

const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbFilePath = path.join(dataDir, 'app.db');
let dbInstance = null;

try {
  const Database = require('better-sqlite3');
  dbInstance = new Database(dbFilePath);
  dbInstance.pragma('journal_mode = WAL');

  // --- Schema (idempotent) ---
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      display_name TEXT,
      email TEXT,
      phone TEXT,
      password_hash TEXT,
      verified INTEGER DEFAULT 0,
      avatar_color TEXT DEFAULT '#4f46e5',
      avatar_img TEXT,
      coins INTEGER DEFAULT 500,
      diamonds INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1,
      followers_count INTEGER DEFAULT 0,
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS verification_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      code TEXT,
      channel TEXT,
      target TEXT,
      purpose TEXT,
      expires_at INTEGER,
      used INTEGER DEFAULT 0,
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_user_id INTEGER,
      to_user_id INTEGER,
      body TEXT,
      created_at INTEGER,
      is_read INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS streams (
      id TEXT PRIMARY KEY,
      host_id INTEGER,
      title TEXT,
      status TEXT DEFAULT 'live',
      viewers INTEGER DEFAULT 0,
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS gifts_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_user_id INTEGER,
      to_user_id INTEGER,
      stream_id TEXT,
      gift_key TEXT,
      cost INTEGER,
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS follows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      follower_id INTEGER,
      following_id INTEGER,
      created_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
    CREATE INDEX IF NOT EXISTS idx_codes_user ON verification_codes(user_id);
    CREATE INDEX IF NOT EXISTS idx_msgs_pair ON messages(from_user_id, to_user_id);
  `);

  // --- Lightweight migrations for pre-existing databases ---
  const userCols = dbInstance.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  const expected = {
    avatar_img: "TEXT",
    coins: "INTEGER DEFAULT 500",
    diamonds: "INTEGER DEFAULT 0",
    level: "INTEGER DEFAULT 1",
    followers_count: "INTEGER DEFAULT 0"
  };
  for (const [col, def] of Object.entries(expected)) {
    if (!userCols.includes(col)) {
      dbInstance.exec(`ALTER TABLE users ADD COLUMN ${col} ${def}`);
    }
  }

  console.log('✅ Connected to SQLite database using better-sqlite3 (schema ready).');
} catch (nativeErr) {
  console.warn('⚠️ better-sqlite3 unavailable (' + (nativeErr && nativeErr.message ? nativeErr.message.split('\n')[0] : nativeErr) + ').');
  console.warn('   → Falling back to the embedded JSON-DB engine.');

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

      // Maps an INSERT statement's column list to its values, correctly
      // handling a mix of placeholders (?) and inline literals (1, 'x', ...).
      function parseInsert(params) {
        const m = cleanSql.match(/INSERT INTO \w+\s*\(([^)]*)\)\s*VALUES\s*\(([^)]*)\)/i);
        if (!m) return null;
        const cols = m[1].split(',').map(c => c.trim());
        const vals = m[2].split(',').map(v => v.trim());
        const row = {};
        let pi = 0;
        cols.forEach((col, i) => {
          const v = vals[i];
          if (v === undefined) return;
          if (v === '?') {
            row[col] = params[pi++];
          } else if (/^'.*'$/.test(v)) {
            row[col] = v.slice(1, -1);
          } else if (/^-?\d+(\.\d+)?$/.test(v)) {
            row[col] = Number(v);
          } else {
            row[col] = v;
          }
        });
        return row;
      }

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
            const parsed = parseInsert(params) || {};
            const newUser = {
              id: newId,
              display_name: parsed.display_name,
              email: parsed.email,
              phone: parsed.phone,
              password_hash: parsed.password_hash,
              verified: Number(parsed.verified) === 1 ? 1 : 0,
              avatar_color: parsed.avatar_color || '#4f46e5',
              avatar_img: parsed.avatar_img || `https://api.dicebear.com/7.x/bottts/svg?seed=user_${newId}`,
              coins: 500, // Initial free welcome balance
              diamonds: 0,
              level: 1,
              followers_count: Math.floor(Math.random() * 50 + 10),
              created_at: parsed.created_at || Date.now()
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
            const p = parseInsert(params) || {};
            const newCode = {
              id: newId,
              user_id: parseInt(p.user_id, 10),
              code: String(p.code),
              channel: p.channel,
              target: p.target,
              purpose: p.purpose || 'register',
              expires_at: p.expires_at || (Date.now() + 600000),
              used: Number(p.used) === 1 ? 1 : 0,
              created_at: p.created_at || Date.now()
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
            const pm = parseInsert(params) || {};
            const newMsg = {
              id: newId,
              from_user_id: parseInt(pm.from_user_id, 10),
              to_user_id: parseInt(pm.to_user_id, 10),
              body: pm.body,
              created_at: pm.created_at || Date.now(),
              is_read: Number(pm.is_read) === 1 ? 1 : 0
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
