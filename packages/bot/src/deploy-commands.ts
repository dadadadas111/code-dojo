import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { env } from './config/env';
import { commands } from './commands/index';

/**
 * Register slash commands with Discord.
 * Run: pnpm --filter @code-dojo/bot deploy-commands
 */
const commandsJson = [...commands.values()].map((cmd) => cmd.data.toJSON());

async function deploy(): Promise<void> {
  if (!env.DISCORD_CLIENT_ID) {
    console.error('Missing DISCORD_CLIENT_ID');
    process.exit(1);
  }

  const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);

  console.log(`[Deploy] Registering ${commandsJson.length} commands...`);

  if (env.DISCORD_GUILD_ID) {
    // Guild-specific (instant updates — use for development)
    await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID), {
      body: commandsJson,
    });
    console.log(`[Deploy] Registered to guild ${env.DISCORD_GUILD_ID}`);
  } else {
    // Global (takes up to 1 hour to propagate)
    await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), { body: commandsJson });
    console.log('[Deploy] Registered globally (may take up to 1 hour)');
  }

  console.log('[Deploy] Done!');
}

deploy().catch(console.error);
