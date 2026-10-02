const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const uploadDir = path.join(dataDir, 'user-videos');
const metadataFile = path.join(dataDir, 'user_videos.json');
fs.mkdirSync(uploadDir, { recursive: true });

let videos = [];
try {
  if (fs.existsSync(metadataFile)) videos = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
  if (!Array.isArray(videos)) videos = [];
} catch (error) {
  console.error('Failed to load user videos:', error.message);
  videos = [];
}

function save() {
  fs.writeFileSync(metadataFile, JSON.stringify(videos, null, 2), 'utf8');
}

function listByUser(userId) {
  return videos.filter(v => v.userId === Number(userId)).sort((a, b) => b.createdAt - a.createdAt).map(v => ({ ...v }));
}

function add({ userId, displayName, title, filename, mimeType, size }) {
  const video = {
    id: `video_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    userId: Number(userId),
    displayName: String(displayName || ''),
    title: String(title || 'مقطع جديد').trim().slice(0, 80),
    filename,
    url: `/user-media/${encodeURIComponent(filename)}`,
    mimeType,
    size,
    createdAt: Date.now()
  };
  videos.push(video);
  save();
  return { ...video };
}

function remove(id, requester) {
  const index = videos.findIndex(v => v.id === id);
  if (index < 0) return { status: 'missing' };
  const video = videos[index];
  const staff = ['owner', 'admin', 'moderator'].includes(requester.role);
  if (video.userId !== Number(requester.id) && !staff) return { status: 'forbidden' };
  videos.splice(index, 1);
  save();
  try { fs.unlinkSync(path.join(uploadDir, video.filename)); } catch (_) {}
  return { status: 'deleted', video };
}

module.exports = { uploadDir, listByUser, add, remove };
