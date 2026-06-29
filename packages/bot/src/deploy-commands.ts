import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import { env } from './config/env';

/**
 * Register slash commands with Discord.
 * Run: pnpm --filter @code-dojo/bot deploy-commands
 */
const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Kiểm tra bot còn sống không'),

  // TODO: Add all production commands here
  // new SlashCommandBuilder().setName('profile').setDescription('Xem hồ sơ học sinh'),
  // new SlashCommandBuilder().setName('homework').setDescription('Xem danh sách bài tập'),
  // new SlashCommandBuilder().setName('submit').setDescription('Nộp bài tập')...
].map((cmd) => cmd.toJSON());

async function deploy(): Promise<void> {
  if (!env.DISCORD_CLIENT_ID) {
    console.error('Missing DISCORD_CLIENT_ID');
    process.exit(1);
  }

  const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);

  console.log(`[Deploy] Registering ${commands.length} commands...`);

  if (env.DISCORD_GUILD_ID) {
    // Guild-specific (instant updates — use for development)
    await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID), {
      body: commands,
    });
    console.log(`[Deploy] Registered to guild ${env.DISCORD_GUILD_ID}`);
  } else {
    // Global (takes up to 1 hour to propagate)
    await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), { body: commands });
    console.log('[Deploy] Registered globally (may take up to 1 hour)');
  }

  console.log('[Deploy] Done!');
}

deploy().catch(console.error);
