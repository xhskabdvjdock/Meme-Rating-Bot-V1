const fs = require("fs");
const path = require("path");

const STREAK_FILE = path.join(__dirname, "..", "data", "streaks.json");

// تحميل البيانات
function loadStreaks() {
    try {
        if (fs.existsSync(STREAK_FILE)) {
            return JSON.parse(fs.readFileSync(STREAK_FILE, "utf8"));
        }
    } catch (err) {
        console.error("[Streak] Error loading streaks:", err);
    }
    return {};
}

// حفظ البيانات
function saveStreaks(data) {
    try {
        const dir = path.dirname(STREAK_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(STREAK_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error("[Streak] Error saving streaks:", err);
    }
}

// الحصول على ستريك المستخدم
function getStreak(guildId, userId) {
    const data = loadStreaks();
    const key = `${guildId}:${userId}`;
    return data[key] || {
        streak: 0,
        highestStreak: 0,
        lastUpdate: null
    };
}

// التحقق إذا تم التحديث اليوم
function isUpdatedToday(lastUpdate) {
    if (!lastUpdate) return false;

    const last = new Date(lastUpdate);
    const now = new Date();

    // مقارنة التاريخ فقط (بدون الوقت)
    return last.toDateString() === now.toDateString();
}

// التحقق إذا فات يوم (الستريك انكسر)
function isStreakBroken(lastUpdate) {
    if (!lastUpdate) return true;

    const last = new Date(lastUpdate);
    const now = new Date();

    // حساب الفرق بالأيام
    const diffTime = now.getTime() - last.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    // إذا فات أكثر من يوم = الستريك انكسر
    return diffDays > 1;
}

// تحديث الستريك
function updateStreak(guildId, userId) {
    const data = loadStreaks();
    const key = `${guildId}:${userId}`;
    const current = data[key] || { streak: 0, highestStreak: 0, lastUpdate: null };

    // التحقق إذا تم التحديث اليوم بالفعل
    if (isUpdatedToday(current.lastUpdate)) {
        return { updated: false, reason: "already_updated", ...current };
    }

    // التحقق إذا الستريك انكسر
    if (isStreakBroken(current.lastUpdate)) {
        // الستريك انكسر - إعادة من 1
        data[key] = {
            streak: 1,
            highestStreak: Math.max(current.highestStreak, 1),
            lastUpdate: new Date().toISOString()
        };
        saveStreaks(data);
        return { updated: true, reason: "streak_reset", wasStreak: current.streak, ...data[key] };
    }

    // الستريك مستمر - زيادة 1
    const newStreak = current.streak + 1;
    data[key] = {
        streak: newStreak,
        highestStreak: Math.max(current.highestStreak, newStreak),
        lastUpdate: new Date().toISOString()
    };
    saveStreaks(data);
    return { updated: true, reason: "streak_continued", ...data[key] };
}

// إعادة ضبط الستريك
function resetStreak(guildId, userId) {
    const data = loadStreaks();
    const key = `${guildId}:${userId}`;
    const current = data[key] || { streak: 0, highestStreak: 0, lastUpdate: null };

    data[key] = {
        streak: 0,
        highestStreak: current.highestStreak,
        lastUpdate: null
    };
    saveStreaks(data);
}

// الحصول على ليدربورد الستريك
function getStreakLeaderboard(guildId, limit = 10) {
    const data = loadStreaks();
    const guildStreaks = [];

    for (const [key, value] of Object.entries(data)) {
        if (key.startsWith(`${guildId}:`)) {
            const userId = key.split(":")[1];
            guildStreaks.push({
                userId,
                ...value
            });
        }
    }

    // ترتيب حسب الستريك الأعلى
    return guildStreaks
        .sort((a, b) => b.streak - a.streak)
        .slice(0, limit);
}

// الحصول على جميع ستريكات السيرفر
function getAllGuildStreaks(guildId) {
    const data = loadStreaks();
    const guildStreaks = [];

    for (const [key, value] of Object.entries(data)) {
        if (key.startsWith(`${guildId}:`)) {
            const userId = key.split(":")[1];
            guildStreaks.push({
                userId,
                ...value
            });
        }
    }

    return guildStreaks;
}

// فحص الستريكات المنتهية (يُستدعى كل 24 ساعة)
function checkExpiredStreaks() {
    const data = loadStreaks();
    let expiredCount = 0;

    for (const [key, value] of Object.entries(data)) {
        if (value.streak > 0 && isStreakBroken(value.lastUpdate)) {
            data[key] = {
                streak: 0,
                highestStreak: value.highestStreak,
                lastUpdate: value.lastUpdate
            };
            expiredCount++;
        }
    }

    if (expiredCount > 0) {
        saveStreaks(data);
        console.log(`[Streak] Reset ${expiredCount} expired streaks`);
    }

    return expiredCount;
}

module.exports = {
    getStreak,
    updateStreak,
    resetStreak,
    isUpdatedToday,
    isStreakBroken,
    getStreakLeaderboard,
    getAllGuildStreaks,
    checkExpiredStreaks
};
