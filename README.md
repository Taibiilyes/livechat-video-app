# دردشتي المباشرة

تطبيق دردشة نصية ومكالمات فيديو مباشرة (WebRTC) مع تسجيل عبر البريد الإلكتروني أو رقم الهاتف وتأكيد بالرمز.

## التشغيل محليًا
```
npm install
cp .env.example .env   # ثم عدّل القيم داخل .env
node server.js
```

## النشر على Render.com (مجاني)
1. أنشئ حساب على https://render.com (يمكن الدخول مباشرة بحساب GitHub).
2. اضغط New > Web Service واختر هذا المستودع.
3. الإعدادات:
   - Build Command: `npm install`
   - Start Command: `node server.js`
4. أضف متغيرات البيئة (Environment) من ملف `.env.example`:
   - `JWT_SECRET`
   - `GMAIL_USER`
   - `GMAIL_APP_PASSWORD`
   - `APP_NAME`
5. اضغط Deploy، وستحصل على رابط دائم من نوع `https://your-app.onrender.com`.
