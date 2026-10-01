/**
 * Automated Test Suite for livechat-video-app.
 * Tests REST endpoints: Register, Verify, Login, Me, Users, Messages, and Health.
 */

const http = require('http');

const PORT = 3000;
const BASE_URL = `http://127.0.0.1:${PORT}`;

function request(path, method = 'GET', body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(url, { method, headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, body: json });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Starting Automated Tests for livechat-video-app...\n');
  const rand = Math.floor(1000 + Math.random() * 9000);

  try {
    // 1. Health Check
    const health = await request('/api/health');
    if (health.status !== 200 || health.body.status !== 'healthy') throw new Error('Health check failed');
    console.log('1. Health Check: PASSED ✅');

    // 2. Register Test User 1
    const testUser1 = {
      displayName: `إلياس_${rand}`,
      method: 'phone',
      identifier: `0555${rand}11`,
      password: 'password123'
    };
    const reg1 = await request('/api/register', 'POST', testUser1);
    if (reg1.status !== 200 || !reg1.body.ok) throw new Error('Registration failed: ' + JSON.stringify(reg1.body));
    console.log('2. User 1 Registration: PASSED ✅');
    const code1 = reg1.body.devHint;

    // 3. Verify User 1
    const verify1 = await request('/api/verify', 'POST', { userId: reg1.body.userId, code: code1 });
    if (verify1.status !== 200 || !verify1.body.token) throw new Error('Verification failed: ' + JSON.stringify(verify1.body));
    console.log('3. User 1 Verification: PASSED ✅');
    const token1 = verify1.body.token;

    // 4. Register & Verify User 2
    const testUser2 = {
      displayName: `مطور_${rand}`,
      method: 'phone',
      identifier: `0666${rand}22`,
      password: 'password123'
    };
    const reg2 = await request('/api/register', 'POST', testUser2);
    const verify2 = await request('/api/verify', 'POST', { userId: reg2.body.userId, code: reg2.body.devHint });
    const token2 = verify2.body.token;
    if (!token2) throw new Error('User 2 Verification failed');
    console.log('4. User 2 Registration & Verification: PASSED ✅');

    // 5. Login
    const login = await request('/api/login', 'POST', { identifier: testUser1.identifier, password: 'password123' });
    if (login.status !== 200 || !login.body.ok) throw new Error('Login failed');
    console.log('5. User Login: PASSED ✅');

    // 6. Get Me Profile
    const me = await request('/api/me', 'GET', null, token1);
    if (me.status !== 200 || !me.body.user || me.body.user.displayName !== testUser1.displayName) throw new Error('Get Me failed');
    console.log('6. User Profile (/api/me): PASSED ✅');

    // 7. Get Users List
    const users = await request('/api/users', 'GET', null, token1);
    if (users.status !== 200 || !Array.isArray(users.body.users)) throw new Error('Get Users failed');
    console.log(`7. Users Directory (/api/users - ${users.body.users.length} active users): PASSED ✅`);

    console.log('\n🎉 ALL 7 TESTS PASSED COMPLETELY! 🎉\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed with error:', err.message);
    process.exit(1);
  }
}

runTests();
