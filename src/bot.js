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
} = require("discord.js");

const { getGuildConfig, setGuildConfig } = require("./configStore");
const { readPending, upsertPending, removePending } = require("./pendingStore");
const {
  detectVideoUrls,
  getVideoInfo,
  downloadVideo,
  convertToMp3,
  compressVideo,
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
});

client.on("interactionCreate", async (interaction) => {
  // === معالجة الأزرار ===
  if (interaction.isButton()) {
    const customId = interaction.customId;

    // التحقق من أنه زر تحميل
    if (!customId.startsWith('dl_mp4_') && !customId.startsWith('dl_mp3_')) {
      return;
    }

    const parts = customId.split('_');
    const format = parts[1]; // mp4 أو mp3
    const ownerId = parts[2];
    const jobId = parts.slice(3).join('_');

    console.log(`[VideoDownload] Button pressed: ${format} by ${interaction.user.tag}`);

    // التحقق من أن الضاغط هو صاحب الطلب
    if (interaction.user.id !== ownerId) {
      await interaction.reply({
        content: '❌ هذا الزر مخصص لشخص آخر!',
        ephemeral: true,
      });
      return;
    }

    // التحقق من rate limit
    if (!checkRateLimit(interaction.user.id)) {
      const resetMs = getRateLimitReset(interaction.user.id);
      const resetMins = Math.ceil(resetMs / 60000);
      await interaction.reply({
        content: `⚠️ تجاوزت الحد المسموح (5 تحميلات في الساعة)\n⏰ يمكنك المحاولة مجدداً بعد ${resetMins} دقيقة`,
        ephemeral: true,
      });
      return;
    }

    // جلب الـ job
    const job = getJob(jobId);
    if (!job) {
      await interaction.reply({
        content: '❌ انتهت صلاحية هذا الطلب. أرسل الرابط مجدداً.',
        ephemeral: true,
      });
      return;
    }

    // الرد بأن التحميل قيد التحضير
    await interaction.deferReply();

    try {
      updateJob(jobId, { status: 'downloading' });

      const startTime = Date.now();
      console.log(`[VideoDownload] Starting download: ${job.url} (${format})`);

      // تحميل الملف
      let filePath;
      try {
        filePath = await downloadVideo(job.url, format, 'best');
      } catch (err) {
        throw new Error(`فشل في التحميل: ${err.message}`);
      }

      updateJob(jobId, { status: 'converting', filePath });

      // إذا mp3 وتم تحميل فيديو، نحوله
      if (format === 'mp3' && !filePath.endsWith('.mp3')) {
        try {
          filePath = await convertToMp3(filePath);
        } catch (err) {
          deleteFile(filePath);
          throw new Error(`فشل في التحويل: ${err.message}`);
        }
      }

      // التحقق من الحجم
      let fileSize = getFileSize(filePath);
      console.log(`[VideoDownload] File size: ${(fileSize / 1024 / 1024).toFixed(2)}MB`);

      // إذا الملف كبير جداً، نحاول الضغط
      if (fileSize > MAX_FILE_SIZE && format === 'mp4') {
        console.log(`[VideoDownload] File too large, compressing...`);
        try {
          filePath = await compressVideo(filePath);
          fileSize = getFileSize(filePath);
        } catch (err) {
          console.error(`[VideoDownload] Compression failed:`, err.message);
        }
      }

      // إذا لا يزال كبيراً
      if (fileSize > MAX_FILE_SIZE) {
        deleteFile(filePath);
        await interaction.editReply({
          content: `❌ الملف كبير جداً (${(fileSize / 1024 / 1024).toFixed(1)}MB)\n💡 جرب تحميل بجودة أقل أو استخدم موقع تحميل خارجي`,
        });
        deleteJob(jobId);
        return;
      }

      // إرسال الملف
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const remaining = getRemainingRequests(interaction.user.id);

      await interaction.editReply({
        content: `✅ تم التحميل بنجاح!\n⏱️ الوقت: ${elapsed}ث | 📊 الحجم: ${(fileSize / 1024 / 1024).toFixed(1)}MB\n📥 المتبقي لك: ${remaining} تحميلات في الساعة`,
        files: [filePath],
      });

      console.log(`[VideoDownload] Sent file to ${interaction.user.tag} (${elapsed}s)`);

      // تنظيف
      deleteFile(filePath);
      deleteJob(jobId);

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

  // === معالجة الأوامر النصية ===
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "memerate") return;
  if (!interaction.inGuild()) return;

  // السماح فقط لمدير السيرفر (Manage Guild) — كطبقة حماية إضافية
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: "تحتاج صلاحية Manage Server لإدارة إعدادات البوت.", ephemeral: true });
    return;
  }

  const guildId = interaction.guildId;
  const sub = interaction.options.getSubcommand();
  const config = getGuildConfig(guildId);

  if (sub === "status") {
    await interaction.reply({
      ephemeral: true,
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
    await interaction.reply({ ephemeral: true, content: `تم ضبط مدة التصويت إلى **${next.durationMinutes}** دقيقة.` });
    return;
  }

  if (sub === "setemojis") {
    const positive = interaction.options.getString("positive", true).trim();
    const negative = interaction.options.getString("negative", true).trim();
    const next = setGuildConfig(guildId, { emojis: { positive, negative } });
    await interaction.reply({ ephemeral: true, content: `تم ضبط الإيموجيات إلى: ${next.emojis.positive} / ${next.emojis.negative}` });
    return;
  }

  if (sub === "addchannel") {
    const channel = interaction.options.getChannel("channel", true);
    const ids = new Set(config.enabledChannelIds);
    ids.add(channel.id);
    const next = setGuildConfig(guildId, { enabledChannelIds: Array.from(ids) });
    await interaction.reply({ ephemeral: true, content: `تمت إضافة القناة ${channel} للمراقبة.` });
    return;
  }

  if (sub === "removechannel") {
    const channel = interaction.options.getChannel("channel", true);
    const nextIds = config.enabledChannelIds.filter((id) => id !== channel.id);
    setGuildConfig(guildId, { enabledChannelIds: nextIds });
    await interaction.reply({ ephemeral: true, content: `تمت إزالة القناة ${channel} من المراقبة.` });
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
    const firstUrl = videoUrls[0]; // نعالج أول رابط فقط

    console.log(`[VideoDownload] Detected ${firstUrl.platform} link from ${message.author.tag}`);

    // حذف الرسالة الأصلية
    try {
      await message.delete();
      console.log(`[VideoDownload] Deleted original message`);
    } catch (err) {
      console.error(`[VideoDownload] Failed to delete message:`, err.message);
    }

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
        .setDescription(`**المنصة:** ${getPlatformName(firstUrl.platform)}\n**المدة:** ${formatDuration(videoInfo.duration)}\n**الناشر:** ${videoInfo.author}`)
        .setFooter({ text: `طلب من ${message.author.tag} • اختر صيغة التحميل` });

      if (videoInfo.thumbnail) {
        embed.setThumbnail(videoInfo.thumbnail);
      }

      // إنشاء الأزرار
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`dl_mp4_${message.author.id}_${jobId}`)
          .setLabel('📥 Download MP4')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`dl_mp3_${message.author.id}_${jobId}`)
          .setLabel('🎵 Download MP3')
          .setStyle(ButtonStyle.Secondary),
      );

      // إرسال DM
      try {
        await message.author.send({ embeds: [embed], components: [row] });
        console.log(`[VideoDownload] Sent DM to ${message.author.tag}`);
      } catch (err) {
        console.error(`[VideoDownload] Failed to send DM:`, err.message);
        // إذا فشل الـ DM، نرسل في القناة
        const fallbackMsg = await message.channel.send({
          content: `<@${message.author.id}>`,
          embeds: [embed],
          components: [row],
        });
        // حذف بعد 5 دقائق
        setTimeout(() => fallbackMsg.delete().catch(() => { }), 300000);
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

