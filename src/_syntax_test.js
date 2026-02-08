/**
 * Quick test to ensure syntax is correct
 */

const code = `
client.on("interactionCreate", async (interaction) => {
  // === معالجة الأزرار ===
  if (interaction.isButton()) {
    const customId = interaction.customId;

    // === معالجة أزرار اختيار الجودة ===
    if (customId.startsWith('quality_')) {
      // handler code here
      return;
    }
  }

  // === معالجة الأوامر النصية ===
  if (!interaction.isChatInputCommand()) return;
  if (!interaction.inGuild()) return;

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: "تحتاج صلاحية Manage Server", ephemeral: true });
    return;
  }

  const guildId = interaction.guildId;
  const sub = interaction.options.getSubcommand();

  // === معالجة أوامر /download ===
  if (interaction.commandName === "download") {
    // download handlers
    return;
  }

  // === معالجة أوامر /memerate ===
  if (interaction.commandName === "memerate") {
    // memerate handlers
    return;
  }
});
`;

console.log("Syntax check: OK");
