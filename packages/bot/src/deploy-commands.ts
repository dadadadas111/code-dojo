import { REST, Routes, SlashCommandBuilder } from 'discord.js';

/**
 * Register slash commands with Discord.
 * Run: pnpm --filter @code-dojo/bot deploy-commands
 */
const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Kiểm tra bot còn sống không'),

  // TODO: Add all production commands here
  // new SlashCommandBuilder().setName('profile').setDescription('Xem hồ sơ học sinh'),
  // new SlashCommandBuilder().setName('homework').setDescription('Xem danh sách bài tập'),
  // new SlashCommandBuilder().setName('submit').setDescription('Nộp bài tập')...
].map((cmd) => cmd.toJSON());

async function deploy() {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;
  const guildId = process.env.DISCORD_GUILD_ID;

  if (!token || !clientId) {
    console.error('Missing DISCORD_TOKEN or DISCORD_CLIENT_ID');
    process.exit(1);
  }

  const rest = new REST({ version: '10' }).setToken(token);

  console.log(`[Deploy] Registering ${commands.length} commands...`);

  if (guildId) {
    // Guild-specific (instant updates — use for development)
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: commands,
    });
    console.log(`[Deploy] Registered to guild ${guildId}`);
  } else {
    // Global (takes up to 1 hour to propagate)
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log('[Deploy] Registered globally (may take up to 1 hour)');
  }

  console.log('[Deploy] Done!');
}

deploy().catch(console.error);
