/* Admin dashboard — LiveChat */
(() => {
  const $ = (s) => document.querySelector(s);
  const KEY = 'admin_token';
  let token = localStorage.getItem(KEY) || '';
  let usersCache = [];

  // ---------- helpers ----------
  async function api(path, opts = {}) {
    const res = await fetch(path, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(opts.headers || {})
      }
    });
    let data = {};
    try { data = await res.json(); } catch (_) {}
    if (!res.ok) throw new Error(data.error || 'حدث خطأ غير متوقع');
    return data;
  }

  let toastTimer;
  function toast(msg, kind = 'good') {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast ' + kind;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const fmt = (n) => Number(n || 0).toLocaleString('ar-EG');

  function when(ts) {
    if (!ts) return '—';
    const d = new Date(Number(ts));
    return isNaN(d) ? '—' : d.toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' });
  }

  // ---------- login ----------
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#login-btn');
    const err = $('#login-error');
    err.hidden = true;
    btn.disabled = true;
    btn.textContent = 'جارٍ التحقق…';
    try {
      const data = await api('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ email: $('#email').value, password: $('#password').value })
      });
      token = data.token;
      localStorage.setItem(KEY, token);
      $('#password').value = '';
      await showDashboard(data.admin);
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = 'دخول آمن';
    }
  });

  $('#logout-btn').addEventListener('click', async () => {
    try { await api('/api/admin/logout', { method: 'POST' }); } catch (_) {}
    token = '';
    localStorage.removeItem(KEY);
    $('#dash-view').hidden = true;
    $('#login-view').hidden = false;
  });

  $('#refresh-btn').addEventListener('click', () => loadAll());

  // ---------- tabs ----------
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      ['users', 'streams', 'messages'].forEach(name => {
        $('#tab-' + name).hidden = (name !== tab.dataset.tab);
      });
    });
  });

  // ---------- render ----------
  function renderStats(s) {
    const items = [
      ['إجمالي المستخدمين', fmt(s.totalUsers)],
      ['موثّقون', fmt(s.verifiedUsers)],
      ['محظورون', fmt(s.bannedUsers)],
      ['متصل الآن', fmt(s.onlineUsers)],
      ['بثوث مباشرة', fmt(s.activeStreams)],
      ['إجمالي المشاهدين', fmt(s.totalViewers)],
      ['الرسائل', fmt(s.totalMessages)],
      ['العملات المتداولة', fmt(s.totalCoins)],
      ['الألماس', fmt(s.totalDiamonds)]
    ];
    $('#stats').innerHTML = items
      .map(([k, v]) => `<div class="stat"><div class="v">${v}</div><div class="k">${k}</div></div>`)
      .join('');
  }

  function renderUsers(users) {
    const body = $('#users-body');
    if (!users.length) {
      body.innerHTML = `<tr><td colspan="8"><div class="empty">لا توجد نتائج</div></td></tr>`;
      return;
    }
    body.innerHTML = users.map(u => {
      const initial = esc((u.displayName || '?').trim().charAt(0));
      const badges = [
        u.isAdmin ? '<span class="badge b-adm">مسؤول</span>' : '',
        u.banned ? '<span class="badge b-bad">محظور</span>'
          : (u.verified ? '<span class="badge b-ok">موثّق</span>' : '<span class="badge b-warn">غير موثّق</span>'),
        u.online ? '<span class="badge b-on">متصل</span>' : ''
      ].join('');
      return `<tr data-id="${u.id}">
        <td>${u.id}</td>
        <td><div class="u">
          <div class="av" style="background:${esc(u.avatarColor)}">${initial}</div>
          <div><div>${esc(u.displayName)}</div><div class="sub2">${when(u.createdAt)}</div></div>
        </div></td>
        <td><div>${esc(u.email || '—')}</div><div class="sub2">${esc(u.phone || '')}</div></td>
        <td>${badges}</td>
        <td>${fmt(u.coins)}</td>
        <td>${fmt(u.diamonds)}</td>
        <td>${fmt(u.level)}</td>
        <td class="actions">
          <button class="btn ok" data-act="verify" ${u.verified ? 'disabled' : ''}>توثيق</button>
          <button class="btn warn" data-act="ban" ${u.isAdmin ? 'disabled' : ''}>${u.banned ? 'رفع الحظر' : 'حظر'}</button>
          <button class="btn" data-act="coins">عملات</button>
          <button class="btn bad" data-act="delete" ${u.isAdmin ? 'disabled' : ''}>حذف</button>
        </td>
      </tr>`;
    }).join('');
  }

  $('#users-body').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = Number(btn.closest('tr').dataset.id);
    const user = usersCache.find(u => u.id === id);
    if (!user) return;
    const act = btn.dataset.act;
    btn.disabled = true;
    try {
      if (act === 'verify') {
        await api(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify({ verified: true }) });
        toast('تم توثيق الحساب');
      } else if (act === 'ban') {
        await api(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify({ banned: !user.banned }) });
        toast(user.banned ? 'تم رفع الحظر' : 'تم حظر الحساب');
      } else if (act === 'coins') {
        const val = prompt(`رصيد العملات لـ ${user.displayName}`, user.coins);
        if (val === null) { btn.disabled = false; return; }
        await api(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify({ coins: val }) });
        toast('تم تحديث الرصيد');
      } else if (act === 'delete') {
        if (!confirm(`حذف الحساب "${user.displayName}" نهائياً؟`)) { btn.disabled = false; return; }
        await api(`/api/admin/users/${id}`, { method: 'DELETE' });
        toast('تم حذف الحساب');
      }
      await loadUsers();
      await loadStats();
    } catch (ex) {
      toast(ex.message, 'bad');
      btn.disabled = false;
    }
  });

  function renderStreams(streams) {
    const box = $('#streams-list');
    if (!streams.length) {
      box.innerHTML = `<div class="empty">لا توجد بثوث مباشرة حالياً</div>`;
      return;
    }
    box.innerHTML = streams.map(s => `
      <div class="scard">
        <h3>${esc(s.title || 'بث مباشر')}</h3>
        <div class="meta">
          ${esc(s.host?.displayName || '—')} · 👁️ ${fmt(s.viewersCount)} · 💎 ${fmt(s.diamondsEarned)}
        </div>
        <button class="btn bad" data-stream="${esc(s.id)}">إنهاء البث</button>
      </div>`).join('');
  }

  $('#streams-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-stream]');
    if (!btn) return;
    if (!confirm('إنهاء هذا البث المباشر؟')) return;
    btn.disabled = true;
    try {
      await api(`/api/admin/streams/${encodeURIComponent(btn.dataset.stream)}`, { method: 'DELETE' });
      toast('تم إنهاء البث');
      await loadStreams();
      await loadStats();
    } catch (ex) {
      toast(ex.message, 'bad');
      btn.disabled = false;
    }
  });

  function renderMessages(msgs) {
    const body = $('#messages-body');
    if (!msgs.length) {
      body.innerHTML = `<tr><td colspan="5"><div class="empty">لا توجد رسائل</div></td></tr>`;
      return;
    }
    const name = (id) => {
      const u = usersCache.find(x => x.id === id);
      return u ? esc(u.displayName) : '#' + id;
    };
    body.innerHTML = msgs.map(m => `<tr>
      <td>${m.id}</td><td>${name(m.from)}</td><td>${name(m.to)}</td>
      <td>${esc(m.body)}</td><td class="sub2">${when(m.createdAt)}</td>
    </tr>`).join('');
  }

  // ---------- loaders ----------
  async function loadStats() { renderStats(await api('/api/admin/stats')); }

  async function loadUsers() {
    const q = $('#search').value.trim();
    const data = await api('/api/admin/users' + (q ? '?q=' + encodeURIComponent(q) : ''));
    usersCache = data.users;
    renderUsers(usersCache);
  }

  async function loadStreams() { renderStreams((await api('/api/admin/streams')).streams); }
  async function loadMessages() { renderMessages((await api('/api/admin/messages?limit=50')).messages); }

  async function loadAll() {
    try {
      await Promise.all([loadStats(), loadUsers()]);
      await Promise.all([loadStreams(), loadMessages()]);
    } catch (ex) {
      toast(ex.message, 'bad');
    }
  }

  let searchTimer;
  $('#search').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadUsers().catch(ex => toast(ex.message, 'bad')), 250);
  });

  async function showDashboard(admin) {
    $('#login-view').hidden = true;
    $('#dash-view').hidden = false;
    $('#admin-email').textContent = admin?.email || '';
    await loadAll();
  }

  // auto refresh while visible
  setInterval(() => {
    if (!$('#dash-view').hidden && document.visibilityState === 'visible') {
      loadStats().catch(() => {});
    }
  }, 15000);

  // ---------- boot ----------
  (async () => {
    if (!token) return;
    try {
      const me = await api('/api/admin/me');
      await showDashboard(me.admin);
    } catch (_) {
      localStorage.removeItem(KEY);
      token = '';
    }
  })();
})();
