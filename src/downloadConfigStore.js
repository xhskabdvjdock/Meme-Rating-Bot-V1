/**
 * Download Config Store
 * إدارة إعدادات ميزة التحميل لكل سيرفر
 */

const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, '..', 'config', 'downloadConfig.json');

// التأكد من وجود مجلد config
const configDir = path.dirname(CONFIG_FILE);
if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir, { recursive: true });
}

/**
 * الإعدادات الافتراضية
 */
const DEFAULT_CONFIG = {
  enabled: true,              // تفعيل الميزة
  channels: 'all',           // 'all' أو مصفوفة من IDs
  defaultQuality: 'best',    // الجودة الافتراضية
};

/**
 * قراءة جميع الإعدادات
 * @returns {object}
 */
function readAllConfigs() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      return {};
    }
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('[DownloadConfig] Failed to read config:', e);
    return {};
  }
}

/**
 * كتابة جميع الإعدادات
 * @param {object} data 
 */
function writeAllConfigs(data) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('[DownloadConfig] Failed to write config:', e);
  }
}

/**
 * الحصول على إعدادات سيرفر محدد
 * @param {string} guildId 
 * @returns {object}
 */
function getDownloadConfig(guildId) {
  const all = readAllConfigs();
  if (!all[guildId]) {
    return { ...DEFAULT_CONFIG };
  }
  return { ...DEFAULT_CONFIG, ...all[guildId] };
}

/**
 * تحديث إعدادات سيرفر
 * @param {string} guildId 
 * @param {object} updates 
 * @returns {object} - الإعدادات الجديدة
 */
function setDownloadConfig(guildId, updates) {
  const all = readAllConfigs();
  const current = all[guildId] || { ...DEFAULT_CONFIG };
  const updated = { ...current, ...updates };
  all[guildId] = updated;
  writeAllConfigs(all);
  console.log(`[DownloadConfig] Updated config for guild ${guildId}:`, updated);
  return updated;
}

/**
 * التحقق من تفعيل الميزة في سيرفر
 * @param {string} guildId 
 * @returns {boolean}
 */
function isDownloadEnabled(guildId) {
  const config = getDownloadConfig(guildId);
  return config.enabled === true;
}

/**
 * التحقق من السماح بالتحميل في قناة محددة
 * @param {string} guildId 
 * @param {string} channelId 
 * @returns {boolean}
 */
function isChannelAllowed(guildId, channelId) {
  const config = getDownloadConfig(guildId);
  
  // إذا الميزة معطلة
  if (!config.enabled) return false;
  
  // إذا مسموح في كل القنوات
  if (config.channels === 'all') return true;
  
  // إذا القنوات محددة
  if (Array.isArray(config.channels)) {
    return config.channels.includes(channelId);
  }
  
  return false;
}

module.exports = {
  getDownloadConfig,
  setDownloadConfig,
  isDownloadEnabled,
  isChannelAllowed,
  DEFAULT_CONFIG,
};
