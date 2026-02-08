const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const session = require("express-session");
const { getGuildConfig, setGuildConfig } = require("./configStore");
const { getLeaderboard, resetUserStats, resetGuildStats } = require("./statsStore");
const { getStreakLeaderboard, getStreak, getAllGuildStreaks } = require("./streakStore");
const { getDownloadConfig, setDownloadConfig } = require("./downloadConfigStore");
const authRoutes = require("./auth");
const downloadQueue = require("./downloadQueue");

const app = express();
const PORT = process.env.PORT || 3000;

// مسار مجلد الداشبورد
const dashboardPath = path.resolve(__dirname, "..", "dashboard");
console.log("[Dashboard] Static files path:", dashboardPath);

// التحقق من وجود الملفات
const indexPath = path.join(dashboardPath, "index.html");
if (fs.existsSync(indexPath)) {
    console.log("[Dashboard] ✅ index.html found");
} else {
    console.log("[Dashboard] ❌ index.html NOT found at:", indexPath);
}

// Trust proxy for Render (HTTPS behind load balancer)
app.set('trust proxy', 1);

// Session middleware
app.use(session({
    secret: process.env.SESSION_SECRET || "meme-rate-secret-key-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // مؤقتاً معطل للتجربة
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 أيام
    }
}));

app.use(cors({
    origin: true,
    credentials: true
}));
app.use(express.json());
app.use(express.static(dashboardPath));

// Auth routes
app.use("/auth", authRoutes);

// متغير لتخزين الـ Discord client
let discordClient = null;


// Health check endpoint
app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        dashboardPath,
        indexExists: fs.existsSync(indexPath),
        discordConnected: discordClient !== null
    });
});

// الحصول على معلومات السيرفرات
app.get("/api/guilds", (req, res) => {
    if (!discordClient) {
        return res.json([]); // إرجاع مصفوفة فارغة إذا لم يتصل البوت بعد
    }
    const guilds = discordClient.guilds.cache.map(g => ({
        id: g.id,
        name: g.name,
        icon: g.iconURL({ size: 128 }),
        memberCount: g.memberCount,
    }));
    res.json(guilds);
});

// الحصول على قنوات سيرفر
app.get("/api/guilds/:guildId/channels", async (req, res) => {
    if (!discordClient) {
        return res.status(503).json({ error: "Bot not connected" });
    }

    try {
        const guild = await discordClient.guilds.fetch(req.params.guildId).catch(() => null);
        if (!guild) return res.status(404).json({ error: "Guild not found" });

        // جلب جميع القنوات من Discord API
        const fetchedChannels = await guild.channels.fetch();

        const channels = fetchedChannels
            .filter(c => c && (c.type === 0 || c.type === 5)) // Text & Announcement
            .map(c => ({ id: c.id, name: c.name, type: c.type }));

        res.json(channels);
    } catch (err) {
        console.error("[Dashboard] Error fetching channels:", err);
        res.status(500).json({ error: "Failed to fetch channels" });
    }
});

// الحصول على إعدادات سيرفر
app.get("/api/guilds/:guildId/config", (req, res) => {
    const config = getGuildConfig(req.params.guildId);
    res.json(config);
});

// تحديث إعدادات سيرفر
app.patch("/api/guilds/:guildId/config", (req, res) => {
    const guildId = req.params.guildId;
    const updates = req.body;
    const newConfig = setGuildConfig(guildId, updates);
    res.json(newConfig);
});

// الحصول على قائمة أسوأ الناشرين
app.get("/api/guilds/:guildId/leaderboard", (req, res) => {
    const limit = parseInt(req.query.limit) || 10;
    const leaderboard = getLeaderboard(req.params.guildId, limit);
    res.json(leaderboard);
});

// إعادة تعيين إحصائيات مستخدم
app.delete("/api/guilds/:guildId/stats/:userId", (req, res) => {
    resetUserStats(req.params.guildId, req.params.userId);
    res.json({ success: true });
});

// إعادة تعيين إحصائيات السيرفر
app.delete("/api/guilds/:guildId/stats", (req, res) => {
    resetGuildStats(req.params.guildId);
    res.json({ success: true });
});

// =============== Streak API ===============

// الحصول على ليدربورد الستريك
app.get("/api/guilds/:guildId/streaks", (req, res) => {
    const limit = parseInt(req.query.limit) || 10;
    const leaderboard = getStreakLeaderboard(req.params.guildId, limit);
    res.json(leaderboard);
});

// الحصول على ستريك مستخدم معين
app.get("/api/guilds/:guildId/streaks/:userId", (req, res) => {
    const streak = getStreak(req.params.guildId, req.params.userId);
    res.json(streak);
});

// الحصول على جميع الستريكات
app.get("/api/guilds/:guildId/all-streaks", (req, res) => {
    const streaks = getAllGuildStreaks(req.params.guildId);
    res.json(streaks);
});

// =============== Download System API ===============

// الحصول على إعدادات التحميل لسيرفر
app.get("/api/guilds/:guildId/download-config", (req, res) => {
    const config = getDownloadConfig(req.params.guildId);
    res.json(config);
});

// تحديث إعدادات التحميل لسيرفر
app.patch("/api/guilds/:guildId/download-config", (req, res) => {
    const guildId = req.params.guildId;
    const updates = req.body;
    const newConfig = setDownloadConfig(guildId, updates);
    res.json(newConfig);
});

// الحصول على إحصائيات التحميل
app.get("/api/guilds/:guildId/download-stats", (req, res) => {
    // Mock stats - في الإصدار الحقيقي، هذه البيانات ستأتي من قاعدة البيانات
    const stats = {
        today: Math.floor(Math.random() * 50),
        week: Math.floor(Math.random() * 200),
        total: Math.floor(Math.random() * 1000),
        dataSaved: Math.random() * 50 // GB
    };
    res.json(stats);
});

// الحصول على حالة طابور التحميل
app.get("/api/guilds/:guildId/download-queue", (req, res) => {
    // Mock queue status - في الإصدار الحقيقي، هذه البيانات ستأتي من downloadQueue
    const queueStatus = downloadQueue.getStatus();
    res.json({
        active: queueStatus.active,
        pending: queueStatus.queued,
        total: queueStatus.total
    });
});

// Catch-all middleware - يجب أن يكون آخر middleware
// يستثني مسارات الـ API والملفات الثابتة
app.use((req, res, next) => {
    if (req.path.startsWith("/api/") || req.path.startsWith("/auth/")) {
        return next(); // اترك الـ API routes تمر
    }
    // إذا الملف موجود، اتركه يمر (للـ static files)
    const filePath = path.join(dashboardPath, req.path);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        return next();
    }
    // وإلا أرسل صفحة الهبوط
    res.sendFile(path.join(dashboardPath, "landing.html"));
});

// Route للصفحة الرئيسية - تعرض صفحة الهبوط
app.get("/", (req, res) => {
    res.sendFile(path.join(dashboardPath, "landing.html"));
});

// Route للوحة التحكم
app.get("/dashboard", (req, res) => {
    res.sendFile(path.join(dashboardPath, "index.html"));
});

// متغير لحفظ الـ server instance
let serverInstance = null;

function startDashboard(client) {
    discordClient = client;
    console.log("[Dashboard] Discord client connected");

    // بدء Express server فقط إذا لم يكن يعمل
    if (!serverInstance) {
        serverInstance = app.listen(PORT, '0.0.0.0', () => {
            console.log(`[Dashboard] ✅ Running at http://localhost:${PORT}`);
            console.log(`[Dashboard] Health check: http://localhost:${PORT}/health`);
        });
    }
}

module.exports = { startDashboard };
