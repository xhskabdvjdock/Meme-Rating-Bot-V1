const fs = require("node:fs");
const path = require("node:path");

const DATA_DIR = path.join(__dirname, "..", "data");
const CONFIG_PATH = path.join(DATA_DIR, "config.json");

/**
 * شكل الإعدادات لكل سيرفر:
 * {
 *   [guildId]: {
 *     enabledChannelIds: string[],
 *     durationMinutes: number,
 *     emojis: { positive: string, negative: string }
 *   }
 * }
 */

const DEFAULT_GUILD_CONFIG = {
  enabledChannelIds: [],
  durationMinutes: 10,
  emojis: { positive: "✅", negative: "❌" },
};

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(CONFIG_PATH)) fs.writeFileSync(CONFIG_PATH, JSON.stringify({}, null, 2), "utf8");
}

function readAll() {
  ensureDataFile();
  const raw = fs.readFileSync(CONFIG_PATH, "utf8");
  try {
    return JSON.parse(raw || "{}");
  } catch {
    // إذا تلف الملف، نعيد تهيئته لتفادي توقف البوت.
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({}, null, 2), "utf8");
    return {};
  }
}

function writeAll(data) {
  ensureDataFile();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), "utf8");
}

function getGuildConfig(guildId) {
  const all = readAll();
  const existing = all[guildId];
  if (existing) return { ...DEFAULT_GUILD_CONFIG, ...existing, emojis: { ...DEFAULT_GUILD_CONFIG.emojis, ...(existing.emojis || {}) } };
  return { ...DEFAULT_GUILD_CONFIG, emojis: { ...DEFAULT_GUILD_CONFIG.emojis } };
}

function setGuildConfig(guildId, partial) {
  const all = readAll();
  const current = getGuildConfig(guildId);
  const next = {
    ...current,
    ...partial,
    emojis: { ...current.emojis, ...(partial.emojis || {}) },
  };
  all[guildId] = next;
  writeAll(all);
  return next;
}

module.exports = {
  DEFAULT_GUILD_CONFIG,
  getGuildConfig,
  setGuildConfig,
};

