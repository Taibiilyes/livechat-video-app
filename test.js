/**
 * Automated Test Suite for SuperLive & Tango Live Streaming Platform.
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
  console.log('🧪 Starting Tests for SuperLive & Tango Live Streaming Platform...\n');

  try {
    // 1. Health
    const health = await request('/api/health');
    if (health.status !== 200) throw new Error('Health Check Failed');
    console.log('1. Health Check & Live Engine Status: PASSED ✅');

    // 2. Demo Login
    const demo = await request('/api/demo-login', 'POST', {});
    if (demo.status !== 200 || !demo.body.token) throw new Error('Demo Login Failed');
    const token = demo.body.token;
    console.log(`2. 1-Click Demo Login (${demo.body.user.displayName}): PASSED ✅`);

    // 3. Streams Feed
    const streams = await request('/api/streams');
    if (streams.status !== 200 || !Array.isArray(streams.body.streams)) throw new Error('Streams list failed');
    console.log(`3. Live Streams Feed (${streams.body.streams.length} Active Streams): PASSED ✅`);

    // 4. Gifts Catalog
    const gifts = await request('/api/gifts');
    if (gifts.status !== 200 || !Array.isArray(gifts.body.gifts)) throw new Error('Gifts catalog failed');
    console.log(`4. Interactive Gifts Catalog (${gifts.body.gifts.length} Gifts): PASSED ✅`);

    // 5. Wallet Topup
    const topup = await request('/api/wallet/topup', 'POST', { amount: 1000 }, token);
    if (topup.status !== 200 || !topup.body.ok) throw new Error('Wallet topup failed');
    console.log(`5. Wallet Free Coins Topup (New Balance: ${topup.body.coins}): PASSED ✅`);

    // 6. Launch Live Stream
    const startStream = await request('/api/streams/start', 'POST', {
      title: 'بث مباشر تجريبي مع المتابعين',
      category: 'music'
    }, token);
    if (startStream.status !== 200 || !startStream.body.stream) throw new Error('Start stream failed');
    console.log(`6. Start Broadcast Live Stream (ID: ${startStream.body.stream.id}): PASSED ✅`);

    // 7. Leaderboard
    const lb = await request('/api/leaderboard');
    if (lb.status !== 200 || !Array.isArray(lb.body.topStreamers)) throw new Error('Leaderboard failed');
    console.log(`7. Top Streamers & Gifters Leaderboard: PASSED ✅`);

    console.log('\n🎉 ALL 7 SUPERLIVE & TANGO TESTS PASSED 100% SUCCESSFULLY! 🎉\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed with error:', err.message);
    process.exit(1);
  }
}

runTests();
