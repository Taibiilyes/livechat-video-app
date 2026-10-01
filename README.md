# 💬 دردشتي المباشرة (LiveChat & Video App)

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20.x-green?logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/Socket.io-4.x-black?logo=socketdotio&logoColor=white" alt="Socket.io">
  <img src="https://img.shields.io/badge/WebRTC-Real--Time-red?logo=webrtc&logoColor=white" alt="WebRTC">
  <img src="https://img.shields.io/badge/Express-5.x-blue?logo=express&logoColor=white" alt="Express">
  <img src="https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white" alt="Docker">
  <img src="https://img.shields.io/badge/License-MIT-purple" alt="License">
</p>

> **منصة اتصالات متكاملة للدردشة النصية الفورية ومكالمات الفيديو المباشرة عالية الدقة (P2P WebRTC) مع نظام تحقق وتسجيل آمن.**

---

## 🌟 الميزات الرئيسية (Features)

- 💬 **دردشة نصية فورية فائقة السرعة:**
  - إرسال واستقبال فوري للرسائل عبر `Socket.io`.
  - مؤشر الكتابة المباشر (`...يكتب الآن`).
  - حالة المستخدمين المتصلين (`Online / Offline`) في الوقت الفعلي.
  - سجل محادثات دائم مع حفظ حالة قراءة الرسائل.
- 📹 **مكالمات فيديو وصوت مباشرة (WebRTC 1:1 Video Calls):**
  - اتصال صوت وفيديو مباشر نقطة لنقطة (P2P) بجودة عالية بدون وسيط طرف ثالث.
  - رنين التنبيه والإشعار بالمكالمات الواردة مع إمكانية القبول أو الرفض.
  - إمكانية كتم الميكروفون أو إيقاف الكاميرا أثناء المكالمة.
- 🔐 **نظام تسجيل ومصادقة متقدم:**
  - تسجيل عبر البريد الإلكتروني أو رقم الهاتف.
  - تأكيد الحساب برمز تحقق مؤقت (`OTP`).
  - تشفير كلمات المرور باستخدام `bcryptjs` وحماية الجلسات باستخدام `JWT`.
  - نظام محاكاة ذكي للرموز في بيئة التطوير لتسهيل التجربة دون تكاليف خارجية.
- 🎨 **واجهة مستخدم عصرية ومتجاوبة (Responsive Glassmorphic UI):**
  - تصميم نظيف ومريح متوافق مع كافة أحجام الشاشات (الهواتف، الأجهزة اللوحية، والحواسيب).
  - دعم كامل للغة العربية (RTL).
  - إشعارات منبثقة (Toasts) وصور رمزية بألوان ديناميكية.

---

## 📂 هيكل المشروع (Project Architecture)

```text
livechat-video-app/
├── server.js               # خادم Express و Socket.IO وإدارة إشارات WebRTC
├── db.js                   # قاعدة بيانات مجهزة بمحرك هجين عالي التوافقية
├── mailer.js               # نظام إرسال رسائل التحقق عبر البريد الإلكتروني
├── sms.js                  # وحدة إرسال ومحاكاة رسائل التحقق عبر الهاتف
├── test.js                 # حزمة الاختبارات الآلية الشاملة
├── Dockerfile              # حاوية Node.js خفيفة جاهزة للإنتاج
├── docker-compose.yml      # ملف التشغيل السريع للحاويات
├── render.yaml             # ملف النشر السحابي التلقائي على Render
├── package.json            # الاعتماديات وحزم Node.js
├── public/
│   ├── index.html          # هيكل واجهة المستخدم (شاشة الدخول، الدردشة، الفيديو)
│   ├── style.css           # التصميم وتنسيقات الألوان الحديثة
│   └── app.js              # المنطق البرمجي للعميل (WebRTC & Socket.IO Client)
└── data/                   # مجلد حفظ بيانات المستخدمين والرسائل
```

---

## 🚀 التشغيل السريع (Quick Start)

### 1. التشغيل المحلي (Local Machine)

تأكد من تثبيت **Node.js 18+**:

```bash
# استنساخ المستودع
git clone https://github.com/Taibiilyes/livechat-video-app.git
cd livechat-video-app

# تثبيت الحزم
npm install

# تشغيل الخادم
npm start
```

افتح المتصفح على: `http://localhost:3000`

---

### 2. التشغيل عبر Docker

```bash
# بناء وتشغيل الحاوية
docker compose up --build
```

---

## 🧪 تشغيل الاختبارات الآلية (Automated Tests)

```bash
node test.js
```

---

## 📡 واجهات الـ REST API

| Endpoint | Method | الوصف |
| :--- | :---: | :--- |
| `/api/health` | `GET` | فحص صحة الخادم وعدد المتصلين |
| `/api/register` | `POST` | تسجيل حساب جديد وإرسال رمز التحقق |
| `/api/verify` | `POST` | تأكيد الحساب برمز OTP وإصدار التوكن |
| `/api/resend` | `POST` | إعادة إرسال رمز تحقق جديد |
| `/api/login` | `POST` | تسجيل الدخول واستلام رمز الجلسة JWT |
| `/api/me` | `GET` | استرجاع بيانات الملف الشخصي للمستخدم الحالي |
| `/api/users` | `GET` | استعراض قائمة جهات الاتصال وحالة الاتصال |
| `/api/messages/:otherId` | `GET` | استرجاع سجل المحادثة مع مستخدم معين |

---

## 👤 المؤلف (Author)

- **إلياس طايبي (Ilyes Taibi)**
- GitHub: [@Taibiilyes](https://github.com/Taibiilyes)

## 📄 الترخيص (License)

هذا المشروع مرخص تحت رخصة **MIT**.
