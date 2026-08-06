import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { env } from './config/env';
import { loadGuildConfig } from './config/guild-config';
import { commands } from './commands/index';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('ready', async () => {
  console.log(`[Bot] Logged in as ${client.user?.tag}`);
  console.log(`[Bot] Serving ${client.guilds.cache.size} guild(s)`);

  // Single-guild MVP: load the stored config for the dev guild, or the first
  // (only) guild the bot is in.
  const guildId = env.DISCORD_GUILD_ID ?? client.guilds.cache.first()?.id;
  if (!guildId) return;

  const loaded = await loadGuildConfig(guildId);
  console.log(
    loaded
      ? `[Bot] Guild config loaded for ${guildId}`
      : `[Bot] No stored guild config for ${guildId} — run /setup (env vars are the fallback)`,
  );
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;
  const command = commands.get(commandName);

  try {
    if (!command) {
      await interaction.reply({
        content: `Command \`/${commandName}\` is registered but not yet implemented.`,
        ephemeral: true,
      });
      return;
    }
    await command.execute(interaction);
  } catch (error) {
    console.error(`[Bot] Error handling /${commandName}:`, error);
    const reply = {
      content: 'Có lỗi xảy ra khi xử lý lệnh. Vui lòng thử lại sau.',
      ephemeral: true,
    };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  }
});

async function main(): Promise<void> {
  await client.login(env.DISCORD_TOKEN);
}

main().catch((err) => {
  console.error('[Bot] Failed to start:', err);
  process.exit(1);
});
