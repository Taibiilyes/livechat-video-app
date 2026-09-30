// محاكاة إرسال SMS: لا توجد بوابة SMS حقيقية مهيأة (تتطلب اشتراكًا مدفوعًا مثل Twilio).
// في هذا الوضع، يتم "إرسال" الرمز عبر تسجيله هنا، ويظهر الرمز في واجهة التطبيق مع
// إشارة واضحة أنه وضع تجريبي، حتى يمكن تجربة تدفق التسجيل الكامل دون تكلفة خارجية.
function sendVerificationSms(phone, code) {
  console.log(`[SMS-SIMULATION] -> ${phone} : رمز التأكيد هو ${code}`);
  return { simulated: true };
}

module.exports = { sendVerificationSms };
