const fs = require("node:fs");
const path = require("node:path");

const DATA_DIR = path.join(__dirname, "..", "data");
const STATS_PATH = path.join(DATA_DIR, "stats.json");

/**
 * شكل البيانات:
 * {
 *   [guildId]: {
 *     [userId]: {
 *       deletedCount: number,
 *       lastDeleted: number (timestamp)
 *     }
 *   }
 * }
 */

function ensureStatsFile() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(STATS_PATH)) fs.writeFileSync(STATS_PATH, JSON.stringify({}, null, 2), "utf8");
}

function readStats() {
    ensureStatsFile();
    const raw = fs.readFileSync(STATS_PATH, "utf8");
    try {
        return JSON.parse(raw || "{}");
    } catch {
        fs.writeFileSync(STATS_PATH, JSON.stringify({}, null, 2), "utf8");
        return {};
    }
}

function writeStats(data) {
    ensureStatsFile();
    fs.writeFileSync(STATS_PATH, JSON.stringify(data, null, 2), "utf8");
}

function incrementDeleteCount(guildId, userId) {
    const all = readStats();
    if (!all[guildId]) all[guildId] = {};
    if (!all[guildId][userId]) {
        all[guildId][userId] = { deletedCount: 0, lastDeleted: 0 };
    }
    all[guildId][userId].deletedCount += 1;
    all[guildId][userId].lastDeleted = Date.now();
    writeStats(all);
    return all[guildId][userId].deletedCount;
}

function getLeaderboard(guildId, limit = 10) {
    const all = readStats();
    const guildStats = all[guildId] || {};

    const sorted = Object.entries(guildStats)
        .map(([userId, data]) => ({ userId, ...data }))
        .sort((a, b) => b.deletedCount - a.deletedCount)
        .slice(0, limit);

    return sorted;
}

function getUserStats(guildId, userId) {
    const all = readStats();
    return all[guildId]?.[userId] || { deletedCount: 0, lastDeleted: 0 };
}

function resetUserStats(guildId, userId) {
    const all = readStats();
    if (all[guildId]?.[userId]) {
        delete all[guildId][userId];
        writeStats(all);
    }
}

function resetGuildStats(guildId) {
    const all = readStats();
    if (all[guildId]) {
        delete all[guildId];
        writeStats(all);
    }
}

module.exports = {
    incrementDeleteCount,
    getLeaderboard,
    getUserStats,
    resetUserStats,
    resetGuildStats,
};
