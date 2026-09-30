const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

const APP_NAME = process.env.APP_NAME || 'دردشتي المباشرة';

async function sendVerificationEmail(toEmail, code, displayName) {
  const html = `
  <div dir="rtl" style="font-family: Tahoma, Arial, sans-serif; background:#f4f5fb; padding:24px;">
    <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 18px rgba(0,0,0,.08);">
      <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:24px;text-align:center;">
        <h1 style="color:#fff;margin:0;font-size:22px;">${APP_NAME}</h1>
      </div>
      <div style="padding:28px;text-align:center;">
        <p style="font-size:16px;color:#333;">مرحبًا <b>${displayName || ''}</b>،</p>
        <p style="font-size:15px;color:#555;">استخدم الرمز التالي لتأكيد بريدك الإلكتروني:</p>
        <div style="margin:24px 0;font-size:34px;letter-spacing:8px;font-weight:bold;color:#4f46e5;background:#f0f0ff;padding:14px 0;border-radius:12px;">
          ${code}
        </div>
        <p style="font-size:13px;color:#999;">هذا الرمز صالح لمدة 10 دقائق. إذا لم تطلب هذا الرمز، يمكنك تجاهل هذه الرسالة.</p>
      </div>
    </div>
  </div>`;

  await transporter.sendMail({
    from: `"${APP_NAME}" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: `رمز التأكيد: ${code} - ${APP_NAME}`,
    html,
    text: `رمز التأكيد الخاص بك هو: ${code} (صالح لمدة 10 دقائق)`,
  });
}

module.exports = { sendVerificationEmail };
