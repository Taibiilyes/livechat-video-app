const fs = require('fs');
const path = require('path');

const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const file = path.join(dataDir, 'platform_config.json');

const DEFAULT_SETTINGS = {
  siteName: 'LiveChat',
  tagline: 'منصة البث المباشر والتفاعل والهدايا والمكالمات الفورية',
  version: '1.2.0',
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

let state = { settings: { ...DEFAULT_SETTINGS }, gifts: DEFAULT_GIFTS, announcements: [], audit: [] };
try {
  if (fs.existsSync(file)) {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    state = {
      settings: { ...DEFAULT_SETTINGS, ...(saved.settings || {}) },
      gifts: Array.isArray(saved.gifts) ? saved.gifts : DEFAULT_GIFTS,
      announcements: Array.isArray(saved.announcements) ? saved.announcements : [],
      audit: Array.isArray(saved.audit) ? saved.audit : []
    };
  }
} catch (e) {
  console.error('Failed to load platform settings:', e.message);
}

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

module.exports = {
  getSettings, updateSettings, getGifts, saveGift, deleteGift,
  getAnnouncements, addAnnouncement, updateAnnouncement, deleteAnnouncement,
  addAudit, getAudit
};
