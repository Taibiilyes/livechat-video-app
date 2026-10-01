(() => {
  const messages = {
    ar: {
      quickDemo:'دخول سريع فوري بحساب تجريبي', or:'أو استخدم حسابك الخاص', login:'تسجيل الدخول', register:'حساب جديد',
      identifier:'البريد الإلكتروني أو رقم الهاتف', password:'كلمة المرور', loginButton:'دخول للمنصة', name:'الاسم الظاهر', language:'لغة الحساب', method:'طريقة التسجيل', email:'البريد الإلكتروني', phone:'رقم الهاتف', create:'إنشاء الحساب',
      all:'🌟 الكل', music:'🎵 موسيقى', gaming:'🎮 ألعاب', chat:'💬 دردشة', goLive:'ابدأ البث الآن', explore:'استكشاف', leaderboard:'المتصدرون', live:'بث مباشر', messages:'الرسائل', profile:'حسابي',
      privateChats:'المحادثات الخاصة', privateHint:'اختر جهة اتصال لبدء الدردشة الفردية أو إجراء مكالمة فيديو خاصة.', streamTitle:'عنوان البث المباشر:', category:'فئة البث:', launch:'إطلاق البث المباشر الآن',
      followers:'المتابعون', coins:'العملات', diamonds:'الماس', buyCoins:'شراء العملات', buyHint:'اختر باقة، حوّل المبلغ، ثم أرسل مرجع الدفع ليؤكده مسؤول البيع', openStore:'فتح متجر العملات وطلب الشحن', adminPanel:'لوحة إدارة LumaLive', adminSub:'إدارة المستخدمين والمحتوى والمدفوعات والإعدادات', openAdmin:'فتح لوحة التحكم',
      emailPlaceholder:'example@email.com أو 05xxxxxxxx', passwordPlaceholder:'••••••••', namePlaceholder:'اسمك الكريم'
    },
    en: {
      quickDemo:'Instant demo login', or:'Or use your account', login:'Sign in', register:'Create account', identifier:'Email or phone number', password:'Password', loginButton:'Enter platform', name:'Display name', language:'Account language', method:'Registration method', email:'Email address', phone:'Phone number', create:'Create account',
      all:'🌟 All', music:'🎵 Music', gaming:'🎮 Gaming', chat:'💬 Chat', goLive:'Start streaming', explore:'Explore', leaderboard:'Leaderboard', live:'Go Live', messages:'Messages', profile:'Profile',
      privateChats:'Private messages', privateHint:'Select a contact to start a private chat or video call.', streamTitle:'Live stream title:', category:'Category:', launch:'Start live broadcast',
      followers:'Followers', coins:'Coins', diamonds:'Diamonds', buyCoins:'Buy coins', buyHint:'Choose a package, transfer the amount, then submit your payment reference for confirmation.', openStore:'Open coin store', adminPanel:'LumaLive Admin Center', adminSub:'Manage users, content, payments and platform settings', openAdmin:'Open Admin Center',
      emailPlaceholder:'Email or phone number', passwordPlaceholder:'Password', namePlaceholder:'Your display name'
    },
    fr: {
      quickDemo:'Connexion démo instantanée', or:'Ou utilisez votre compte', login:'Se connecter', register:'Créer un compte', identifier:'E-mail ou téléphone', password:'Mot de passe', loginButton:'Entrer sur la plateforme', name:"Nom d'affichage", language:'Langue du compte', method:"Méthode d'inscription", email:'Adresse e-mail', phone:'Téléphone', create:'Créer le compte',
      all:'🌟 Tous', music:'🎵 Musique', gaming:'🎮 Jeux', chat:'💬 Discussion', goLive:'Lancer un direct', explore:'Explorer', leaderboard:'Classement', live:'En direct', messages:'Messages', profile:'Profil',
      privateChats:'Messages privés', privateHint:'Choisissez un contact pour démarrer une discussion ou un appel vidéo.', streamTitle:'Titre du direct :', category:'Catégorie :', launch:'Démarrer la diffusion',
      followers:'Abonnés', coins:'Pièces', diamonds:'Diamants', buyCoins:'Acheter des pièces', buyHint:'Choisissez un pack, effectuez le transfert puis envoyez la référence du paiement.', openStore:'Ouvrir la boutique', adminPanel:"Centre d’administration LumaLive", adminSub:'Gérez les utilisateurs, le contenu, les paiements et les paramètres', openAdmin:"Ouvrir l’administration",
      emailPlaceholder:'E-mail ou numéro de téléphone', passwordPlaceholder:'Mot de passe', namePlaceholder:"Votre nom d'affichage"
    }
  };

  const textBindings = [
    ['#btn-quick-demo','quickDemo'], ['.divider span','or'], ['.tab-btn[data-tab="login"]','login'], ['.tab-btn[data-tab="register"]','register'],
    ['#login-form label:nth-of-type(1)','identifier'], ['#login-form label:nth-of-type(2)','password'], ['#login-form button[type="submit"]','loginButton'],
    ['#reg-name-label','name'], ['#reg-language-label','language'], ['#reg-method-label','method'], ['#register-form button[type="submit"]','create'],
    ['.cat-tab[data-cat="all"]','all'], ['.cat-tab[data-cat="music"]','music'], ['.cat-tab[data-cat="gaming"]','gaming'], ['.cat-tab[data-cat="chat"]','chat'],
    ['#btn-start-broadcast-banner','goLive'], ['.nav-item[data-target="view-explore"] span:last-child','explore'], ['.nav-item[data-target="view-leaderboard"] span:last-child','leaderboard'], ['.nav-item-center span:last-child','live'], ['.nav-item[data-target="view-messages"] span:last-child','messages'], ['.nav-item[data-target="view-profile"] span:last-child','profile'],
    ['#dm-empty-state h3','privateChats'], ['#dm-empty-state p','privateHint'], ['.studio-form>label:nth-of-type(1)','streamTitle'], ['.studio-form>label:nth-of-type(2)','category'], ['#btn-launch-stream','launch'],
    ['#prof-followers + .stat-lbl','followers'], ['#prof-diamonds + .stat-lbl','diamonds'], ['#prof-coins + .stat-lbl','coins'], ['.wallet-recharge-section h4','buyCoins'], ['.wallet-recharge-section p','buyHint'], ['#btn-open-coin-store','openStore'],
    ['#staff-admin-title','adminPanel'], ['#staff-admin-subtitle','adminSub'], ['#staff-admin-button-text','openAdmin']
  ];
  const placeholders = [['#login-identifier','emailPlaceholder'],['#login-password','passwordPlaceholder'],['#reg-name','namePlaceholder']];

  function t(key, lang) { return (messages[lang] || messages.ar)[key] || messages.ar[key] || key; }
  function apply(lang, persist=true) {
    if (!messages[lang]) lang='ar';
    document.documentElement.lang=lang;
    document.documentElement.dir=lang==='ar'?'rtl':'ltr';
    document.body?.setAttribute('data-language',lang);
    textBindings.forEach(([selector,key])=>{const el=document.querySelector(selector);if(el)el.textContent=t(key,lang);});
    placeholders.forEach(([selector,key])=>{const el=document.querySelector(selector);if(el)el.placeholder=t(key,lang);});
    ['auth-language-select','reg-language','app-language-select'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=lang;});
    if(persist)localStorage.setItem('app_language',lang);
    window.dispatchEvent(new CustomEvent('language:changed',{detail:{language:lang}}));
    return lang;
  }
  function current(){return localStorage.getItem('app_language')||'ar';}
  window.I18N={apply,t,current,messages};
  apply(current(),false);
  ['auth-language-select','reg-language','app-language-select'].forEach(id=>document.getElementById(id)?.addEventListener('change',e=>apply(e.target.value)));
})();
