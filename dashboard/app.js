// State
let currentGuildId = null;
let currentSystem = 'memerate';
let guilds = [];
let userGuilds = [];
let channels = [];
let config = {};
let currentUser = null;
let botGuilds = [];

// Guild-specific data storage to prevent mixing
const guildData = new Map(); // guildId -> { channels, config, etc. }

// API Base
const API = window.location.origin;

// DOM Elements
const serversPage = document.getElementById('servers-page');
const memeratePage = document.getElementById('memerate-page');
const gifPage = document.getElementById('gif-page');
const streakPage = document.getElementById('streak-page');
const downloadPage = document.getElementById('download-page');
const pageTitle = document.getElementById('page-title');
const serversList = document.getElementById('servers-list');
const subNav = document.getElementById('sub-nav');
const userSection = document.getElementById('user-section');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    await checkAuth();
});

// =============== Authentication ===============
async function checkAuth() {
    try {
        const res = await fetch(`${API}/api/user`, { credentials: 'include' });
        const data = await res.json();

        if (data.loggedIn) {
            currentUser = data.user;
            renderUserSection(true);
            await loadUserGuilds();
        } else {
            currentUser = null;
            renderUserSection(false);
            renderLoginRequired();
        }
    } catch (err) {
        console.error('Error checking auth:', err);
        renderUserSection(false);
        renderLoginRequired();
    }
}

function renderUserSection(loggedIn) {
    if (loggedIn && currentUser) {
        const avatarUrl = currentUser.avatar
            ? `https://cdn.discordapp.com/avatars/${currentUser.id}/${currentUser.avatar}.png`
            : null;

        userSection.innerHTML = `
            <div class="user-info">
                ${avatarUrl
                ? `<img src="${avatarUrl}" class="user-avatar" alt="">`
                : `<div class="user-avatar-placeholder">${currentUser.username.charAt(0).toUpperCase()}</div>`
            }
                <div class="user-details">
                    <div class="user-name">${currentUser.globalName || currentUser.username}</div>
                    <div class="user-tag">@${currentUser.username}</div>
                </div>
            </div>
            <a href="/auth/logout" class="logout-btn">تسجيل الخروج</a>
        `;
    } else {
        userSection.innerHTML = `
            <a href="/auth/login" class="login-btn">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                </svg>
                تسجيل الدخول بـ Discord
            </a>
        `;
    }
}

function renderLoginRequired() {
    serversList.innerHTML = `
        <div class="login-required">
            <h2>🔐 تسجيل الدخول مطلوب</h2>
            <p>سجل دخولك بحساب Discord لعرض السيرفرات التي يمكنك إدارتها</p>
            <a href="/auth/login" class="login-btn">
                <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                </svg>
                تسجيل الدخول بـ Discord
            </a>
        </div>
    `;
}

async function loadUserGuilds() {
    try {
        // جلب سيرفرات المستخدم والبوت معاً
        const [userRes, botRes] = await Promise.all([
            fetch(`${API}/api/user/guilds`, { credentials: 'include' }),
            fetch(`${API}/api/guilds`)
        ]);

        userGuilds = await userRes.json();
        botGuilds = await botRes.json();

        renderUserServers();
    } catch (err) {
        console.error('Error loading user guilds:', err);
        serversList.innerHTML = '<div class="loading">خطأ في تحميل السيرفرات</div>';
    }
}

function renderUserServers() {
    if (userGuilds.length === 0) {
        serversList.innerHTML = '<div class="loading">لا توجد سيرفرات يمكنك إدارتها</div>';
        return;
    }

    // تحديد السيرفرات التي فيها البوت
    const botGuildIds = botGuilds.map(g => g.id);

    serversList.innerHTML = userGuilds.map(g => {
        const hasBot = botGuildIds.includes(g.id);
        const botInfo = hasBot ? botGuilds.find(bg => bg.id === g.id) : null;

        return `
        <div class="server-card ${hasBot ? '' : 'no-bot'}">
            <div class="server-icon">
                ${g.icon ? `<img src="${g.icon}" alt="${g.name}">` : g.name.charAt(0)}
            </div>
            <div class="server-info">
                <h3>${g.name}</h3>
                ${hasBot
                ? `<span>${botInfo?.memberCount || ''} عضو</span>
                       <div class="bot-status active">✓ البوت مضاف</div>
                       <button class="manage-btn" onclick="openServer('${g.id}')">
                           ⚙️ إدارة البوت
                       </button>`
                : `<div class="bot-status inactive">البوت غير مضاف</div>
                       <button class="add-bot-btn" onclick="addBot('${g.id}')">
                           ➕ إضافة البوت
                       </button>`
            }
            </div>
        </div>
        `;
    }).join('');
}

async function addBot(guildId) {
    try {
        const res = await fetch(`${API}/api/bot-invite/${guildId}`);
        const data = await res.json();
        window.open(data.url, '_blank', 'width=500,height=800');
    } catch (err) {
        console.error('Error getting bot invite:', err);
        // Fallback to general invite
        window.open(`https://discord.com/oauth2/authorize?client_id=${window.CLIENT_ID || ''}&permissions=93248&scope=bot+applications.commands&guild_id=${guildId}`, '_blank');
    }
}

// =============== Theme Toggle ===============
function initTheme() {
    const savedTheme = localStorage.getItem('dashboard-theme');
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
        updateThemeIcon(savedTheme);
    }
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const newTheme = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('dashboard-theme', newTheme);
    updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
    const icon = document.getElementById('theme-icon');
    if (icon) {
        icon.textContent = theme === 'dark' ? '☀️' : '🌙';
    }
}

// Legacy function - kept for compatibility
async function loadServers() {
    await loadUserGuilds();
}

function renderServers() {
    renderUserServers();
}


async function openServer(guildId) {
    console.log("[Dashboard] Opening server:", guildId);
    
    // Check if we're already on this server
    if (currentGuildId === guildId) {
        console.log("[Dashboard] Already on this server, skipping");
        return;
    }
    
    // Clear previous state
    clearCurrentState();
    
    currentGuildId = guildId;

    // البحث في botGuilds أو userGuilds
    let guild = botGuilds.find(g => g.id === guildId);
    if (!guild) {
        guild = userGuilds.find(g => g.id === guildId);
    }

    if (!guild) {
        console.error("[Dashboard] Guild not found:", guildId);
        alert('حدث خطأ: السيرفر غير موجود');
        return;
    }

    pageTitle.textContent = guild.name;

    // Show sub navigation
    subNav.style.display = 'block';

    // Hide servers page, show system pages
    serversPage.classList.remove('active');

    // Show loading state
    showLoadingState();

    // Load data for this specific server
    try {
        await Promise.all([
            loadChannelsForGuild(guildId),
            loadConfigForGuild(guildId)
        ]);

        hideLoadingState();
        
        // Show default system (meme rate)
        showSystem('memerate');
    } catch (error) {
        console.error('[Dashboard] Error loading server data:', error);
        hideLoadingState();
        showToast('خطأ في تحميل بيانات السيرفر', 'error');
    }
}

function clearCurrentState() {
    // Reset all server-specific data
    channels = [];
    config = {};
    currentSystem = 'memerate';
    
    // Clear any pending operations
    // This prevents data from previous server from affecting new one
    console.log('[Dashboard] Cleared previous server state');
}

function showLoadingState() {
    // Show loading indicator
    const loadingHtml = `
        <div class="loading-state">
            <div class="loading-spinner"></div>
            <p>جاري تحميل بيانات السيرفر...</p>
        </div>
    `;
    
    // Hide all system pages and show loading
    memeratePage.classList.remove('active');
    gifPage.classList.remove('active');
    streakPage.classList.remove('active');
    downloadPage.classList.remove('active');
    
    // Temporarily show loading in the main content area
    const mainContent = document.querySelector('.main-content') || document.body;
    if (!document.getElementById('temp-loading')) {
        const loadingDiv = document.createElement('div');
        loadingDiv.id = 'temp-loading';
        loadingDiv.innerHTML = loadingHtml;
        loadingDiv.className = 'loading-overlay';
        mainContent.appendChild(loadingDiv);
    }
}

function hideLoadingState() {
    // Remove loading indicator
    const loadingDiv = document.getElementById('temp-loading');
    if (loadingDiv) {
        loadingDiv.remove();
    }
}

function showServers() {
    pageTitle.textContent = 'السيرفرات';
    subNav.style.display = 'none';

    // Clear current server state when going back to server list
    clearCurrentState();
    currentGuildId = null;

    // Hide all pages
    serversPage.classList.add('active');
    memeratePage.classList.remove('active');
    gifPage.classList.remove('active');
    streakPage.classList.remove('active');
    downloadPage.classList.remove('active');

    // Reset nav items
    document.querySelectorAll('.sub-nav .nav-item').forEach(el => el.classList.remove('active'));
}

function showSystem(system) {
    currentSystem = system;

    // Hide all system pages
    serversPage.classList.remove('active');
    memeratePage.classList.remove('active');
    gifPage.classList.remove('active');
    streakPage.classList.remove('active');
    downloadPage.classList.remove('active');

    // Show selected system
    if (system === 'memerate') {
        memeratePage.classList.add('active');
        loadLeaderboard();
    } else if (system === 'gif') {
        gifPage.classList.add('active');
    } else if (system === 'streak') {
        streakPage.classList.add('active');
        loadStreakChannels();
        loadStreakLeaderboard();
    } else if (system === 'download') {
        downloadPage.classList.add('active');
        loadDownloadConfig();
        loadDownloadStats();
        refreshQueueStatus();
    }

    // Update nav
    document.querySelectorAll('.sub-nav .nav-item').forEach(el => {
        el.classList.toggle('active', el.dataset.system === system);
    });
}

function showPage(page) {
    if (page === 'servers') {
        showServers();
    }
}

// =============== Config ===============

async function loadConfigForGuild(guildId) {
    try {
        console.log(`[Dashboard] Loading config for guild: ${guildId}`);
        const res = await fetch(`${API}/api/guilds/${guildId}/config`);
        
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        
        const fetchedConfig = await res.json();

        // Only update if we're still on the same guild
        if (currentGuildId !== guildId) {
            console.log(`[Dashboard] Guild changed during config load, ignoring response`);
            return;
        }

        config = fetchedConfig;
        console.log(`[Dashboard] Config loaded for guild ${guildId}:`, config);

        // Update UI with new config
        updateConfigUI();
        
    } catch (err) {
        console.error(`[Dashboard] Error loading config for guild ${guildId}:`, err);
        if (currentGuildId === guildId) {
            showToast('خطأ في تحميل الإعدادات', 'error');
        }
    }
}

function updateConfigUI() {
    // Meme Rate settings
    document.getElementById('mode-select').value = config.mode || 'timed';
    document.getElementById('duration-input').value = config.durationMinutes || 10;
    document.getElementById('interval-input').value = config.checkIntervalSeconds || 30;
    document.getElementById('positive-emoji').value = config.emojis?.positive || '✅';
    document.getElementById('negative-emoji').value = config.emojis?.negative || '❌';

    // GIF settings
    document.getElementById('gif-auto-select').value = config.gifAutoEnabled !== false ? 'true' : 'false';
    document.getElementById('gif-quality-select').value = config.gifQuality || 'medium';
    document.getElementById('gif-duration-input').value = config.gifDuration || 5;

    updateIntervalVisibility();
    renderEnabledChannels();
    renderChannelSelects();
    renderGifChannels();
    renderGifChannelSelect();
}

async function loadChannelsForGuild(guildId) {
    try {
        console.log(`[Dashboard] Loading channels for guild: ${guildId}`);
        const res = await fetch(`${API}/api/guilds/${guildId}/channels`);
        
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        
        const fetchedChannels = await res.json();

        // Only update if we're still on the same guild
        if (currentGuildId === guildId) {
            channels = fetchedChannels;
            console.log(`[Dashboard] Channels loaded for guild ${guildId}:`, channels.length);
        } else {
            console.log(`[Dashboard] Guild changed during channels load, ignoring response`);
        }
    } catch (err) {
        console.error(`[Dashboard] Error loading channels for guild ${guildId}:`, err);
        if (currentGuildId === guildId) {
            channels = [];
            showToast('خطأ في تحميل القنوات', 'error');
        }
    }
}

// Legacy functions - kept for compatibility but now use guild-specific versions
async function loadConfig() {
    if (currentGuildId) {
        await loadConfigForGuild(currentGuildId);
    }
}

async function loadChannels() {
    if (currentGuildId) {
        await loadChannelsForGuild(currentGuildId);
    }
}

function updateIntervalVisibility() {
    const mode = document.getElementById('mode-select').value;
    document.getElementById('interval-group').style.display = mode === 'continuous' ? 'block' : 'none';
}

// Add event listener if element exists
if (document.getElementById('mode-select')) {
    document.getElementById('mode-select').addEventListener('change', updateIntervalVisibility);
}

// Toast notification system
function showToast(message, type = 'success') {
    // Remove existing toasts
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
        if (toast.parentNode) {
            toast.remove();
        }
    }, 3000);
}

// =============== Helper Functions ===============

function renderEnabledChannels() {
    const list = document.getElementById('channels-list');
    const enabledIds = config.enabledChannelIds || [];

    if (enabledIds.length === 0) {
        list.innerHTML = '<div class="empty-state">لا توجد قنوات مراقبة</div>';
        return;
    }

    list.innerHTML = enabledIds.map(id => {
        const channel = channels.find(c => c.id === id);
        return `
      <div class="channel-item">
        <span># ${channel?.name || id}</span>
        <button onclick="removeChannel('${id}')">×</button>
      </div>
    `;
    }).join('');
}

function renderChannelSelects() {
    const addSelect = document.getElementById('add-channel-select');
    const logSelect = document.getElementById('log-channel-select');
    const enabledIds = config.enabledChannelIds || [];

    const availableChannels = channels.filter(c => !enabledIds.includes(c.id));

    addSelect.innerHTML = '<option value="">اختر قناة...</option>' +
        availableChannels.map(c => `<option value="${c.id}"># ${c.name}</option>`).join('');

    logSelect.innerHTML = '<option value="">بدون سجل</option>' +
        channels.map(c => `<option value="${c.id}" ${config.logChannelId === c.id ? 'selected' : ''}># ${c.name}</option>`).join('');
}

async function saveConfig() {
    if (!currentGuildId) {
        showToast('لم يتم تحديد سيرفر', 'error');
        return;
    }

    try {
        const updates = {
            mode: document.getElementById('mode-select').value,
            durationMinutes: parseInt(document.getElementById('duration-input').value),
            checkIntervalSeconds: parseInt(document.getElementById('interval-input').value),
            emojis: {
                positive: document.getElementById('positive-emoji').value,
                negative: document.getElementById('negative-emoji').value
            }
        };

        console.log(`[Dashboard] Saving config for guild ${currentGuildId}:`, updates);

        const res = await fetch(`${API}/api/guilds/${currentGuildId}/config`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        const newConfig = await res.json();
        
        // Update local config with saved data
        config = { ...config, ...newConfig };
        
        console.log(`[Dashboard] Config saved successfully for guild ${currentGuildId}`);
        showToast('تم حفظ الإعدادات', 'success');
        
        // Update UI to reflect saved changes
        updateConfigUI();
        
    } catch (err) {
        console.error('[Dashboard] Error saving config:', err);
        showToast('خطأ في حفظ الإعدادات: ' + err.message, 'error');
    }
}

async function addChannel() {
    if (!currentGuildId) {
        showToast('لم يتم تحديد سيرفر', 'error');
        return;
    }

    const select = document.getElementById('add-channel-select');
    const channelId = select.value;
    if (!channelId) return;

    try {
        const newList = [...(config.enabledChannelIds || []), channelId];
        
        const res = await fetch(`${API}/api/guilds/${currentGuildId}/config`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabledChannelIds: newList })
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        const updatedConfig = await res.json();
        config = { ...config, ...updatedConfig };
        
        renderEnabledChannels();
        renderChannelSelects();
        showToast('تمت إضافة القناة', 'success');
    } catch (err) {
        console.error('[Dashboard] Error adding channel:', err);
        showToast('خطأ في إضافة القناة', 'error');
    }
}

async function removeChannel(channelId) {
    if (!currentGuildId) {
        showToast('لم يتم تحديد سيرفر', 'error');
        return;
    }

    try {
        const newList = (config.enabledChannelIds || []).filter(id => id !== channelId);
        
        const res = await fetch(`${API}/api/guilds/${currentGuildId}/config`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabledChannelIds: newList })
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        const updatedConfig = await res.json();
        config = { ...config, ...updatedConfig };
        
        renderEnabledChannels();
        renderChannelSelects();
        showToast('تمت إزالة القناة', 'success');
    } catch (err) {
        console.error('[Dashboard] Error removing channel:', err);
        showToast('خطأ في إزالة القناة', 'error');
    }
}

async function saveLogChannel() {
    try {
        const channelId = document.getElementById('log-channel-select').value;
        await fetch(`${API}/api/guilds/${currentGuildId}/config`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ logChannelId: channelId || null })
        });

        showToast('تم حفظ قناة السجل', 'success');
    } catch (err) {
        console.error('Error saving log channel:', err);
        showToast('خطأ في حفظ قناة السجل', 'error');
    }
}

// =============== Leaderboard ===============

async function loadLeaderboard() {
    try {
        const res = await fetch(`${API}/api/guilds/${currentGuildId}/leaderboard?limit=10`);
        const leaderboard = await res.json();

        const container = document.getElementById('leaderboard');

        if (leaderboard.length === 0) {
            container.innerHTML = '<div class="empty-state">لا توجد إحصائيات</div>';
            return;
        }

        container.innerHTML = leaderboard.map((entry, i) => {
            let rankClass = '';
            if (i === 0) rankClass = 'gold';
            else if (i === 1) rankClass = 'silver';
            else if (i === 2) rankClass = 'bronze';

            return `
          <div class="leaderboard-item">
            <div class="leaderboard-rank ${rankClass}">${i + 1}</div>
            <div class="leaderboard-info">
              <div class="name">User ${entry.userId.slice(-4)}</div>
              <div class="count">${entry.deletedCount} ميم محذوف</div>
            </div>
          </div>
        `;
        }).join('');
    } catch (err) {
        console.error('Error loading leaderboard:', err);
    }
}

async function resetAllStats() {
    if (!confirm('هل أنت متأكد من إعادة تعيين جميع الإحصائيات؟')) return;

    try {
        await fetch(`${API}/api/guilds/${currentGuildId}/stats`, { method: 'DELETE' });
        showToast('تم إعادة تعيين الإحصائيات', 'success');
        await loadLeaderboard();
    } catch (err) {
        console.error('Error resetting stats:', err);
        showToast('خطأ في إعادة تعيين الإحصائيات', 'error');
    }
}

// =============== GIF System ===============

function renderGifChannels() {
    const list = document.getElementById('gif-channels-list');
    const gifIds = config.gifChannelIds || [];

    if (gifIds.length === 0) {
        list.innerHTML = '<div class="empty-state">لا توجد قنوات GIF</div>';
        return;
    }

    list.innerHTML = gifIds.map(id => {
        const channel = channels.find(c => c.id === id);
        return `
      <div class="channel-item">
        <span># ${channel?.name || id}</span>
        <button onclick="removeGifChannel('${id}')">×</button>
      </div>
    `;
    }).join('');
}

function renderGifChannelSelect() {
    const select = document.getElementById('add-gif-channel-select');
    const gifIds = config.gifChannelIds || [];
    const availableChannels = channels.filter(c => !gifIds.includes(c.id));

    select.innerHTML = '<option value="">اختر قناة...</option>' +
        availableChannels.map(c => `<option value="${c.id}"># ${c.name}</option>`).join('');
}

async function saveGifConfig() {
    try {
        const updates = {
            gifAutoEnabled: document.getElementById('gif-auto-select').value === 'true',
            gifQuality: document.getElementById('gif-quality-select').value,
            gifDuration: parseInt(document.getElementById('gif-duration-input').value)
        };

        await fetch(`${API}/api/guilds/${currentGuildId}/config`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });

        showToast('تم حفظ إعدادات GIF', 'success');
        await loadConfig();
    } catch (err) {
        console.error('Error saving GIF config:', err);
        showToast('خطأ في حفظ إعدادات GIF', 'error');
    }
}

async function addGifChannel() {
    const select = document.getElementById('add-gif-channel-select');
    const channelId = select.value;
    if (!channelId) return;

    try {
        const newList = [...(config.gifChannelIds || []), channelId];
        await fetch(`${API}/api/guilds/${currentGuildId}/config`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gifChannelIds: newList })
        });

        showToast('تمت إضافة قناة GIF', 'success');
        await loadConfig();
    } catch (err) {
        console.error('Error adding GIF channel:', err);
        showToast('خطأ في إضافة القناة', 'error');
    }
}

async function removeGifChannel(channelId) {
    try {
        const newList = (config.gifChannelIds || []).filter(id => id !== channelId);
        await fetch(`${API}/api/guilds/${currentGuildId}/config`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gifChannelIds: newList })
        });

        showToast('تمت إزالة قناة GIF', 'success');
        await loadConfig();
    } catch (err) {
        console.error('Error removing GIF channel:', err);
        showToast('خطأ في إزالة القناة', 'error');
    }
}

// =============== Download System ===============

async function loadDownloadConfig() {
    if (!currentGuildId) return;

    try {
        const res = await fetch(`${API}/api/guilds/${currentGuildId}/download-config`);
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        
        const downloadConfig = await res.json();

        // Update UI with download config
        document.getElementById('download-enabled-select').value = downloadConfig.enabled ? 'true' : 'false';
        document.getElementById('download-quality-select').value = downloadConfig.defaultQuality || 'best';
        document.getElementById('max-file-size-input').value = downloadConfig.maxFileSize || 100;
        document.getElementById('auto-compress-select').value = downloadConfig.autoCompress !== false ? 'true' : 'false';

        renderDownloadChannels();
    } catch (err) {
        console.error('[Dashboard] Error loading download config:', err);
        showToast('خطأ في تحميل إعدادات التحميل', 'error');
    }
}

async function saveDownloadConfig() {
    if (!currentGuildId) {
        showToast('لم يتم تحديد سيرفر', 'error');
        return;
    }

    try {
        const updates = {
            enabled: document.getElementById('download-enabled-select').value === 'true',
            defaultQuality: document.getElementById('download-quality-select').value,
            maxFileSize: parseInt(document.getElementById('max-file-size-input').value),
            autoCompress: document.getElementById('auto-compress-select').value === 'true'
        };

        console.log(`[Dashboard] Saving download config for guild ${currentGuildId}:`, updates);

        const res = await fetch(`${API}/api/guilds/${currentGuildId}/download-config`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        showToast('تم حفظ إعدادات التحميل', 'success');
    } catch (err) {
        console.error('[Dashboard] Error saving download config:', err);
        showToast('خطأ في حفظ إعدادات التحميل: ' + err.message, 'error');
    }
}

function renderDownloadChannels() {
    const list = document.getElementById('download-channels-list');
    const enabledIds = config.downloadChannelIds || [];

    if (enabledIds.length === 0) {
        list.innerHTML = '<div class="empty-state">لا توجد قنوات مفعلة</div>';
        return;
    }

    list.innerHTML = enabledIds.map(id => {
        const channel = channels.find(c => c.id === id);
        return `
        <div class="channel-item">
            <span># ${channel?.name || id}</span>
            <button onclick="removeDownloadChannel('${id}')">×</button>
        </div>
    `;
    }).join('');
}

function renderDownloadChannelSelect() {
    const select = document.getElementById('add-download-channel-select');
    const enabledIds = config.downloadChannelIds || [];
    const availableChannels = channels.filter(c => !enabledIds.includes(c.id));

    select.innerHTML = '<option value="">اختر قناة...</option>' +
        availableChannels.map(c => `<option value="${c.id}"># ${c.name}</option>`).join('');
}

async function addDownloadChannel() {
    if (!currentGuildId) {
        showToast('لم يتم تحديد سيرفر', 'error');
        return;
    }

    const select = document.getElementById('add-download-channel-select');
    const channelId = select.value;
    if (!channelId) return;

    try {
        const newList = [...(config.downloadChannelIds || []), channelId];
        
        const res = await fetch(`${API}/api/guilds/${currentGuildId}/download-config`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ downloadChannelIds: newList })
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        const updatedConfig = await res.json();
        config = { ...config, ...updatedConfig };
        
        renderDownloadChannels();
        renderDownloadChannelSelect();
        showToast('تمت إضافة قناة التحميل', 'success');
    } catch (err) {
        console.error('[Dashboard] Error adding download channel:', err);
        showToast('خطأ في إضافة القناة', 'error');
    }
}

async function removeDownloadChannel(channelId) {
    if (!currentGuildId) {
        showToast('لم يتم تحديد سيرفر', 'error');
        return;
    }

    try {
        const newList = (config.downloadChannelIds || []).filter(id => id !== channelId);
        
        const res = await fetch(`${API}/api/guilds/${currentGuildId}/download-config`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ downloadChannelIds: newList })
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        const updatedConfig = await res.json();
        config = { ...config, ...updatedConfig };
        
        renderDownloadChannels();
        renderDownloadChannelSelect();
        showToast('تمت إزالة قناة التحميل', 'success');
    } catch (err) {
        console.error('[Dashboard] Error removing download channel:', err);
        showToast('خطأ في إزالة القناة', 'error');
    }
}

async function loadDownloadStats() {
    if (!currentGuildId) return;

    try {
        const res = await fetch(`${API}/api/guilds/${currentGuildId}/download-stats`);
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        
        const stats = await res.json();

        // Update stats display
        document.getElementById('downloads-today').textContent = stats.today || 0;
        document.getElementById('downloads-week').textContent = stats.week || 0;
        document.getElementById('downloads-total').textContent = stats.total || 0;
        document.getElementById('data-saved').textContent = (stats.dataSaved || 0).toFixed(1) + ' GB';
    } catch (err) {
        console.error('[Dashboard] Error loading download stats:', err);
        // Set default values on error
        document.getElementById('downloads-today').textContent = '0';
        document.getElementById('downloads-week').textContent = '0';
        document.getElementById('downloads-total').textContent = '0';
        document.getElementById('data-saved').textContent = '0 GB';
    }
}

async function refreshQueueStatus() {
    if (!currentGuildId) return;

    try {
        const res = await fetch(`${API}/api/guilds/${currentGuildId}/download-queue`);
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        
        const queueStatus = await res.json();

        // Update queue status display
        document.getElementById('active-downloads').textContent = queueStatus.active || 0;
        document.getElementById('pending-downloads').textContent = queueStatus.pending || 0;
        document.getElementById('total-downloads').textContent = queueStatus.total || 0;
    } catch (err) {
        console.error('[Dashboard] Error refreshing queue status:', err);
        // Set default values on error
        document.getElementById('active-downloads').textContent = '0';
        document.getElementById('pending-downloads').textContent = '0';
        document.getElementById('total-downloads').textContent = '0';
    }
}

// Auto-refresh queue status every 30 seconds
setInterval(() => {
    if (currentSystem === 'download' && currentGuildId) {
        refreshQueueStatus();
    }
}, 30000);

async function loadStreakChannels() {
    if (!config.streakChannelIds) {
        config.streakChannelIds = [];
    }

    // Populate channel select
    const select = document.getElementById('add-streak-channel-select');
    select.innerHTML = '<option value="">اختر قناة...</option>';

    channels.forEach(ch => {
        if (!config.streakChannelIds.includes(ch.id)) {
            select.innerHTML += `<option value="${ch.id}">#${ch.name}</option>`;
        }
    });

    renderStreakChannels();
}

function renderStreakChannels() {
    const container = document.getElementById('streak-channels-list');
    if (!config.streakChannelIds || config.streakChannelIds.length === 0) {
        container.innerHTML = '<p class="empty-state">لا توجد قنوات ستريك. أضف قناة لتفعيل النظام.</p>';
        return;
    }

    container.innerHTML = config.streakChannelIds.map(id => {
        const ch = channels.find(c => c.id === id);
        return `
            <div class="channel-item">
                <span>#${ch?.name || id}</span>
                <button class="btn danger small" onclick="removeStreakChannel('${id}')">إزالة</button>
            </div>
        `;
    }).join('');
}

async function addStreakChannel() {
    const select = document.getElementById('add-streak-channel-select');
    const channelId = select.value;
    if (!channelId) return;

    const ids = [...(config.streakChannelIds || []), channelId];

    try {
        const res = await fetch(`${API}/api/guilds/${currentGuildId}/config`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ streakChannelIds: ids })
        });
        config = await res.json();
        loadStreakChannels();
        showToast('تمت إضافة قناة الستريك ✅', 'success');
    } catch (err) {
        showToast('خطأ في إضافة القناة', 'error');
    }
}

async function removeStreakChannel(channelId) {
    const ids = (config.streakChannelIds || []).filter(id => id !== channelId);

    try {
        const res = await fetch(`${API}/api/guilds/${currentGuildId}/config`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ streakChannelIds: ids })
        });
        config = await res.json();
        loadStreakChannels();
        showToast('تمت إزالة القناة ❌', 'success');
    } catch (err) {
        showToast('خطأ في إزالة القناة', 'error');
    }
}

async function loadStreakLeaderboard() {
    const container = document.getElementById('streak-leaderboard');
    container.innerHTML = '<div class="loading">جاري التحميل...</div>';

    try {
        const res = await fetch(`${API}/api/guilds/${currentGuildId}/streaks?limit=10`);
        const streaks = await res.json();

        if (!streaks || streaks.length === 0) {
            container.innerHTML = '<p class="empty-state">لا توجد بيانات ستريك بعد.</p>';
            return;
        }

        container.innerHTML = streaks.map((s, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
            const badge = s.streak >= 30 ? '🏆' : s.streak >= 7 ? '⭐' : '';
            return `
                <div class="leaderboard-item">
                    <span class="rank">${medal}</span>
                    <span class="user-id">${s.userId}</span>
                    <span class="streak-count">🔥 ${s.streak} ${badge}</span>
                </div>
            `;
        }).join('');
    } catch (err) {
        container.innerHTML = '<p class="empty-state">خطأ في تحميل البيانات</p>';
    }
}
