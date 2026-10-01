/* LiveChat comprehensive administration center */
(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const KEY = 'admin_token';
  let token = localStorage.getItem(KEY) || '';
  let usersCache = [], streamsCache = [], giftsCache = [];

  async function api(path, opts = {}) {
    const res = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers || {}) } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'حدث خطأ غير متوقع');
    return data;
  }
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const fmt = n => Number(n || 0).toLocaleString('ar-EG');
  const when = ts => ts ? new Date(Number(ts)).toLocaleString('ar-EG', { dateStyle:'short', timeStyle:'short' }) : '—';
  let toastTimer;
  function toast(msg, kind='good') { const t=$('#toast'); t.textContent=msg; t.className=`toast ${kind}`; t.hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.hidden=true,3000); }

  $('#login-form').addEventListener('submit', async e => {
    e.preventDefault(); const btn=$('#login-btn'), err=$('#login-error'); err.hidden=true; btn.disabled=true; btn.textContent='جارٍ التحقق…';
    try { const d=await api('/api/admin/login',{method:'POST',body:JSON.stringify({email:$('#email').value,password:$('#password').value})}); token=d.token; localStorage.setItem(KEY,token); $('#password').value=''; await showDashboard(d.admin); }
    catch(ex){ err.textContent=ex.message; err.hidden=false; } finally { btn.disabled=false; btn.textContent='دخول آمن'; }
  });
  $('#logout-btn').addEventListener('click', async()=>{ try{await api('/api/admin/logout',{method:'POST'});}catch(_){} token='';localStorage.removeItem(KEY);$('#dash-view').hidden=true;$('#login-view').hidden=false; });
  $('#refresh-btn').addEventListener('click', loadAll);

  function goTab(name) {
    $$('.tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===name));
    $$('.panel-view').forEach(p=>p.hidden=p.id!==`tab-${name}`);
    if(name==='audit') loadAudit();
  }
  $$('.tab').forEach(t=>t.addEventListener('click',()=>goTab(t.dataset.tab)));
  $$('.quick').forEach(q=>q.addEventListener('click',()=>goTab(q.dataset.go)));

  function renderStats(s) {
    const items=[['👥','إجمالي المستخدمين',s.totalUsers],['✅','الحسابات الموثقة',s.verifiedUsers],['🚫','الحسابات المحظورة',s.bannedUsers],['🟢','متصل الآن',s.onlineUsers],['🔴','بث مباشر',s.activeStreams],['👁️','المشاهدون',s.totalViewers],['💬','الرسائل',s.totalMessages],['🪙','العملات المتداولة',s.totalCoins],['💎','الألماس',s.totalDiamonds]];
    $('#stats').innerHTML=items.map(([i,k,v])=>`<div class="stat"><span>${i}</span><div><div class="v">${fmt(v)}</div><div class="k">${k}</div></div></div>`).join('');
  }

  function renderUsers(users) {
    $('#users-count').textContent=`${users.length} مستخدم`;
    $('#users-body').innerHTML=users.length?users.map(u=>`<tr data-id="${u.id}"><td>${u.id}</td><td><div class="u"><div class="av" style="background:${esc(u.avatarColor)}">${esc((u.displayName||'?')[0])}</div><div><b>${esc(u.displayName)}</b><div class="sub2">${when(u.createdAt)}</div></div></div></td><td>${esc(u.email||'—')}<div class="sub2">${esc(u.phone||'')}</div></td><td>${u.isAdmin?'<span class="badge b-adm">مسؤول</span>':''}${u.banned?'<span class="badge b-bad">محظور</span>':u.verified?'<span class="badge b-ok">موثّق</span>':'<span class="badge b-warn">غير موثّق</span>'}${u.online?'<span class="badge b-on">متصل</span>':''}</td><td>${fmt(u.coins)}</td><td>${fmt(u.diamonds)}</td><td>${fmt(u.level)}</td><td class="actions"><button class="btn" data-act="edit">تعديل شامل</button><button class="btn warn" data-act="ban" ${u.isAdmin?'disabled':''}>${u.banned?'رفع الحظر':'حظر'}</button><button class="btn bad" data-act="delete" ${u.isAdmin?'disabled':''}>حذف</button></td></tr>`).join(''):'<tr><td colspan="8"><div class="empty">لا توجد نتائج</div></td></tr>';
  }

  function userForm(u={}) { return `<div class="form-row"><label>الاسم<input name="displayName" value="${esc(u.displayName||'')}" required></label><label>البريد<input name="email" type="email" value="${esc(u.email||'')}"></label></div><div class="form-row"><label>الهاتف<input name="phone" value="${esc(u.phone||'')}"></label><label>كلمة المرور ${u.id?'<small>(اتركها فارغة دون تغيير)</small>':''}<input name="password" type="password" ${u.id?'':'required minlength="6"'}></label></div><div class="form-row thirds"><label>العملات<input name="coins" type="number" min="0" value="${u.coins??500}"></label><label>الألماس<input name="diamonds" type="number" min="0" value="${u.diamonds??0}"></label><label>المستوى<input name="level" type="number" min="1" value="${u.level??1}"></label></div><div class="form-row"><label>لون الصورة<input name="avatarColor" type="color" value="${esc(u.avatarColor||'#8b5cf6')}"></label><div class="switches inline"><label><input name="verified" type="checkbox" ${u.verified!==false?'checked':''}> موثّق</label><label><input name="isAdmin" type="checkbox" ${u.isAdmin?'checked':''}> مسؤول</label></div></div><button class="primary" type="submit">حفظ المستخدم</button>`; }

  function openModal(title, html, onSubmit) { $('#modal-title').textContent=title; $('#modal-form').innerHTML=html; $('#modal').hidden=false; $('#modal-form').onsubmit=async e=>{e.preventDefault();const btn=e.submitter;btn.disabled=true;try{await onSubmit(new FormData(e.currentTarget));closeModal();}catch(ex){toast(ex.message,'bad');btn.disabled=false;}}; }
  function closeModal(){ $('#modal').hidden=true; $('#modal-form').innerHTML=''; }
  $('#modal-close').addEventListener('click',closeModal); $('#modal').addEventListener('click',e=>{if(e.target===$('#modal'))closeModal();});

  $('#add-user-btn').addEventListener('click',()=>openModal('إضافة مستخدم جديد',userForm(),async fd=>{const o=Object.fromEntries(fd);o.verified=fd.has('verified');o.isAdmin=fd.has('isAdmin');await api('/api/admin/users',{method:'POST',body:JSON.stringify(o)});toast('تم إنشاء المستخدم');await Promise.all([loadUsers(),loadStats()]);}));
  $('#users-body').addEventListener('click',async e=>{const b=e.target.closest('[data-act]');if(!b)return;const u=usersCache.find(x=>x.id===Number(b.closest('tr').dataset.id));if(!u)return;
    if(b.dataset.act==='edit') openModal(`تعديل ${u.displayName}`,userForm(u),async fd=>{const o=Object.fromEntries(fd);o.verified=fd.has('verified');o.isAdmin=fd.has('isAdmin');await api(`/api/admin/users/${u.id}`,{method:'PATCH',body:JSON.stringify(o)});toast('تم حفظ التعديلات');await Promise.all([loadUsers(),loadStats()]);});
    if(b.dataset.act==='ban'){await api(`/api/admin/users/${u.id}`,{method:'PATCH',body:JSON.stringify({banned:!u.banned})});toast(u.banned?'تم رفع الحظر':'تم حظر المستخدم');await loadUsers();}
    if(b.dataset.act==='delete'&&confirm(`حذف حساب ${u.displayName} نهائياً؟`)){await api(`/api/admin/users/${u.id}`,{method:'DELETE'});toast('تم حذف الحساب');await Promise.all([loadUsers(),loadStats()]);}
  });

  function renderStreams(list){streamsCache=list;$('#streams-list').innerHTML=list.length?list.map(s=>`<article class="scard"><span class="live-badge">مباشر</span><h3>${esc(s.title)}</h3><div class="meta">${esc(s.host?.displayName||'—')} · 👁️ ${fmt(s.viewersCount)} · ${esc(s.category)}</div><div class="actions"><button class="btn" data-stream-edit="${esc(s.id)}">تعديل</button><button class="btn bad" data-stream-delete="${esc(s.id)}">إنهاء البث</button></div></article>`).join(''):'<div class="empty">لا توجد بثوث مباشرة</div>';}
  const streamForm=s=>`<label>عنوان البث<input name="title" value="${esc(s?.title||'')}" required></label><div class="form-row"><label>اسم المضيف<input name="hostName" value="${esc(s?.host?.displayName||'إدارة LiveChat')}"></label><label>الفئة<select name="category"><option value="chat">دردشة</option><option value="music">موسيقى</option><option value="gaming">ألعاب</option></select></label></div><label>رابط الفيديو<input name="videoUrl" value="${esc(s?.videoUrl||'/videos/chat-live.mp4')}"></label><label>عدد المشاهدين<input name="viewersCount" type="number" min="0" value="${s?.viewersCount||1}"></label><button class="primary" type="submit">حفظ البث</button>`;
  $('#add-stream-btn').addEventListener('click',()=>openModal('إنشاء بث مميز',streamForm(),async fd=>{await api('/api/admin/streams',{method:'POST',body:JSON.stringify(Object.fromEntries(fd))});toast('تم إنشاء البث');await Promise.all([loadStreams(),loadStats()]);}));
  $('#streams-list').addEventListener('click',async e=>{const edit=e.target.closest('[data-stream-edit]'),del=e.target.closest('[data-stream-delete]');if(edit){const s=streamsCache.find(x=>x.id===edit.dataset.streamEdit);openModal('تعديل البث',streamForm(s),async fd=>{await api(`/api/admin/streams/${encodeURIComponent(s.id)}`,{method:'PATCH',body:JSON.stringify(Object.fromEntries(fd))});toast('تم تعديل البث');loadStreams();});}if(del&&confirm('إنهاء هذا البث؟')){await api(`/api/admin/streams/${encodeURIComponent(del.dataset.streamDelete)}`,{method:'DELETE'});toast('تم إنهاء البث');await Promise.all([loadStreams(),loadStats()]);}});

  function renderAnnouncements(list){$('#announcements-list').innerHTML=list.length?list.map(a=>`<div class="list-item"><div><b>${esc(a.title)}</b><p>${esc(a.body)}</p><small>${when(a.createdAt)}</small></div><div class="actions"><button class="btn ${a.active?'ok':'warn'}" data-ann-toggle="${a.id}" data-active="${a.active}">${a.active?'نشط':'مخفي'}</button><button class="btn bad" data-ann-delete="${a.id}">حذف</button></div></div>`).join(''):'<div class="empty">لا توجد إعلانات</div>';}
  $('#announcement-form').addEventListener('submit',async e=>{e.preventDefault();await api('/api/admin/announcements',{method:'POST',body:JSON.stringify({title:$('#ann-title').value,body:$('#ann-body').value,type:$('#ann-type').value})});e.target.reset();toast('تم نشر الإعلان');loadAnnouncements();});
  $('#announcements-list').addEventListener('click',async e=>{const t=e.target.closest('[data-ann-toggle]'),d=e.target.closest('[data-ann-delete]');if(t){await api(`/api/admin/announcements/${t.dataset.annToggle}`,{method:'PATCH',body:JSON.stringify({active:t.dataset.active!=='true'})});loadAnnouncements();}if(d&&confirm('حذف الإعلان؟')){await api(`/api/admin/announcements/${d.dataset.annDelete}`,{method:'DELETE'});loadAnnouncements();}});

  function renderGifts(list){giftsCache=list;$('#gifts-list').innerHTML=list.map(g=>`<article class="gift-admin-card ${g.enabled===false?'disabled':''}"><div class="gift-icon">${esc(g.icon)}</div><h3>${esc(g.name)}</h3><b>🪙 ${fmt(g.coins)}</b><span class="badge ${g.enabled!==false?'b-ok':'b-bad'}">${g.enabled!==false?'مفعلة':'مخفية'}</span><div class="actions"><button class="btn" data-gift-edit="${g.id}">تعديل</button><button class="btn bad" data-gift-delete="${g.id}">حذف</button></div></article>`).join('');}
  const giftForm=g=>`<div class="form-row"><label>الرمز التعبيري<input name="icon" value="${esc(g?.icon||'🎁')}" required></label><label>اسم الهدية<input name="name" value="${esc(g?.name||'')}" required></label></div><label>السعر بالعملات<input name="coins" type="number" min="1" value="${g?.coins||1}" required></label><div class="switches"><label><input name="enabled" type="checkbox" ${g?.enabled!==false?'checked':''}> إظهار الهدية للمستخدمين</label></div><button class="primary" type="submit">حفظ الهدية</button>`;
  function giftModal(g){openModal(g?'تعديل الهدية':'هدية جديدة',giftForm(g),async fd=>{const o=Object.fromEntries(fd);o.enabled=fd.has('enabled');await api(g?`/api/admin/gifts/${g.id}`:'/api/admin/gifts',{method:g?'PATCH':'POST',body:JSON.stringify(o)});toast('تم حفظ الهدية');loadGifts();});}
  $('#add-gift-btn').addEventListener('click',()=>giftModal()); $('#gifts-list').addEventListener('click',async e=>{const ed=e.target.closest('[data-gift-edit]'),del=e.target.closest('[data-gift-delete]');if(ed)giftModal(giftsCache.find(g=>g.id===ed.dataset.giftEdit));if(del&&confirm('حذف الهدية؟')){await api(`/api/admin/gifts/${del.dataset.giftDelete}`,{method:'DELETE'});toast('تم حذف الهدية');loadGifts();}});

  function renderMessages(msgs){const name=id=>usersCache.find(u=>u.id===id)?.displayName||`#${id}`;$('#messages-body').innerHTML=msgs.length?msgs.map(m=>`<tr><td>${m.id}</td><td>${esc(name(m.from))}</td><td>${esc(name(m.to))}</td><td class="message-cell">${esc(m.body)}</td><td class="sub2">${when(m.createdAt)}</td><td><button class="btn bad" data-message-delete="${m.id}">حذف</button></td></tr>`).join(''):'<tr><td colspan="6"><div class="empty">لا توجد رسائل</div></td></tr>';}
  $('#messages-body').addEventListener('click',async e=>{const b=e.target.closest('[data-message-delete]');if(b&&confirm('حذف هذه الرسالة؟')){await api(`/api/admin/messages/${b.dataset.messageDelete}`,{method:'DELETE'});toast('تم حذف الرسالة');loadMessages();}}); $('#reload-messages').addEventListener('click',loadMessages);

  function fillSettings(s){$('#set-name').value=s.siteName;$('#set-tagline').value=s.tagline;$('#set-version').value=s.version;$('#set-support').value=s.supportEmail;$('#set-primary').value=s.primaryColor;$('#set-secondary').value=s.secondaryColor;$('#set-registration').checked=s.registrationEnabled;$('#set-demo').checked=s.demoLoginEnabled;$('#set-comments').checked=s.commentsEnabled;$('#set-gifts').checked=s.giftsEnabled;$('#set-calls').checked=s.callsEnabled;$('#set-maintenance').checked=s.maintenanceMode;$('#set-default-coins').value=s.defaultCoins;$('#set-max-message').value=s.maxMessageLength;}
  $('#settings-form').addEventListener('submit',async e=>{e.preventDefault();const o={siteName:$('#set-name').value,tagline:$('#set-tagline').value,version:$('#set-version').value,supportEmail:$('#set-support').value,primaryColor:$('#set-primary').value,secondaryColor:$('#set-secondary').value,registrationEnabled:$('#set-registration').checked,demoLoginEnabled:$('#set-demo').checked,commentsEnabled:$('#set-comments').checked,giftsEnabled:$('#set-gifts').checked,callsEnabled:$('#set-calls').checked,maintenanceMode:$('#set-maintenance').checked,defaultCoins:$('#set-default-coins').value,maxMessageLength:$('#set-max-message').value};await api('/api/admin/settings',{method:'PATCH',body:JSON.stringify(o)});toast('تم حفظ إعدادات المنصة');loadAudit();});
  function renderAudit(logs){$('#audit-list').innerHTML=logs.length?logs.map(l=>`<div class="audit-item"><div class="audit-dot"></div><div><b>${esc(l.action)}</b><p>${esc(l.details||'')}</p><small>${esc(l.admin)} · ${when(l.createdAt)}</small></div></div>`).join(''):'<div class="empty">لا توجد تغييرات مسجلة</div>';}

  async function loadStats(){renderStats(await api('/api/admin/stats'));} async function loadUsers(){const q=$('#search').value.trim();const d=await api('/api/admin/users'+(q?`?q=${encodeURIComponent(q)}`:''));usersCache=d.users;renderUsers(d.users);} async function loadStreams(){renderStreams((await api('/api/admin/streams')).streams);} async function loadMessages(){renderMessages((await api('/api/admin/messages?limit=100')).messages);} async function loadGifts(){renderGifts((await api('/api/admin/gifts')).gifts);} async function loadAnnouncements(){renderAnnouncements((await api('/api/admin/announcements')).announcements);} async function loadSettings(){fillSettings((await api('/api/admin/settings')).settings);} async function loadAudit(){renderAudit((await api('/api/admin/audit?limit=150')).audit);}
  async function loadAll(){try{await Promise.all([loadStats(),loadUsers(),loadStreams(),loadMessages(),loadGifts(),loadAnnouncements(),loadSettings(),loadAudit()]);}catch(ex){toast(ex.message,'bad');}}
  let searchTimer;$('#search').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>loadUsers().catch(e=>toast(e.message,'bad')),250);});
  async function showDashboard(admin){$('#login-view').hidden=true;$('#dash-view').hidden=false;$('#admin-email').textContent=admin?.email||'';await loadAll();}
  setInterval(()=>{if(!$('#dash-view').hidden&&document.visibilityState==='visible')loadStats().catch(()=>{});},15000);
  (async()=>{if(!token)return;try{await showDashboard((await api('/api/admin/me')).admin);}catch(_){localStorage.removeItem(KEY);token='';}})();
})();
