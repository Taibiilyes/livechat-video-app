/**
 * LumaLive Live Streaming and Social Broadcasting Client
 */

(() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const state = {
    token: localStorage.getItem('token') || null,
    me: null,
    streams: [],
    gifts: [],
    activeStream: null,
    users: [],
    activeDmPeerId: null,
    socket: null,
    pendingUserId: null,
    pendingCode: null,
    currentCategory: 'all',
    studioStream: null,
    platformConfig: null,
    coinPackages: [], paymentMethods: [], selectedPackageId: null,
    call: { pc: null, peerId: null, localStream: null, iceQueue: [], role: null },
  };

  function showScreen(id) {
    ['auth-view', 'verify-view', 'app-view'].forEach(s => {
      const el = $(`#${s}`);
      if (el) el.classList.toggle('hidden', s !== id);
    });
  }

  function toast(msg) {
    const t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => t.classList.add('hidden'), 3500);
  }

  function initials(name) {
    return (name || '?').trim().charAt(0).toUpperCase();
  }

  function escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  async function api(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
    const res = await fetch(path, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw { status: res.status, ...data };
    return data;
  }

  async function loadPlatformConfig() {
    try {
      const config = await api('/api/config');
      state.platformConfig = config;
      document.title = `${config.siteName} — البث المباشر والمكالمات والهدايا`;
      ['#auth-site-name', '#header-site-name'].forEach(s => { const el=$(s); if(el) el.textContent=config.siteName; });
      ['#auth-version', '#header-version'].forEach(s => { const el=$(s); if(el) el.textContent=`الإصدار ${config.version}`; });
      const lang = window.I18N?.current() || 'ar';
      const localized = (base) => lang === 'en' ? (config[`${base}En`] || config[base]) : lang === 'fr' ? (config[`${base}Fr`] || config[base]) : config[base];
      if ($('#auth-tagline')) $('#auth-tagline').textContent = localized('tagline');
      if ($('#auth-logo-emoji')) $('#auth-logo-emoji').textContent = config.logoEmoji || '🎥';
      if ($('#header-logo-emoji')) $('#header-logo-emoji').textContent = config.logoEmoji || '🎥';
      if ($('#explore-hero-title')) $('#explore-hero-title').textContent = localized('heroTitle');
      if ($('#explore-hero-subtitle')) $('#explore-hero-subtitle').textContent = localized('heroSubtitle');
      const root = document.documentElement;
      root.style.setProperty('--primary-color', config.primaryColor);
      root.style.setProperty('--secondary-color', config.secondaryColor);
      root.style.setProperty('--primary-gradient', `linear-gradient(135deg, ${config.primaryColor}, ${config.secondaryColor})`);
      root.style.setProperty('--theme-background', config.backgroundColor);
      root.style.setProperty('--theme-surface', config.surfaceColor);
      root.style.setProperty('--theme-text', config.textColor);
      root.style.setProperty('--theme-radius', `${config.borderRadius}px`);
      root.style.setProperty('--theme-font-scale', config.fontScale);
      document.body.dataset.theme = config.themeMode || 'light';
      const box = $('#platform-announcements');
      const announcement = (config.announcements || [])[0];
      if (box) {
        if (announcement) { box.textContent = `${announcement.title}: ${announcement.body}`; box.className = `platform-announcements ${announcement.type || 'info'}`; }
        else box.className = 'platform-announcements hidden';
      }
      if ($('#btn-quick-demo')) $('#btn-quick-demo').classList.toggle('hidden', !config.demoLoginEnabled);
      if (config.maintenanceMode) toast('⚠️ المنصة في وضع الصيانة');
    } catch (e) { console.warn('Platform config unavailable'); }
  }

  // ---------------- Quick Demo Login ----------------
  const btnQuickDemo = $('#btn-quick-demo');
  if (btnQuickDemo) {
    btnQuickDemo.addEventListener('click', async () => {
      btnQuickDemo.disabled = true;
      btnQuickDemo.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جارٍ الدخول التجريبي...';
      try {
        const data = await api('/api/demo-login', { method: 'POST', body: JSON.stringify({}) });
        loginSuccess(data.token, data.user);
        toast('🎉 مرحباً بك في LumaLive!');
      } catch (err) {
        alert(err.error || 'تعذر الدخول التجريبي');
      } finally {
        btnQuickDemo.disabled = false;
        btnQuickDemo.innerHTML = `<i class="fa-solid fa-bolt-lightning"></i> ${window.I18N?.t('quickDemo', window.I18N.current()) || 'دخول سريع'}`;
      }
    });
  }

  // ---------------- Tabs (Login / Register) ----------------
  $$('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      $('#login-form').classList.toggle('active', tab === 'login');
      $('#register-form').classList.toggle('active', tab === 'register');
    });
  });

  let regMethod = 'email';
  $$('#reg-method .seg').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('#reg-method .seg').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      regMethod = btn.dataset.method;
      const label = $('#reg-identifier-label');
      const input = $('#reg-identifier');
      const lang = window.I18N?.current() || 'ar';
      if (regMethod === 'email') {
        label.textContent = window.I18N?.t('email', lang) || 'البريد الإلكتروني';
        input.placeholder = 'example@email.com';
        input.type = 'text';
      } else {
        label.textContent = window.I18N?.t('phone', lang) || 'رقم الهاتف';
        input.placeholder = lang === 'ar' ? '05xxxxxxxx أو 06xxxxxxxx' : '+213...';
        input.type = 'text';
      }
    });
  });
  window.addEventListener('language:changed', () => {
    const activeMethod = $(`#reg-method .seg[data-method="${regMethod}"]`);
    if (activeMethod) activeMethod.click();
    if (state.platformConfig) loadPlatformConfig();
  });

  // ---------------- Register ----------------
  $('#register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#register-msg');
    msg.textContent = ''; msg.className = 'form-msg';
    const displayName = $('#reg-name').value.trim();
    const identifier = $('#reg-identifier').value.trim();
    const password = $('#reg-password').value;

    try {
      const data = await api('/api/register', {
        method: 'POST',
        body: JSON.stringify({ displayName, method: regMethod, identifier, password, language: $('#reg-language').value }),
      });
      state.pendingUserId = data.userId;
      state.pendingCode = data.devHint;

      $('#verify-sub').textContent = `أدخل الرمز المرسل إلى (${data.target})`;
      const codeDisplay = $('#dev-hint-code-display');
      if (codeDisplay) codeDisplay.textContent = data.devHint || '123456';
      const verifyInput = $('#verify-code');
      if (verifyInput && data.devHint) verifyInput.value = data.devHint;

      showScreen('verify-view');
    } catch (err) {
      msg.textContent = err.error || 'حدث خطأ أثناء التسجيل';
      msg.classList.add('error');
    }
  });

  // ---------------- Verify ----------------
  const btnAutofill = $('#btn-autofill-code');
  if (btnAutofill) {
    btnAutofill.addEventListener('click', () => {
      if (state.pendingCode) {
        $('#verify-code').value = state.pendingCode;
        $('#verify-form').dispatchEvent(new Event('submit'));
      }
    });
  }

  $('#verify-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#verify-msg');
    msg.textContent = ''; msg.className = 'form-msg';
    const code = $('#verify-code').value.trim();

    try {
      const data = await api('/api/verify', {
        method: 'POST',
        body: JSON.stringify({ userId: state.pendingUserId, code }),
      });
      loginSuccess(data.token, data.user);
      toast('🎉 تم تأكيد حسابك بنجاح!');
    } catch (err) {
      msg.textContent = err.error || 'رمز التأكيد غير صحيح';
      msg.classList.add('error');
    }
  });

  const backBtn = $('#back-to-login-btn');
  if (backBtn) {
    backBtn.addEventListener('click', () => showScreen('auth-view'));
  }

  // ---------------- Login ----------------
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#login-msg');
    msg.textContent = ''; msg.className = 'form-msg';
    const identifier = $('#login-identifier').value.trim();
    const password = $('#login-password').value;

    try {
      const data = await api('/api/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password }),
      });
      loginSuccess(data.token, data.user);
    } catch (err) {
      if (err.needsVerification) {
        state.pendingUserId = err.userId;
        $('#verify-sub').textContent = 'حسابك غير مؤكد بعد، أدخل رمز التأكيد';
        showScreen('verify-view');
      } else {
        msg.textContent = err.error || 'بيانات الدخول غير صحيحة';
        msg.classList.add('error');
      }
    }
  });

  function loginSuccess(token, user) {
    state.token = token;
    state.me = user;
    localStorage.setItem('token', token);
    if (user.language && window.I18N) window.I18N.apply(user.language);
    updateUserUI();
    showScreen('app-view');
    connectSocket();
    loadStreams();
    loadGifts();
    loadLeaderboard();
    loadMyPayments();
  }

  function updateUserUI() {
    if (!state.me) return;
    $('#user-coins-display').textContent = (state.me.coins || 0).toLocaleString();
    $('#user-diamonds-display').textContent = (state.me.diamonds || 0).toLocaleString();
    const drawerCoins = $('#drawer-coins-amount');
    if (drawerCoins) drawerCoins.textContent = (state.me.coins || 0).toLocaleString();

    // Profile Tab
    const profName = $('#prof-name');
    if (profName) profName.textContent = state.me.displayName;
    const profSub = $('#prof-identifier');
    if (profSub) profSub.textContent = state.me.email || state.me.phone;
    const profAv = $('#prof-avatar');
    if (profAv) {
      profAv.textContent = initials(state.me.displayName);
      profAv.style.background = state.me.avatarColor;
    }
    const profCoins = $('#prof-coins');
    if (profCoins) profCoins.textContent = (state.me.coins || 0).toLocaleString();
    const profDiamonds = $('#prof-diamonds');
    if (profDiamonds) profDiamonds.textContent = (state.me.diamonds || 0).toLocaleString();
    const profFollowers = $('#prof-followers');
    if (profFollowers) profFollowers.textContent = state.me.followersCount || 12;
    const roleLabels = { owner: 'المالك', admin: 'مسؤول', moderator: 'مراقب', seller: 'بائع عملات', member: 'عضو' };
    const profLevel = $('#prof-level');
    if (profLevel) profLevel.textContent = `${roleLabels[state.me.role] || 'عضو'} · Lv. ${state.me.level || 1}`;
  }

  $('#btn-logout').addEventListener('click', () => {
    localStorage.removeItem('token');
    state.token = null; state.me = null;
    if (state.socket) state.socket.disconnect();
    showScreen('auth-view');
  });

  // ---------------- Navigation Tabs Switching ----------------
  $$('.livechat-bottom-nav .nav-item, .livechat-bottom-nav .nav-item-center').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      if (!targetId) return;

      $$('.livechat-bottom-nav .nav-item').forEach(b => b.classList.remove('active'));
      if (btn.classList.contains('nav-item')) btn.classList.add('active');

      $$('.tab-view').forEach(v => v.classList.remove('active'));
      const targetView = $(`#${targetId}`);
      if (targetView) targetView.classList.add('active');

      if (targetId === 'view-explore') loadStreams();
      if (targetId === 'view-leaderboard') loadLeaderboard();
      if (targetId === 'view-messages') loadDmContacts();
      if (targetId === 'view-go-live') initStudioPreview();
      if (targetId !== 'view-go-live') stopStudioPreview();
    });
  });

  // Category Filter in Explore
  $$('#category-filter-tabs .cat-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('#category-filter-tabs .cat-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.currentCategory = tab.dataset.cat;
      renderStreamsGrid();
    });
  });

  // ---------------- 1. Streams Explore & Feed ----------------
  async function loadStreams() {
    try {
      const data = await api('/api/streams');
      state.streams = data.streams || [];
      renderStreamsGrid();
    } catch (err) {
      console.error('Load streams error:', err);
    }
  }

  function renderStreamsGrid() {
    const grid = $('#streams-grid-container');
    if (!grid) return;
    grid.innerHTML = '';

    const filtered = state.streams.filter(s => state.currentCategory === 'all' || s.category === state.currentCategory);

    if (filtered.length === 0) {
      grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#9ca3af;">لا توجد بثوث نشطة في هذه الفئة حالياً. كن أول من يبدأ البث!</div>';
      return;
    }

    filtered.forEach(s => {
      const card = document.createElement('div');
      card.className = 'stream-card';
      const gradient = s.thumbnailGradient || 'linear-gradient(135deg, #4c1d95, #ec4899)';

      card.innerHTML = `
        <div class="stream-thumb" style="background:${gradient}">
          ${s.videoUrl ? `<video class="stream-preview-video" src="${escapeHtml(s.videoUrl)}" autoplay muted loop playsinline preload="metadata"></video>` : ''}
          <div class="stream-video-shade"></div>
          <div class="thumb-badges">
            <span class="badge-live-tag"><span class="live-pulse-dot"></span> مباشر</span>
            <span class="badge-viewers"><i class="fa-solid fa-eye"></i> ${(s.viewersCount || 1).toLocaleString()}</span>
          </div>
          <div class="thumb-bottom-tag">
            <span class="video-watch-label"><i class="fa-solid fa-circle-play"></i> شاهد البث</span>
            <span class="vip-badge-mini">💎 ${(s.diamondsEarned || 0).toLocaleString()}</span>
          </div>
        </div>
        <div class="stream-info-body">
          <div class="stream-avatar" style="background:${s.host.avatarColor || '#ec4899'}">
            ${initials(s.host.displayName)}
          </div>
          <div class="stream-meta">
            <div class="stream-title-text">${escapeHtml(s.title)}</div>
            <div class="stream-host-row">
              <span>${escapeHtml(s.host.displayName)}</span>
              <span class="vip-badge-mini">Lv. ${s.host.level || 1}</span>
            </div>
          </div>
        </div>
      `;

      card.addEventListener('click', () => openLiveStreamRoom(s));
      grid.appendChild(card);
    });
  }

  $('#btn-start-broadcast-banner').addEventListener('click', () => {
    $('.nav-item-center').click();
  });

  // ---------------- 2. Live Stream Room Overlay & Interaction ----------------
  function openLiveStreamRoom(stream) {
    state.activeStream = stream;
    const room = $('#live-room-overlay');
    room.classList.remove('hidden');

    $('#room-host-name').textContent = stream.host.displayName;
    $('#room-host-level').textContent = `Lv. ${stream.host.level || 1}`;
    $('#room-diamonds-count').textContent = (stream.diamondsEarned || 0).toLocaleString();
    $('#room-viewers-count').textContent = (stream.viewersCount || 1).toLocaleString();
    
    const hostAv = $('#room-host-avatar');
    hostAv.textContent = initials(stream.host.displayName);
    hostAv.style.background = stream.host.avatarColor || '#ec4899';

    // Clear old chat
    $('#room-chat-messages').innerHTML = '';

    // Join Socket Room
    if (state.socket) {
      state.socket.emit('stream:join', { streamId: stream.id });
    }

    // Play camera stream or one of the built-in demo live videos
    const video = $('#live-stream-video');
    const placeholder = $('#live-video-placeholder');
    video.pause();
    video.removeAttribute('src');
    video.srcObject = null;
    video.loop = true;
    placeholder.style.background = `linear-gradient(180deg, rgba(15,23,42,.28), rgba(15,23,42,.7)), ${stream.thumbnailGradient || 'linear-gradient(135deg, #c4b5fd, #f9a8d4)'}`;
    placeholder.classList.remove('hidden');

    if (stream.localMediaStream) {
      video.srcObject = stream.localMediaStream;
      video.muted = true;
      video.onplaying = () => placeholder.classList.add('hidden');
      video.play().catch(() => {});
    } else if (stream.videoUrl) {
      video.src = stream.videoUrl;
      video.muted = false;
      video.onplaying = () => placeholder.classList.add('hidden');
      video.play().catch(() => {
        video.muted = true;
        video.play().catch(() => {});
      });
    }
  }

  function closeLiveStreamRoom() {
    if (state.activeStream && state.socket) {
      state.socket.emit('stream:leave', { streamId: state.activeStream.id });
    }
    state.activeStream = null;
    const video = $('#live-stream-video');
    video.pause();
    video.srcObject = null;
    video.removeAttribute('src');
    video.load();
    $('#live-video-placeholder').classList.remove('hidden');
    $('#live-room-overlay').classList.add('hidden');
    loadStreams();
  }

  $('#btn-close-room').addEventListener('click', closeLiveStreamRoom);

  // Follow Streamer Button
  $('#btn-room-follow').addEventListener('click', () => {
    if (!state.activeStream || !state.socket) return;
    state.socket.emit('stream:follow', { streamId: state.activeStream.id, hostId: state.activeStream.host.id });
    $('#btn-room-follow').textContent = '✔ تم المتابعة';
    toast('⭐ تم متابعة البث بنجاح!');
  });

  // Live Comments
  $('#room-comment-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#room-comment-input');
    const body = input.value.trim();
    if (!body || !state.activeStream || !state.socket) return;
    state.socket.emit('stream:comment', { streamId: state.activeStream.id, body });
    input.value = '';
  });

  function appendStreamComment(c) {
    const box = $('#room-chat-messages');
    if (!box) return;
    const div = document.createElement('div');
    div.className = `live-chat-bubble ${c.isSystem ? 'system' : ''}`;
    div.innerHTML = `
      <span class="live-chat-user">${escapeHtml(c.user.displayName)}:</span>
      <span class="live-chat-text">${escapeHtml(c.body)}</span>
    `;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

  // Flying Hearts Generator (Likes)
  $('#btn-send-like').addEventListener('click', () => {
    if (!state.activeStream || !state.socket) return;
    state.socket.emit('stream:like', { streamId: state.activeStream.id });
    spawnFlyingHeart();
  });

  function spawnFlyingHeart() {
    const container = $('#flying-hearts-box');
    if (!container) return;
    const heart = document.createElement('div');
    heart.className = 'flying-heart';
    const icons = ['💖', '❤️', '🔥', '✨', '💜', '🌟'];
    heart.textContent = icons[Math.floor(Math.random() * icons.length)];
    heart.style.left = `${Math.random() * 50}px`;
    container.appendChild(heart);
    setTimeout(() => heart.remove(), 2500);
  }

  // ---------------- 3. Virtual Gifts System ----------------
  async function loadGifts() {
    try {
      const data = await api('/api/gifts');
      state.gifts = data.gifts || [];
      renderGiftsGrid();
    } catch (err) {
      console.error(err);
    }
  }

  function renderGiftsGrid() {
    const container = $('#gifts-grid-container');
    if (!container) return;
    container.innerHTML = '';

    state.gifts.forEach(g => {
      const btn = document.createElement('button');
      btn.className = 'gift-card-btn';
      btn.innerHTML = `
        <span class="gift-item-icon">${g.icon}</span>
        <span class="gift-item-name">${g.name}</span>
        <span class="gift-item-price">🪙 ${g.coins}</span>
      `;
      btn.addEventListener('click', () => sendGift(g.id));
      container.appendChild(btn);
    });
  }

  $('#btn-open-gifts').addEventListener('click', () => {
    $('#gifts-drawer-modal').classList.remove('hidden');
    const drawerCoins = $('#drawer-coins-amount');
    if (drawerCoins && state.me) drawerCoins.textContent = (state.me.coins || 0).toLocaleString();
  });

  $('#btn-close-gifts').addEventListener('click', () => {
    $('#gifts-drawer-modal').classList.add('hidden');
  });

  function sendGift(giftId) {
    if (!state.activeStream || !state.socket) return;
    state.socket.emit('stream:gift', { streamId: state.activeStream.id, giftId });
    $('#gifts-drawer-modal').classList.add('hidden');
  }

  function triggerGiftAnimation(event) {
    const banner = $('#gift-animation-banner');
    if (!banner) return;
    $('#gift-banner-icon').textContent = event.gift.icon;
    $('#gift-banner-sender').textContent = event.sender.displayName;
    $('#gift-banner-desc').textContent = `أرسل ${event.gift.name} (${event.gift.coins} عملة) 🎁!`;
    banner.classList.remove('hidden');

    // Update diamonds in header
    $('#room-diamonds-count').textContent = (event.diamondsTotal || 0).toLocaleString();

    // Add chat banner
    appendStreamComment({
      isSystem: true,
      user: event.sender,
      body: `🎁 أرسل [${event.gift.name}] للمضيف!`
    });

    setTimeout(() => {
      banner.classList.add('hidden');
    }, 3000);
  }

  // ---------------- 4. Go Live Studio ----------------
  async function initStudioPreview() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      state.studioStream = stream;
      $('#studio-preview-video').srcObject = stream;
    } catch (err) {
      console.warn('Camera preview unavailable, running in simulated broadcast mode.');
    }
  }

  function stopStudioPreview() {
    if (state.studioStream) {
      state.studioStream.getTracks().forEach(t => t.stop());
      state.studioStream = null;
    }
  }

  let selectedStudioCat = 'chat';
  $$('.studio-cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.studio-cat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedStudioCat = btn.dataset.cat;
    });
  });

  $('#btn-launch-stream').addEventListener('click', async () => {
    const title = $('#stream-title-input').value.trim();
    try {
      const data = await api('/api/streams/start', {
        method: 'POST',
        body: JSON.stringify({ title, category: selectedStudioCat }),
      });
      toast('🚀 تم بدء البث المباشر بنجاح!');
      const stream = data.stream;
      stream.localMediaStream = state.studioStream;
      openLiveStreamRoom(stream);
    } catch (err) {
      alert(err.error || 'تعذر بدء البث');
    }
  });

  // ---------------- 5. Coin Store & Payment Confirmation ----------------
  $('#btn-open-wallet').addEventListener('click', () => $('[data-target="view-profile"]').click());

  async function openCoinStore() {
    try {
      const data = await api('/api/coin-store');
      state.coinPackages = data.packages || [];
      state.paymentMethods = data.methods || [];
      state.selectedPackageId = state.coinPackages[0]?.id || null;
      renderCoinStore();
      $('#coin-store-modal').classList.remove('hidden');
    } catch (e) { toast(e.error || 'تعذر فتح متجر العملات'); }
  }
  function renderCoinStore() {
    $('#coin-packages-list').innerHTML = state.coinPackages.map(p => `<button type="button" class="coin-package ${p.id===state.selectedPackageId?'active':''}" data-package="${escapeHtml(p.id)}"><span>🪙 ${Number(p.coins).toLocaleString()}</span><b>${escapeHtml(p.name)}</b><small>${Number(p.price).toLocaleString()} ${escapeHtml(p.currency)}</small></button>`).join('');
    $('#payment-method-select').innerHTML = state.paymentMethods.map(m => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.name)} — ${escapeHtml(m.network || 'TRC20')}</option>`).join('');
    updatePaymentAccount();
  }
  function updatePaymentAccount() { const m=state.paymentMethods.find(x=>x.id===$('#payment-method-select').value)||state.paymentMethods[0]; const pack=state.coinPackages.find(p=>p.id===state.selectedPackageId); $('#payment-account-info').innerHTML=m&&m.account?`حوّل بالضبط <b>${Number(pack?.price||0).toLocaleString()} USDT</b> عبر شبكة <b>${escapeHtml(m.network||'TRC20')}</b><br><span dir="ltr">${escapeHtml(m.account)}</span>`:'لم يضبط المالك محفظة استقبال USDT بعد'; }
  $('#coin-packages-list').addEventListener('click',e=>{const b=e.target.closest('[data-package]');if(b){state.selectedPackageId=b.dataset.package;renderCoinStore();}});
  $('#payment-method-select').addEventListener('change',updatePaymentAccount);
  $('#btn-open-coin-store').addEventListener('click',openCoinStore);
  $('#btn-close-coin-store').addEventListener('click',()=>$('#coin-store-modal').classList.add('hidden'));
  $('#coin-order-form').addEventListener('submit',async e=>{e.preventDefault();try{await api('/api/payments/orders',{method:'POST',body:JSON.stringify({packageId:state.selectedPackageId,methodId:$('#payment-method-select').value,reference:$('#payment-reference').value,proofUrl:$('#payment-proof').value,note:$('#payment-note').value})});$('#coin-store-modal').classList.add('hidden');e.target.reset();toast('✅ تم إرسال الطلب، سيؤكد مسؤول البيع الدفع قريباً');loadMyPayments();}catch(err){toast(err.error||'تعذر إرسال طلب الدفع');}});
  async function loadMyPayments(){if(!state.token)return;try{const d=await api('/api/payments/my');const labels={pending:'بانتظار التأكيد',approved:'تم الدفع والشحن',rejected:'مرفوض'};$('#my-payment-status').innerHTML=(d.orders||[]).slice(0,3).map(o=>`<div class="payment-status-row"><span>${escapeHtml(o.packageName)} — ${Number(o.coins).toLocaleString()} عملة</span><b class="${o.status}">${labels[o.status]}</b></div>`).join('');}catch(_){} }
  const btnQuickAdd = $('#btn-quick-add-coins');
  if (btnQuickAdd) btnQuickAdd.addEventListener('click',()=>{ $('#gifts-drawer-modal').classList.add('hidden'); openCoinStore(); });

  // ---------------- 6. Leaderboard ----------------
  async function loadLeaderboard() {
    try {
      const data = await api('/api/leaderboard');
      renderLeaderboard(data.topStreamers || []);
    } catch (err) { console.error(err); }
  }

  function renderLeaderboard(list) {
    const container = $('#leaderboard-list-container');
    if (!container) return;
    container.innerHTML = '';

    list.forEach((u, idx) => {
      const card = document.createElement('div');
      card.className = 'lb-rank-card';
      const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
      card.innerHTML = `
        <div class="lb-rank-left">
          <span class="lb-rank-badge">${medal}</span>
          <div class="avatar" style="background:${u.avatarColor || '#ec4899'}">${initials(u.displayName)}</div>
          <div>
            <div style="font-weight:700;font-size:14px;">${escapeHtml(u.displayName)}</div>
            <div style="font-size:11px;color:#9ca3af;">المستوى: Lv. ${u.level || 1}</div>
          </div>
        </div>
        <div class="lb-score-tag">💎 ${(u.diamonds || 0).toLocaleString()} ماسة</div>
      `;
      container.appendChild(card);
    });
  }

  // ---------------- 7. Direct Messages (1:1) ----------------
  async function loadDmContacts() {
    try {
      const data = await api('/api/users');
      state.users = data.users || [];
      renderDmContacts();
    } catch (err) { console.error(err); }
  }

  function renderDmContacts(filter = '') {
    const list = $('#contacts-list-container');
    if (!list) return;
    list.innerHTML = '';
    const f = filter.trim().toLowerCase();

    state.users
      .filter(u => !f || u.displayName.toLowerCase().includes(f))
      .forEach(u => {
        const div = document.createElement('div');
        div.className = `contact-item ${u.id === state.activeDmPeerId ? 'active' : ''}`;
        div.innerHTML = `
          <div class="avatar" style="background:${u.avatarColor || '#4f46e5'}">
            ${initials(u.displayName)}
          </div>
          <div>
            <div style="font-weight:700;font-size:13px;">${escapeHtml(u.displayName)}</div>
            <div style="font-size:11px;color:${u.online ? '#10b981' : '#9ca3af'};">${u.online ? '🟢 متصل' : 'غير متصل'}</div>
          </div>
        `;
        div.addEventListener('click', () => openDmChat(u));
        list.appendChild(div);
      });
  }

  $('#search-contacts').addEventListener('input', (e) => renderDmContacts(e.target.value));

  async function openDmChat(user) {
    state.activeDmPeerId = user.id;
    renderDmContacts($('#search-contacts').value);
    $('#dm-empty-state').classList.add('hidden');
    $('#dm-chat-active').classList.remove('hidden');

    $('#dm-peer-name').textContent = user.displayName;
    $('#dm-peer-status').textContent = user.online ? '🟢 متصل الآن' : 'غير متصل';
    const av = $('#dm-peer-avatar');
    av.textContent = initials(user.displayName);
    av.style.background = user.avatarColor || '#4f46e5';

    const data = await api(`/api/messages/${user.id}`);
    const box = $('#dm-messages-box');
    box.innerHTML = '';
    (data.messages || []).forEach(m => appendDmMessage(m));
    box.scrollTop = box.scrollHeight;
  }

  function appendDmMessage(m) {
    const box = $('#dm-messages-box');
    if (!box) return;
    const div = document.createElement('div');
    const mine = m.from === state.me.id;
    div.className = `msg ${mine ? 'mine' : 'theirs'}`;
    const time = new Date(m.createdAt || Date.now()).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' });
    div.innerHTML = `${escapeHtml(m.body)}<span class="msg-time">${time}</span>`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

  $('#dm-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#dm-input');
    const body = input.value.trim();
    if (!body || !state.activeDmPeerId || !state.socket) return;
    state.socket.emit('chat:send', { to: state.activeDmPeerId, body });
    input.value = '';
  });

  // ---------------- 8. WebRTC 1:1 Video Calls ----------------
  const ICE_SERVERS = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

  function createPeerConnection(peerId) {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pc.onicecandidate = (e) => {
      if (e.candidate) state.socket.emit('webrtc:ice', { to: peerId, candidate: e.candidate });
    };
    pc.ontrack = (e) => {
      $('#remote-video').srcObject = e.streams[0];
    };
    return pc;
  }

  async function getLocalMedia() {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    $('#local-video').srcObject = stream;
    return stream;
  }

  function showCallOverlay(statusText) {
    $('#call-overlay').classList.remove('hidden');
    $('#call-status').textContent = statusText;
  }
  function hideCallOverlay() {
    $('#call-overlay').classList.add('hidden');
    $('#remote-video').srcObject = null;
    $('#local-video').srcObject = null;
  }

  $('#btn-dm-video-call').addEventListener('click', () => {
    if (!state.activeDmPeerId || state.call.peerId) return;
    state.call.peerId = state.activeDmPeerId;
    state.call.role = 'caller';
    showCallOverlay('جارٍ الاتصال، بانتظار الرد...');
    state.socket.emit('call:invite', { to: state.activeDmPeerId });
  });

  $('#end-call').addEventListener('click', () => {
    if (state.call.peerId) state.socket.emit('call:end', { to: state.call.peerId });
    endCall(false);
  });

  $('#accept-call').addEventListener('click', async () => {
    const caller = state.call.incomingFrom;
    $('#incoming-call').classList.add('hidden');
    state.call.peerId = caller.id;
    state.call.role = 'callee';
    showCallOverlay('جارٍ الاتصال...');
    try {
      state.call.localStream = await getLocalMedia();
    } catch (e) {
      toast('تعذر الوصول للكاميرا');
      endCall(true, caller.id);
      return;
    }
    state.socket.emit('call:accept', { to: caller.id });
  });

  $('#reject-call').addEventListener('click', () => {
    const caller = state.call.incomingFrom;
    $('#incoming-call').classList.add('hidden');
    if (caller) state.socket.emit('call:reject', { to: caller.id });
  });

  async function onCallAccepted(fromId) {
    if (state.call.role !== 'caller' || state.call.peerId !== fromId) return;
    showCallOverlay('جارٍ تجهيز الاتصال...');
    try {
      state.call.localStream = await getLocalMedia();
    } catch (e) {
      toast('تعذر الوصول للكاميرا');
      endCall(true, fromId);
      return;
    }
    const pc = createPeerConnection(fromId);
    state.call.pc = pc;
    state.call.localStream.getTracks().forEach(t => pc.addTrack(t, state.call.localStream));
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    state.socket.emit('webrtc:offer', { to: fromId, sdp: offer });
  }

  async function onOffer(fromId, sdp) {
    if (!state.call.peerId || state.call.peerId !== fromId) return;
    const pc = createPeerConnection(fromId);
    state.call.pc = pc;
    if (!state.call.localStream) {
      try { state.call.localStream = await getLocalMedia(); }
      catch (e) { endCall(true, fromId); return; }
    }
    state.call.localStream.getTracks().forEach(t => pc.addTrack(t, state.call.localStream));
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    state.socket.emit('webrtc:answer', { to: fromId, sdp: answer });
    showCallOverlay('متصل');
  }

  async function onAnswer(sdp) {
    if (!state.call.pc) return;
    await state.call.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    showCallOverlay('متصل');
  }

  function onRemoteIce(candidate) {
    if (state.call.pc && state.call.pc.remoteDescription) {
      state.call.pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
    }
  }

  function endCall(sendEndSignal, targetId) {
    const peerId = targetId || state.call.peerId;
    if (sendEndSignal && peerId) state.socket.emit('call:end', { to: peerId });
    if (state.call.pc) { state.call.pc.close(); }
    if (state.call.localStream) { state.call.localStream.getTracks().forEach(t => t.stop()); }
    state.call = { pc: null, peerId: null, localStream: null, iceQueue: [], role: null };
    hideCallOverlay();
  }

  // ---------------- 9. Socket.IO Connection ----------------
  function connectSocket() {
    if (state.socket) state.socket.disconnect();
    state.socket = io({ auth: { token: state.token } });

    // Stream events
    state.socket.on('stream:comment', (c) => appendStreamComment(c));
    state.socket.on('stream:like', () => spawnFlyingHeart());
    state.socket.on('stream:gift', (event) => triggerGiftAnimation(event));
    state.socket.on('stream:viewers_update', ({ viewersCount }) => {
      const v = $('#room-viewers-count');
      if (v) v.textContent = (viewersCount || 1).toLocaleString();
    });
    state.socket.on('wallet:update', ({ coins }) => {
      if (state.me) state.me.coins = coins;
      updateUserUI();
    });
    state.socket.on('error:toast', ({ message }) => toast(message));
    state.socket.on('platform:config', () => loadPlatformConfig());
    state.socket.on('platform:announcement', () => loadPlatformConfig());

    // Direct Chat events
    state.socket.on('chat:message', (m) => {
      if (state.activeDmPeerId === m.from || state.activeDmPeerId === m.to) {
        appendDmMessage(m);
      } else {
        toast(`رسالة جديدة من ${m.from}`);
      }
    });

    // Call signaling
    state.socket.on('call:invite', ({ from }) => {
      state.call.incomingFrom = from;
      $('#incoming-name').textContent = from.displayName;
      $('#incoming-avatar').textContent = initials(from.displayName);
      $('#incoming-call').classList.remove('hidden');
    });
    state.socket.on('call:accept', ({ from }) => onCallAccepted(from));
    state.socket.on('call:reject', () => { toast('تم رفض المكالمة'); endCall(false); });
    state.socket.on('call:cancel', () => { $('#incoming-call').classList.add('hidden'); toast('تم إلغاء المكالمة'); });
    state.socket.on('call:end', () => { toast('انتهت المكالمة'); endCall(false); });
    state.socket.on('webrtc:offer', ({ from, sdp }) => onOffer(from, sdp));
    state.socket.on('webrtc:answer', ({ sdp }) => onAnswer(sdp));
    state.socket.on('webrtc:ice', ({ candidate }) => onRemoteIce(candidate));
  }

  // ---------------- Boot ----------------
  async function boot() {
    await loadPlatformConfig();
    if (!state.token) { showScreen('auth-view'); return; }
    try {
      const data = await api('/api/me');
      loginSuccess(state.token, data.user);
    } catch (e) {
      localStorage.removeItem('token');
      showScreen('auth-view');
    }
  }

  boot();
})();
