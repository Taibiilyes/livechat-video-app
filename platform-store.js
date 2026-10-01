const fs = require('fs');
const path = require('path');

const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const file = path.join(dataDir, 'platform_config.json');

const DEFAULT_SETTINGS = {
  siteName: 'LiveChat',
  tagline: 'منصة البث المباشر والتفاعل والهدايا والمكالمات الفورية',
  version: '1.3.0',
  supportEmail: 'support@livechat.local',
  primaryColor: '#ff72ad',
  secondaryColor: '#9b8afb',
  maintenanceMode: false,
  registrationEnabled: true,
  demoLoginEnabled: true,
  commentsEnabled: true,
  giftsEnabled: true,
  callsEnabled: true,
  defaultCoins: 500,
  maxMessageLength: 500
};

const DEFAULT_COIN_PACKAGES = [
  { id: 'coins_500', name: 'باقة البداية', coins: 500, price: 500, currency: 'DZD', enabled: true },
  { id: 'coins_1500', name: 'باقة التوفير', coins: 1500, price: 1200, currency: 'DZD', enabled: true },
  { id: 'coins_5000', name: 'باقة VIP', coins: 5000, price: 3500, currency: 'DZD', enabled: true }
];
const DEFAULT_PAYMENT_METHODS = [
  { id: 'baridimob', name: 'بريدي موب', account: '00799999000000000000', enabled: true },
  { id: 'ccp', name: 'الحساب البريدي CCP', account: '00000000 مفتاح 00', enabled: true }
];

const DEFAULT_GIFTS = [
  { id: 'rose', name: 'وردة حمراء', icon: '🌹', coins: 1, enabled: true },
  { id: 'heart', name: 'قلب ناري', icon: '💖', coins: 5, enabled: true },
  { id: 'coffee', name: 'قهوة', icon: '☕', coins: 10, enabled: true },
  { id: 'perfume', name: 'عطر فاخر', icon: '✨', coins: 25, enabled: true },
  { id: 'rocket', name: 'صاروخ فضائي', icon: '🚀', coins: 50, enabled: true },
  { id: 'crown', name: 'التاج الملكي', icon: '👑', coins: 100, enabled: true },
  { id: 'car', name: 'سيارة رياضية', icon: '🏎️', coins: 500, enabled: true },
  { id: 'castle', name: 'قصر الأحلام', icon: '🏰', coins: 1000, enabled: true }
];

let state = { settings: { ...DEFAULT_SETTINGS }, gifts: DEFAULT_GIFTS, announcements: [], audit: [], coinPackages: DEFAULT_COIN_PACKAGES, paymentMethods: DEFAULT_PAYMENT_METHODS, paymentOrders: [] };
try {
  if (fs.existsSync(file)) {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    state = {
      settings: { ...DEFAULT_SETTINGS, ...(saved.settings || {}) },
      gifts: Array.isArray(saved.gifts) ? saved.gifts : DEFAULT_GIFTS,
      announcements: Array.isArray(saved.announcements) ? saved.announcements : [],
      audit: Array.isArray(saved.audit) ? saved.audit : [],
      coinPackages: Array.isArray(saved.coinPackages) ? saved.coinPackages : DEFAULT_COIN_PACKAGES,
      paymentMethods: Array.isArray(saved.paymentMethods) ? saved.paymentMethods : DEFAULT_PAYMENT_METHODS,
      paymentOrders: Array.isArray(saved.paymentOrders) ? saved.paymentOrders : []
    };
  }
} catch (e) {
  console.error('Failed to load platform settings:', e.message);
}
if (state.settings.version === '1.2.0') state.settings.version = '1.3.0';

function save() {
  fs.writeFileSync(file, JSON.stringify(state, null, 2), 'utf8');
}

function getSettings() { return { ...state.settings }; }
function updateSettings(patch) {
  const allowed = Object.keys(DEFAULT_SETTINGS);
  for (const [key, value] of Object.entries(patch || {})) {
    if (allowed.includes(key)) state.settings[key] = value;
  }
  save();
  return getSettings();
}
function getGifts(includeDisabled = true) {
  const list = includeDisabled ? state.gifts : state.gifts.filter(g => g.enabled !== false);
  return list.map(g => ({ ...g }));
}
function saveGift(gift) {
  const idx = state.gifts.findIndex(g => g.id === gift.id);
  if (idx >= 0) state.gifts[idx] = { ...state.gifts[idx], ...gift };
  else state.gifts.push({ ...gift });
  save();
  return { ...state.gifts.find(g => g.id === gift.id) };
}
function deleteGift(id) {
  const before = state.gifts.length;
  state.gifts = state.gifts.filter(g => g.id !== id);
  save();
  return state.gifts.length < before;
}
function getAnnouncements() { return state.announcements.slice().sort((a, b) => b.createdAt - a.createdAt); }
function addAnnouncement(item) {
  const announcement = { id: `ann_${Date.now()}`, title: item.title, body: item.body, type: item.type || 'info', active: item.active !== false, createdAt: Date.now() };
  state.announcements.push(announcement); save(); return announcement;
}
function updateAnnouncement(id, patch) {
  const item = state.announcements.find(a => a.id === id);
  if (!item) return null;
  Object.assign(item, patch); save(); return { ...item };
}
function deleteAnnouncement(id) {
  const before = state.announcements.length;
  state.announcements = state.announcements.filter(a => a.id !== id);
  save(); return before !== state.announcements.length;
}
function addAudit(admin, action, details = '') {
  state.audit.unshift({ id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, admin: admin || 'admin', action, details, createdAt: Date.now() });
  state.audit = state.audit.slice(0, 300);
  save();
}
function getAudit(limit = 100) { return state.audit.slice(0, limit); }

function getCoinPackages(includeDisabled = true) {
  return (includeDisabled ? state.coinPackages : state.coinPackages.filter(p => p.enabled !== false)).map(p => ({ ...p }));
}
function saveCoinPackage(item) {
  const idx = state.coinPackages.findIndex(p => p.id === item.id);
  if (idx >= 0) state.coinPackages[idx] = { ...state.coinPackages[idx], ...item };
  else state.coinPackages.push({ ...item });
  save(); return { ...state.coinPackages.find(p => p.id === item.id) };
}
function deleteCoinPackage(id) { const n=state.coinPackages.length; state.coinPackages=state.coinPackages.filter(p=>p.id!==id); save(); return n!==state.coinPackages.length; }
function getPaymentMethods(includeDisabled = true) { return (includeDisabled ? state.paymentMethods : state.paymentMethods.filter(m => m.enabled !== false)).map(m => ({ ...m })); }
function savePaymentMethod(item) { const i=state.paymentMethods.findIndex(m=>m.id===item.id); if(i>=0)state.paymentMethods[i]={...state.paymentMethods[i],...item};else state.paymentMethods.push({...item});save();return {...state.paymentMethods.find(m=>m.id===item.id)}; }
function deletePaymentMethod(id) { const n=state.paymentMethods.length; state.paymentMethods=state.paymentMethods.filter(m=>m.id!==id); save(); return n!==state.paymentMethods.length; }
function createPaymentOrder(data) {
  const order={ id:`pay_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, userId:data.userId, packageId:data.packageId, packageName:data.packageName, coins:data.coins, price:data.price, currency:data.currency, methodId:data.methodId, methodName:data.methodName, reference:data.reference||'', proofUrl:data.proofUrl||'', note:data.note||'', status:'pending', reviewedBy:null, reviewNote:'', createdAt:Date.now(), reviewedAt:null, creditedAt:null };
  state.paymentOrders.unshift(order); save(); return { ...order };
}
function getPaymentOrders(filter = {}) { return state.paymentOrders.filter(o => (!filter.userId || o.userId===filter.userId) && (!filter.status || o.status===filter.status)).map(o=>({...o})); }
function findPaymentOrder(id) { const o=state.paymentOrders.find(o=>o.id===id); return o||null; }
function updatePaymentOrder(id, patch) { const o=findPaymentOrder(id); if(!o)return null; Object.assign(o,patch);save();return {...o}; }

module.exports = {
  getSettings, updateSettings, getGifts, saveGift, deleteGift,
  getAnnouncements, addAnnouncement, updateAnnouncement, deleteAnnouncement,
  addAudit, getAudit, getCoinPackages, saveCoinPackage, deleteCoinPackage,
  getPaymentMethods, savePaymentMethod, deletePaymentMethod,
  createPaymentOrder, getPaymentOrders, findPaymentOrder, updatePaymentOrder
};
