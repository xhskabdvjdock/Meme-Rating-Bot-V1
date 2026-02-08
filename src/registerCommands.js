require("dotenv").config({ path: ".env" });
const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;

if (!token || !clientId) {
  console.error("Missing DISCORD_TOKEN or CLIENT_ID. Put them in ./env (see env.example).");
  process.exit(1);
}

const memerate = new SlashCommandBuilder()
  .setName("memerate")
  .setDescription("إعدادات بوت تقييم الميمز")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sc) =>
    sc
      .setName("status")
      .setDescription("عرض الإعدادات الحالية")
  )
  .addSubcommand((sc) =>
    sc
      .setName("setduration")
      .setDescription("تحديد مدة التصويت بالدقائق")
      .addIntegerOption((opt) =>
        opt
          .setName("minutes")
          .setDescription("مثال: 10 أو 30")
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(24 * 60)
      )
  )
  .addSubcommand((sc) =>
    sc
      .setName("setemojis")
      .setDescription("تحديد إيموجيات التصويت")
      .addStringOption((opt) =>
        opt.setName("positive").setDescription("إيموجي التقييم الإيجابي (مثال ✅ أو <:up:123>)").setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName("negative").setDescription("إيموجي التقييم السلبي (مثال ❌ أو <:down:123>)").setRequired(true)
      )
  )
  .addSubcommand((sc) =>
    sc
      .setName("addchannel")
      .setDescription("إضافة قناة للمراقبة")
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription("القناة التي يراقبها البوت")
          .setRequired(true)
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      )
  )
  .addSubcommand((sc) =>
    sc
      .setName("removechannel")
      .setDescription("إزالة قناة من المراقبة")
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription("القناة التي تريد إيقاف مراقبتها")
          .setRequired(true)
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      )
  );

const download = new SlashCommandBuilder()
  .setName("download")
  .setDescription("إدارة ميزة تحميل الفيديوهات")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sc) =>
    sc
      .setName("status")
      .setDescription("عرض إعدادات ميزة التحميل")
  )
  .addSubcommand((sc) =>
    sc
      .setName("toggle")
      .setDescription("تفعيل أو تعطيل ميزة التحميل")
      .addBooleanOption((opt) =>
        opt
          .setName("enabled")
          .setDescription("تفعيل (true) أو تعطيل (false)")
          .setRequired(true)
      )
  )
  .addSubcommand((sc) =>
    sc
      .setName("addchannel")
      .setDescription("إضافة قناة لقائمة القنوات المسموح فيها التحميل")
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription("القناة المراد إضافتها")
          .setRequired(true)
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      )
  )
  .addSubcommand((sc) =>
    sc
      .setName("removechannel")
      .setDescription("إزالة قناة من قائمة القنوات المسموح فيها التحميل")
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription("القناة المراد إزالتها")
          .setRequired(true)
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      )
  )
  .addSubcommand((sc) =>
    sc
      .setName("setchannels")
      .setDescription("تحديد نمط القنوات (كل القنوات أو محددة)")
      .addStringOption((opt) =>
        opt
          .setName("mode")
          .setDescription("اختر النمط")
          .setRequired(true)
          .addChoices(
            { name: "كل القنوات", value: "all" },
            { name: "قنوات محددة فقط", value: "specific" }
          )
      )
  );

async function main() {
  const rest = new REST({ version: "10" }).setToken(token);
  const commands = [memerate.toJSON(), download.toJSON()];
  await rest.put(Routes.applicationCommands(clientId), { body: commands });
  console.log("Registered slash commands globally.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

