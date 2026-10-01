(() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const state = {
    token: localStorage.getItem('token') || null,
    me: null,
    users: [],
    activePeerId: null,
    socket: null,
    pendingUserId: null,
    pendingCode: null,
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

  async function api(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
    const res = await fetch(path, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw { status: res.status, ...data };
    return data;
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
        toast('تم تسجيل الدخول بحساب تجريبي بنجاح!');
      } catch (err) {
        alert(err.error || 'تعذر الدخول التجريبي');
      } finally {
        btnQuickDemo.disabled = false;
        btnQuickDemo.innerHTML = '<i class="fa-solid fa-bolt"></i> دخول سريع بحساب تجريبي فوري';
      }
    });
  }

  // ---------------- Tabs ----------------
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
      if (regMethod === 'email') {
        label.textContent = 'البريد الإلكتروني';
        input.placeholder = 'example@email.com';
        input.type = 'text';
      } else {
        label.textContent = 'رقم الهاتف';
        input.placeholder = '05xxxxxxxx أو 06xxxxxxxx';
        input.type = 'text';
      }
    });
  });

  // ---------------- Register ----------------
  $('#register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#register-msg');
    msg.textContent = ''; msg.className = 'form-msg';
    const displayName = $('#reg-name').value.trim();
    const identifier = $('#reg-identifier').value.trim();
    const password = $('#reg-password').value;

    const submitBtn = $('#register-form button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'جارٍ إنشاء الحساب...';

    try {
      const data = await api('/api/register', {
        method: 'POST',
        body: JSON.stringify({ displayName, method: regMethod, identifier, password }),
      });
      state.pendingUserId = data.userId;
      state.pendingCode = data.devHint;

      $('#verify-sub').textContent = `أدخل الرمز المرسل إلى (${data.target})`;
      const codeDisplay = $('#dev-hint-code-display');
      if (codeDisplay) {
        codeDisplay.textContent = data.devHint || '123456';
      }

      // Auto-fill code field
      const verifyInput = $('#verify-code');
      if (verifyInput && data.devHint) {
        verifyInput.value = data.devHint;
      }

      showScreen('verify-view');
    } catch (err) {
      msg.textContent = err.error || 'حدث خطأ أثناء التسجيل';
      msg.classList.add('error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'إنشاء الحساب والمتابعة';
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

    const submitBtn = $('#verify-form button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'جارٍ التحقق...';

    try {
      const data = await api('/api/verify', {
        method: 'POST',
        body: JSON.stringify({ userId: state.pendingUserId, code }),
      });
      loginSuccess(data.token, data.user);
      toast('🎉 تم تأكيد حسابك وتسجيل الدخول بنجاح!');
    } catch (err) {
      msg.textContent = err.error || 'رمز التأكيد غير صحيح';
      msg.classList.add('error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'تأكيد الحساب';
    }
  });

  const backBtn = $('#back-to-login-btn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      showScreen('auth-view');
    });
  }

  $('#resend-btn').addEventListener('click', async () => {
    try {
      const data = await api('/api/resend', {
        method: 'POST',
        body: JSON.stringify({ userId: state.pendingUserId }),
      });
      state.pendingCode = data.devHint;
      const codeDisplay = $('#dev-hint-code-display');
      if (codeDisplay) codeDisplay.textContent = data.devHint;
      const verifyInput = $('#verify-code');
      if (verifyInput && data.devHint) verifyInput.value = data.devHint;
      toast(data.message || 'تم إرسال رمز جديد');
    } catch (err) {
      toast(err.error || 'تعذر إعادة الإرسال');
    }
  });

  // ---------------- Login ----------------
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#login-msg');
    msg.textContent = ''; msg.className = 'form-msg';
    const identifier = $('#login-identifier').value.trim();
    const password = $('#login-password').value;

    const submitBtn = $('#login-form button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'جارٍ الدخول...';

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
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'دخول';
    }
  });

  function loginSuccess(token, user) {
    state.token = token;
    state.me = user;
    localStorage.setItem('token', token);
    $('#me-name').textContent = user.displayName;
    $('#me-sub').textContent = user.email || user.phone;
    const av = $('#me-avatar');
    av.textContent = initials(user.displayName);
    av.style.background = user.avatarColor;
    showScreen('app-view');
    connectSocket();
    loadUsers();
  }

  $('#logout-btn').addEventListener('click', () => {
    localStorage.removeItem('token');
    state.token = null; state.me = null;
    if (state.socket) state.socket.disconnect();
    showScreen('auth-view');
  });

  // ---------------- Boot ----------------
  async function boot() {
    if (!state.token) { showScreen('auth-view'); return; }
    try {
      const data = await api('/api/me');
      loginSuccess(state.token, data.user);
    } catch (e) {
      localStorage.removeItem('token');
      showScreen('auth-view');
    }
  }

  // ---------------- Users list ----------------
  async function loadUsers() {
    try {
      const data = await api('/api/users');
      state.users = data.users;
      renderUsers();
    } catch (e) { console.error(e); }
  }

  function renderUsers(filter = '') {
    const list = $('#users-list');
    list.innerHTML = '';
    const f = filter.trim().toLowerCase();
    const filtered = state.users
      .filter(u => !f || u.displayName.toLowerCase().includes(f) || (u.email || '').includes(f) || (u.phone || '').includes(f));

    if (filtered.length === 0) {
      list.innerHTML = '<div style="padding:16px;text-align:center;color:#9ca3af;font-size:13px;">لا توجد جهات اتصال مطابقة.</div>';
      return;
    }

    filtered.forEach(u => {
      const div = document.createElement('div');
      div.className = 'user-item' + (u.id === state.activePeerId ? ' active' : '');
      div.innerHTML = `
        <div class="avatar" style="background:${u.avatarColor}">
          ${initials(u.displayName)}
          <span class="dot ${u.online ? 'online' : ''}"></span>
        </div>
        <div class="user-meta">
          <div class="user-name">${escapeHtml(u.displayName)}</div>
          <div class="user-sub">${u.online ? '🟢 متصل الآن' : '⚪ غير متصل'}</div>
        </div>`;
      div.addEventListener('click', () => openChat(u));
      list.appendChild(div);
    });
  }

  $('#search-users').addEventListener('input', (e) => renderUsers(e.target.value));

  function escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  // ---------------- Chat ----------------
  async function openChat(user) {
    state.activePeerId = user.id;
    renderUsers($('#search-users').value);
    $('#chat-empty').classList.add('hidden');
    $('#chat-active').classList.remove('hidden');
    $('#peer-name').textContent = user.displayName;
    $('#peer-status').textContent = user.online ? '🟢 متصل الآن' : '⚪ غير متصل';
    const av = $('#peer-avatar');
    av.textContent = initials(user.displayName);
    av.style.background = user.avatarColor;

    const data = await api(`/api/messages/${user.id}`);
    const box = $('#messages');
    box.innerHTML = '';
    data.messages.forEach(m => appendMessage(m));
    box.scrollTop = box.scrollHeight;
  }

  function appendMessage(m) {
    if (m.from !== state.activePeerId && m.to !== state.activePeerId && m.from !== state.me.id) return;
    const box = $('#messages');
    const div = document.createElement('div');
    const mine = m.from === state.me.id;
    div.className = 'msg ' + (mine ? 'mine' : 'theirs');
    const time = new Date(m.createdAt || Date.now()).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' });
    div.innerHTML = `${escapeHtml(m.body)}<span class="msg-time">${time}</span>`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

  $('#message-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#message-input');
    const body = input.value.trim();
    if (!body || !state.activePeerId) return;
    state.socket.emit('chat:send', { to: state.activePeerId, body });
    input.value = '';
  });

  // ---------------- Socket.IO ----------------
  function connectSocket() {
    if (state.socket) state.socket.disconnect();
    state.socket = io({ auth: { token: state.token } });

    state.socket.on('chat:message', (m) => {
      appendMessage(m);
    });

    state.socket.on('presence', ({ userId, online }) => {
      const u = state.users.find(x => x.id === userId);
      if (u) { u.online = online; renderUsers($('#search-users').value); }
      if (state.activePeerId === userId) {
        $('#peer-status').textContent = online ? '🟢 متصل الآن' : '⚪ غير متصل';
      }
    });

    state.socket.on('connect', () => loadUsers());

    // ----- Call signaling -----
    state.socket.on('call:invite', ({ from }) => showIncoming(from));
    state.socket.on('call:accept', ({ from }) => onCallAccepted(from));
    state.socket.on('call:reject', () => { toast('تم رفض المكالمة'); endCall(false); });
    state.socket.on('call:cancel', () => { hideIncoming(); toast('تم إلغاء المكالمة'); });
    state.socket.on('call:end', () => { toast('انتهت المكالمة'); endCall(false); });
    state.socket.on('webrtc:offer', ({ from, sdp }) => onOffer(from, sdp));
    state.socket.on('webrtc:answer', ({ sdp }) => onAnswer(sdp));
    state.socket.on('webrtc:ice', ({ candidate }) => onRemoteIce(candidate));
  }

  // ================= WebRTC Video Call =================
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
  function showIncoming(caller) {
    if (state.call.peerId) {
      state.socket.emit('call:reject', { to: caller.id });
      return;
    }
    state.call.incomingFrom = caller;
    $('#incoming-name').textContent = caller.displayName;
    const av = $('#incoming-avatar');
    av.textContent = initials(caller.displayName);
    av.style.background = caller.avatarColor;
    $('#incoming-call').classList.remove('hidden');
  }
  function hideIncoming() {
    $('#incoming-call').classList.add('hidden');
    state.call.incomingFrom = null;
  }

  $('#video-call-btn').addEventListener('click', () => {
    if (!state.activePeerId || state.call.peerId) return;
    state.call.peerId = state.activePeerId;
    state.call.role = 'caller';
    showCallOverlay('جارٍ الاتصال، بانتظار الرد...');
    state.socket.emit('call:invite', { to: state.activePeerId });
  });

  $('#end-call').addEventListener('click', () => {
    if (state.call.peerId) state.socket.emit('call:end', { to: state.call.peerId });
    endCall(false);
  });

  $('#accept-call').addEventListener('click', async () => {
    const caller = state.call.incomingFrom;
    hideIncoming();
    state.call.peerId = caller.id;
    state.call.role = 'callee';
    showCallOverlay('جارٍ الاتصال...');
    try {
      state.call.localStream = await getLocalMedia();
    } catch (e) {
      toast('تعذر الوصول إلى الكاميرا/الميكروفون');
      endCall(true, caller.id);
      return;
    }
    state.socket.emit('call:accept', { to: caller.id });
  });

  $('#reject-call').addEventListener('click', () => {
    const caller = state.call.incomingFrom;
    hideIncoming();
    if (caller) state.socket.emit('call:reject', { to: caller.id });
  });

  async function onCallAccepted(fromId) {
    if (state.call.role !== 'caller' || state.call.peerId !== fromId) return;
    showCallOverlay('جارٍ تجهيز الاتصال...');
    try {
      state.call.localStream = await getLocalMedia();
    } catch (e) {
      toast('تعذر الوصول إلى الكاميرا/الميكروفون');
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
      catch (e) { toast('تعذر الوصول إلى الكاميرا/الميكروفون'); endCall(true, fromId); return; }
    }
    state.call.localStream.getTracks().forEach(t => pc.addTrack(t, state.call.localStream));
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    flushIceQueue();
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    state.socket.emit('webrtc:answer', { to: fromId, sdp: answer });
    showCallOverlay('متصل');
  }

  async function onAnswer(sdp) {
    if (!state.call.pc) return;
    await state.call.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    flushIceQueue();
    showCallOverlay('متصل');
  }

  function onRemoteIce(candidate) {
    if (state.call.pc && state.call.pc.remoteDescription) {
      state.call.pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
    } else {
      state.call.iceQueue.push(candidate);
    }
  }
  function flushIceQueue() {
    state.call.iceQueue.forEach(c => state.call.pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {}));
    state.call.iceQueue = [];
  }

  function endCall(sendEndSignal, targetId) {
    const peerId = targetId || state.call.peerId;
    if (sendEndSignal && peerId) state.socket.emit('call:end', { to: peerId });
    if (state.call.pc) { state.call.pc.close(); }
    if (state.call.localStream) { state.call.localStream.getTracks().forEach(t => t.stop()); }
    state.call = { pc: null, peerId: null, localStream: null, iceQueue: [], role: null };
    hideCallOverlay();
  }

  let micOn = true, camOn = true;
  $('#toggle-mic').addEventListener('click', () => {
    if (!state.call.localStream) return;
    micOn = !micOn;
    state.call.localStream.getAudioTracks().forEach(t => t.enabled = micOn);
    $('#toggle-mic').classList.toggle('off', !micOn);
    $('#toggle-mic').textContent = micOn ? '🎙️' : '🔇';
  });
  $('#toggle-cam').addEventListener('click', () => {
    if (!state.call.localStream) return;
    camOn = !camOn;
    state.call.localStream.getVideoTracks().forEach(t => t.enabled = camOn);
    $('#toggle-cam').classList.toggle('off', !camOn);
    $('#toggle-cam').textContent = camOn ? '📷' : '🚫';
  });

  boot();
})();
