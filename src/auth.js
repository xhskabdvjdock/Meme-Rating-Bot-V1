const express = require("express");
const router = express.Router();

// Discord OAuth2 URLs
const DISCORD_API = "https://discord.com/api/v10";
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || "http://localhost:3000/auth/callback";

// Debug: log environment variables at startup
console.log("[Auth] CLIENT_ID:", CLIENT_ID ? `${CLIENT_ID.substring(0, 5)}...` : "NOT SET");
console.log("[Auth] CLIENT_SECRET:", CLIENT_SECRET ? `${CLIENT_SECRET.substring(0, 5)}...` : "NOT SET");
console.log("[Auth] REDIRECT_URI:", REDIRECT_URI);

// Bot invite URL
const BOT_INVITE_URL = `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&permissions=93248&integration_type=0&scope=bot+applications.commands`;

// تسجيل الدخول - توجيه المستخدم لـ Discord
router.get("/login", (req, res) => {
    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: "code",
        scope: "identify guilds"
    });
    res.redirect(`https://discord.com/oauth2/authorize?${params}`);
});

// Callback - استلام الكود من Discord
router.get("/callback", async (req, res) => {
    const { code } = req.query;

    if (!code) {
        return res.redirect("/?error=no_code");
    }

    try {
        // تبديل الكود بـ access_token
        const tokenResponse = await fetch(`${DISCORD_API}/oauth2/token`, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: new URLSearchParams({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                grant_type: "authorization_code",
                code,
                redirect_uri: REDIRECT_URI
            })
        });

        const tokenData = await tokenResponse.json();

        if (tokenData.error) {
            console.error("[Auth] Token error:", tokenData);
            return res.redirect("/?error=token_error");
        }

        // الحصول على معلومات المستخدم
        const userResponse = await fetch(`${DISCORD_API}/users/@me`, {
            headers: {
                Authorization: `Bearer ${tokenData.access_token}`
            }
        });

        const userData = await userResponse.json();

        // الحصول على سيرفرات المستخدم
        const guildsResponse = await fetch(`${DISCORD_API}/users/@me/guilds`, {
            headers: {
                Authorization: `Bearer ${tokenData.access_token}`
            }
        });

        const guildsData = await guildsResponse.json();

        // تخزين في الجلسة
        req.session.user = {
            id: userData.id,
            username: userData.username,
            discriminator: userData.discriminator,
            avatar: userData.avatar,
            globalName: userData.global_name
        };
        req.session.accessToken = tokenData.access_token;
        req.session.guilds = guildsData;

        console.log(`[Auth] User logged in: ${userData.username} (${userData.id})`);
        console.log(`[Auth] Guilds count: ${guildsData.length}`);

        // حفظ الجلسة قبل إعادة التوجيه
        req.session.save((err) => {
            if (err) {
                console.error("[Auth] Session save error:", err);
                return res.redirect("/?error=session_error");
            }
            console.log("[Auth] Session saved successfully, redirecting to dashboard");
            res.redirect("/dashboard");
        });

    } catch (error) {
        console.error("[Auth] Callback error:", error);
        res.redirect("/?error=callback_error");
    }
});

// تسجيل الخروج
router.get("/logout", (req, res) => {
    const username = req.session.user?.username;
    req.session.destroy();
    console.log(`[Auth] User logged out: ${username}`);
    res.redirect("/");
});

// الحصول على معلومات المستخدم الحالي
router.get("/api/user", (req, res) => {
    console.log("[Auth] /api/user called");
    console.log("[Auth] Session ID:", req.sessionID);
    console.log("[Auth] Session user:", req.session.user ? req.session.user.username : "none");
    console.log("[Auth] Cookies:", req.headers.cookie);

    if (!req.session.user) {
        return res.json({ loggedIn: false });
    }
    res.json({
        loggedIn: true,
        user: req.session.user
    });
});

// الحصول على سيرفرات المستخدم التي لديه صلاحية إدارتها
router.get("/api/user/guilds", (req, res) => {
    if (!req.session.user || !req.session.guilds) {
        return res.status(401).json({ error: "Not logged in" });
    }

    // فلترة السيرفرات - فقط التي لديه صلاحية MANAGE_GUILD (0x20 = 32)
    const MANAGE_GUILD = 0x20;
    const ADMINISTRATOR = 0x8;

    const managedGuilds = req.session.guilds.filter(guild => {
        const permissions = parseInt(guild.permissions);
        return (permissions & MANAGE_GUILD) === MANAGE_GUILD ||
            (permissions & ADMINISTRATOR) === ADMINISTRATOR ||
            guild.owner;
    }).map(guild => ({
        id: guild.id,
        name: guild.name,
        icon: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : null,
        owner: guild.owner
    }));

    res.json(managedGuilds);
});

// الحصول على رابط إضافة البوت
router.get("/api/bot-invite", (req, res) => {
    res.json({ url: BOT_INVITE_URL });
});

// الحصول على رابط إضافة البوت لسيرفر معين
router.get("/api/bot-invite/:guildId", (req, res) => {
    const guildInviteUrl = `${BOT_INVITE_URL}&guild_id=${req.params.guildId}&disable_guild_select=true`;
    res.json({ url: guildInviteUrl });
});

module.exports = router;
