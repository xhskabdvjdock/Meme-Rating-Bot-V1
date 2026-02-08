require("dotenv").config({ path: ".env" });
const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  REST,
} = require("discord.js");

// Create REST client with increased timeout for large file uploads
const rest = new REST({ 
  version: '10',
  timeout: 300000 // 5 minutes timeout for large files
}).setToken(process.env.DISCORD_TOKEN);

const { getGuildConfig, setGuildConfig } = require("./configStore");
const { readPending, upsertPending, removePending } = require("./pendingStore");
const { getDownloadConfig, setDownloadConfig, isChannelAllowed } = require("./downloadConfigStore");
const downloadQueue = require("./downloadQueue");
const { startDashboard } = require("./dashboard");
const {
  detectVideoUrls,
  getVideoInfo,
  checkFileSize,
  downloadVideo,
  getDirectDownloadUrl,
  convertToMp3,
  compressVideo,
  autoCompressVideo,
  getFileSize,
  deleteFile,
  formatDuration,
  getPlatformName,
  MAX_FILE_SIZE,
} = require("./videoDownloader");
const {
  createJob,
  getJob,
  updateJob,
  deleteJob,
  checkRateLimit,
  getRemainingRequests,
  getRateLimitReset,
} = require("./downloadStore");

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("Missing DISCORD_TOKEN. Put it in ./env (see env.example).");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User],
  rest: {
    timeout: 300000, // 5 minutes timeout for large files
  },
});

// لتفادي جدولة نفس الرسالة أكثر من مرة أثناء التشغيل
const scheduled = new Map(); // messageId -> timeoutId

function parseEmojiKey(input) {
  // Unicode: "✅"
  // Custom: "<:name:id>" or "<a:name:id>"
  const m = input.match(/^<a?:([A-Za-z0-9_]+):(\d+)>$/);
  if (m) return `${m[1]}:${m[2]}`;
  return input;
}

function isMemeMessage(message) {
  if (!message.attachments || message.attachments.size === 0) return false;
  for (const [, att] of message.attachments) {
    const ct = (att.contentType || "").toLowerCase();
    if (ct.startsWith("image/") || ct.startsWith("video/")) return true;
    const name = (att.name || "").toLowerCase();
    if (/\.(png|jpe?g|gif|webp|mp4|mov|webm)$/i.test(name)) return true;
  }
  return false;
}

async function safeReact(message, emoji) {
  try {
    await message.react(emoji);
  } catch (e) {
    // قد يفشل مع إيموجي غير صالح أو صلاحيات ناقصة
    console.warn(`Failed to react with ${emoji} on message ${message.id}:`, e?.message || e);
  }
}

async function finalizeVote(record) {
  const { guildId, channelId, messageId } = record;
  removePending(messageId);

  // إذا انحذفت القناة/السيرفر أو فقدنا الصلاحيات، نتجاهل
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;

  const config = getGuildConfig(guildId);
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)) return;

  const msg = await channel.messages.fetch(messageId).catch(() => null);
  if (!msg) return; // الرسالة قد تكون محذوفة بالفعل

  const posKey = parseEmojiKey(config.emojis.positive);
  const negKey = parseEmojiKey(config.emojis.negative);

  // نجلب المستخدمين لكل رياكشن لكي لا نحسب البوت نفسه
  const posReaction = msg.reactions.cache.get(posKey) || null;
  const negReaction = msg.reactions.cache.get(negKey) || null;

  const countUsers = async (reaction) => {
    if (!reaction) return 0;
    const users = await reaction.users.fetch().catch(() => null);
    if (!users) return 0;
    return users.filter((u) => !u.bot).size;
  };

  const pos = await countUsers(posReaction);
  const neg = await countUsers(negReaction);

  if (neg > pos) {
    await msg.delete().catch(() => null);
  }
}

function scheduleFinalize(guildId, channelId, messageId, endsAtMs, createdAtMs) {
  const now = Date.now();
  const delay = Math.max(0, endsAtMs - now);

  if (scheduled.has(messageId)) return;

  const timeoutId = setTimeout(async () => {
    scheduled.delete(messageId);
    await finalizeVote({ guildId, channelId, messageId, endsAtMs, createdAtMs });
  }, delay);

  scheduled.set(messageId, timeoutId);
  upsertPending(messageId, { guildId, channelId, createdAtMs, endsAtMs });
}

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  // ضبط حالة البوت - dnd + playing
  client.user.setPresence({
    activities: [{ name: 'dev by : wlc8', type: 0 }],
    status: 'dnd'
  });

  // إعادة جدولة المؤقّتات بعد إعادة تشغيل البوت
  const pending = readPending();
  const now = Date.now();
  for (const [messageId, record] of Object.entries(pending)) {
    if (!record?.endsAtMs || !record?.guildId || !record?.channelId) {
      removePending(messageId);
      continue;
    }
    if (record.endsAtMs <= now) {
      // انتهى وقته أثناء انطفاء البوت
      finalizeVote({ ...record, messageId }).catch(() => null);
      continue;
    }
    scheduleFinalize(record.guildId, record.channelId, messageId, record.endsAtMs, record.createdAtMs || now);
  }

  // بدء Dashboard/Express server
  startDashboard(client);
  console.log("[Bot] Dashboard started and ready");
});

client.on("interactionCreate", async (interaction) => {
  // === معالجة الأزرار ===
  if (interaction.isButton()) {
    const customId = interaction.customId;

    // === معالجة أزرار اختيار الجودة ===
    if (customId.startsWith('quality_')) {
      const parts = customId.split('_');
      const quality = parts[1]; // 720, 480, best
      const format = parts[2]; // mp4 or mp3
      const ownerId = parts[3];
      const jobId = parts.slice(4).join('_');

      // الرد بأن التحميل قيد التحضير (يجب أن يكون أول شيء لتجنب timeout)
      await interaction.deferReply();

      // التحقق من الملكية
      if (interaction.user.id !== ownerId) {
        await interaction.editReply({
          content: '❌ هذا الزر مخصص لشخص آخر!',
        });
        return;
      }

      // جلب الـ job
      const job = getJob(jobId);
      if (!job) {
        await interaction.editReply({
          content: '❌ انتهت صلاحية هذا الطلب. أرسل الرابط مجدداً.',
        });
        return;
      }

      // التحقق من rate limit
      if (!checkRateLimit(interaction.user.id)) {
        const resetMs = getRateLimitReset(interaction.user.id);
        const resetMins = Math.ceil(resetMs / 60000);
        await interaction.editReply({
          content: `⚠️ تجاوزت الحد المسموح (5 تحميلات في الساعة)\n⏰ يمكنك المحاولة مجدداً بعد ${resetMins} دقيقة`,
        });
        return;
      }

      // إضافة للـ queue
      try {
        await downloadQueue.add(async () => {
          updateJob(jobId, { status: 'downloading' });
          const startTime = Date.now();
          const queueStatus = downloadQueue.getStatus();
          console.log(`[VideoDownload] Starting download: ${job.url} (${format}, ${quality}) - Queue: ${queueStatus.active}/${queueStatus.total}`);

          // تحميل الملف
          let filePath;
          try {
            filePath = await downloadVideo(job.url, format, quality);
          } catch (err) {
            throw new Error(`فشل في التحميل: ${err.message}`);
          }

          // التحقق من الحجم والضغط التلقائي إذا لزم الأمر
          let fileSize = getFileSize(filePath);
          console.log(`[VideoDownload] File size: ${(fileSize / 1024 / 1024).toFixed(2)}MB`);

          // إذا الملف كبير جداً (أكثر من 100MB)، نقوم بالضغط التلقائي
          if (fileSize > MAX_FILE_SIZE) {
            console.log(`[VideoDownload] File too large (${(fileSize / 1024 / 1024).toFixed(1)}MB), compressing...`);
            updateJob(jobId, { status: 'compressing' });
            
            try {
              filePath = await autoCompressVideo(filePath, 80); // Target 80MB
              fileSize = getFileSize(filePath);
              console.log(`[VideoDownload] Compressed to: ${(fileSize / 1024 / 1024).toFixed(2)}MB`);
            } catch (compressErr) {
              console.error('[VideoDownload] Compression failed:', compressErr.message);
              // Continue with original file if compression fails
            }
          }

          // إرسال رابط التحميل المباشر دائماً (أفضل من إرسال الملف)
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          const remaining = getRemainingRequests(interaction.user.id);

          try {
            const directInfo = await getDirectDownloadUrl(job.url, format, quality);
            
            await interaction.editReply({
              content: `✅ **تم التحميل بنجاح!**\n\n🎬 **الجودة:** ${quality}\n⏱️ **الوقت:** ${elapsed} ثانية\n📊 **الحجم:** ${(fileSize / 1024 / 1024).toFixed(1)}MB\n📥 **المتبقي لك:** ${remaining} تحميلات في الساعة\n\n🔗 **رابط التحميل المباشر:**\n\`\`\`${directInfo.url}\`\`\`\n\n💡 **طريقة التحميل:**\n1. انسخ الرابط أعلاه\n2. افتحه في المتصفح\n3. اضغط على الثلاث نقاط (⋮)\n4. اختر "حفظ الفيديو"`,
            });

            console.log(`[VideoDownload] Sent direct link to ${interaction.user.tag} (${elapsed}s)`);
          } catch (directErr) {
            console.error('[VideoDownload] Error getting direct link:', directErr.message);
            await interaction.editReply({
              content: `❌ فشل الحصول على رابط التحميل\n💡 جرب اختيار جودة أخرى أو أرسل الرابط مجدداً`,
            });
          }

          // تنظيف
          deleteFile(filePath);
          deleteJob(jobId);
        });
      } catch (err) {
        console.error(`[VideoDownload] Error:`, err);
        updateJob(jobId, { status: 'error', error: err.message });

        await interaction.editReply({
          content: `❌ حدث خطأ: ${err.message}\n💡 تأكد من صلاحية الرابط وجرب مجدداً`,
        });

        deleteJob(jobId);
      }

      return;
    }
  }

  // === معالجة الأوامر النصية ===
  if (!interaction.isChatInputCommand()) return;
  if (!interaction.inGuild()) return;

  // السماح فقط لمدير السيرفر (Manage Guild) — كطبقة حماية إضافية
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: "تحتاج صلاحية Manage Server لإدارة إعدادات البوت.", ephemeral: true });
    return;
  }

  const guildId = interaction.guildId;
  const sub = interaction.options.getSubcommand();

  // === معالجة أوامر /download ===
  if (interaction.commandName === "download") {
    const dlConfig = getDownloadConfig(guildId);

    if (sub === "status") {
      const channelsText = dlConfig.channels === 'all'
        ? 'جميع القنوات'
        : Array.isArray(dlConfig.channels) && dlConfig.channels.length > 0
          ? dlConfig.channels.map(id => `<#${id}>`).join(', ')
          : 'لا توجد قنوات محددة';

      await interaction.reply({
        flags: [64], // Ephemeral
        content:
          `**إعدادات ميزة التحميل**\n` +
          `- الحالة: ${dlConfig.enabled ? '✅ مفعّلة' : '❌ معطّلة'}\n` +
          `- القنوات: ${channelsText}\n` +
          `- الجودة الافتراضية: ${dlConfig.defaultQuality}`,
      });
      return;
    }

    if (sub === "toggle") {
      const enabled = interaction.options.getBoolean("enabled", true);
      setDownloadConfig(guildId, { enabled });
      await interaction.reply({
        flags: [64], // Ephemeral
        content: enabled ? '✅ تم تفعيل ميزة التحميل' : '❌ تم تعطيل ميزة التحميل',
      });
      return;
    }

    if (sub === "addchannel") {
      const channel = interaction.options.getChannel("channel", true);

      let channels = dlConfig.channels === 'all' ? [] : (Array.isArray(dlConfig.channels) ? dlConfig.channels : []);
      if (!channels.includes(channel.id)) {
        channels.push(channel.id);
      }

      setDownloadConfig(guildId, { channels });
      await interaction.reply({
        flags: [64], // Ephemeral
        content: `✅ تمت إضافة القناة ${channel} لقائمة التحميل`,
      });
      return;
    }

    if (sub === "removechannel") {
      const channel = interaction.options.getChannel("channel", true);

      let channels = Array.isArray(dlConfig.channels) ? dlConfig.channels : [];
      channels = channels.filter(id => id !== channel.id);

      setDownloadConfig(guildId, { channels });
      await interaction.reply({
        flags: [64], // Ephemeral
        content: `✅ تمت إزالة القناة ${channel} من قائمة التحميل`,
      });
      return;
    }

    if (sub === "setchannels") {
      const mode = interaction.options.getString("mode", true);
      setDownloadConfig(guildId, { channels: mode === 'all' ? 'all' : [] });
      await interaction.reply({
        flags: [64], // Ephemeral
        content: mode === 'all'
          ? '✅ تم تفعيل التحميل في جميع القنوات'
          : '✅ تم تحديد نمط القنوات المحددة (استخدم /download addchannel لإضافة قنوات)',
      });
      return;
    }

    return;
  }

  // === معالجة أوامر /memerate ===
  if (interaction.commandName === "memerate") {
    const config = getGuildConfig(guildId);

    if (sub === "status") {
      await interaction.reply({
        flags: [64], // Ephemeral
        content:
          `**Memerate config**\n` +
          `- Channels: ${config.enabledChannelIds.length ? config.enabledChannelIds.map((id) => `<#${id}>`).join(", ") : "none"}\n` +
          `- Duration: ${config.durationMinutes} minutes\n` +
          `- Emojis: ${config.emojis.positive} / ${config.emojis.negative}`,
      });
      return;
    }

    if (sub === "setduration") {
      const minutes = interaction.options.getInteger("minutes", true);
      const next = setGuildConfig(guildId, { durationMinutes: minutes });
      await interaction.reply({ 
        flags: [64], // Ephemeral
        content: `تم ضبط مدة التصويت إلى **${next.durationMinutes}** دقيقة.` 
      });
      return;
    }

    if (sub === "setemojis") {
      const positive = interaction.options.getString("positive", true).trim();
      const negative = interaction.options.getString("negative", true).trim();
      const next = setGuildConfig(guildId, { emojis: { positive, negative } });
      await interaction.reply({
        flags: [64], // Ephemeral
        content: `تم ضبط الإيموجيات إلى: ${next.emojis.positive} / ${next.emojis.negative}`,
      });
      return;
    }

    if (sub === "addchannel") {
      const channel = interaction.options.getChannel("channel", true);
      const ids = new Set(config.enabledChannelIds);
      ids.add(channel.id);
      const next = setGuildConfig(guildId, { enabledChannelIds: Array.from(ids) });
      await interaction.reply({
        flags: [64], // Ephemeral
        content: `تمت إضافة القناة ${channel} للمراقبة.`,
      });
      return;
    }

    if (sub === "removechannel") {
      const channel = interaction.options.getChannel("channel", true);
      const nextIds = config.enabledChannelIds.filter((id) => id !== channel.id);
      setGuildConfig(guildId, { enabledChannelIds: nextIds });
      await interaction.reply({
        flags: [64], // Ephemeral
        content: `تمت إزالة القناة ${channel} من المراقبة.`,
      });
      return;
    }

    return;
  }
});

client.on("messageCreate", async (message) => {
  // تجاهل البوتات والـDM
  if (message.author.bot) return;
  if (!message.inGuild()) return;

  const guildId = message.guildId;
  const config = getGuildConfig(guildId);

  // === اكتشاف روابط الفيديو ===
  const videoUrls = detectVideoUrls(message.content);
  if (videoUrls.length > 0) {
    // التحقق من أن القناة مسموح فيها التحميل
    if (!isChannelAllowed(guildId, message.channelId)) {
      return; // لا نفعل شيء إذا القناة غير مسموح فيها
    }

    const firstUrl = videoUrls[0]; // نعالج أول رابط فقط

    console.log(`[VideoDownload] Detected ${firstUrl.platform} link from ${message.author.tag}`);

    // لا نحذف الرسالة الأصلية ولا نحمل تلقائياً
    // نعرض فقط معلومات الفيديو وأزرار التحميل

    try {
      // جلب معلومات الفيديو
      let videoInfo;
      try {
        videoInfo = await getVideoInfo(firstUrl.url);
      } catch (err) {
        console.error(`[VideoDownload] Failed to get video info:`, err.message);
        videoInfo = {
          title: 'فيديو',
          thumbnail: null,
          duration: 0,
          author: 'غير معروف',
        };
      }

      // إنشاء job
      const jobId = createJob(message.author.id, firstUrl.url, firstUrl.platform, videoInfo);

      // إنشاء Embed
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`📹 ${videoInfo.title}`)
        .setDescription(`**المنصة:** ${getPlatformName(firstUrl.platform)}\n**المدة:** ${formatDuration(videoInfo.duration)}\n**الناشر:** ${videoInfo.author}\n\n**الرابط:** ${firstUrl.url}`)
        .setFooter({ text: `طلب من ${message.author.tag} • اختر الصيغة والجودة للتحميل` });

      if (videoInfo.thumbnail) {
        embed.setThumbnail(videoInfo.thumbnail);
      }

      // إنشاء أزرار اختيار الجودة
      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`quality_best_mp4_${message.author.id}_${jobId}`)
          .setLabel('📥 MP4 (Best)')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`quality_720_mp4_${message.author.id}_${jobId}`)
          .setLabel('📥 MP4 (720p)')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`quality_480_mp4_${message.author.id}_${jobId}`)
          .setLabel('📥 MP4 (480p)')
          .setStyle(ButtonStyle.Primary),
      );

      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`quality_360_mp4_${message.author.id}_${jobId}`)
          .setLabel('📥 MP4 (360p)')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`quality_best_mp3_${message.author.id}_${jobId}`)
          .setLabel('🎵 MP3 (192k)')
          .setStyle(ButtonStyle.Secondary),
      );

      // إرسال الرسالة في نفس القناة (بدون حذف الرسالة الأصلية)
      try {
        await message.reply({ embeds: [embed], components: [row1, row2] });
        console.log(`[VideoDownload] Sent download options to ${message.author.tag}`);
      } catch (err) {
        console.error(`[VideoDownload] Failed to send reply:`, err.message);
      }
    } catch (err) {
      console.error(`[VideoDownload] Error processing video URL:`, err);
    }

    return; // لا نكمل باقي الـ handler
  }

  // === منطق تقييم الميمز الأصلي ===
  // يعمل فقط في قنوات محددة
  if (!config.enabledChannelIds.includes(message.channelId)) return;

  // نراقب فقط رسائل تحتوي مرفقات صورة/فيديو
  if (!isMemeMessage(message)) return;

  // أضف رياكشنين ثم ابدأ المؤقّت
  await safeReact(message, config.emojis.positive);
  await safeReact(message, config.emojis.negative);

  const createdAtMs = message.createdTimestamp || Date.now();
  const endsAtMs = createdAtMs + config.durationMinutes * 60_000;

  scheduleFinalize(guildId, message.channelId, message.id, endsAtMs, createdAtMs);
});

client.login(token);

