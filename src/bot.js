require("dotenv").config({ path: ".env" });
const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionFlagsBits,
  ChannelType,
} = require("discord.js");

const { getGuildConfig, setGuildConfig } = require("./configStore");
const { readPending, upsertPending, removePending } = require("./pendingStore");

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
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
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

