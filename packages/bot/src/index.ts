import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('ready', () => {
  console.log(`[Bot] Logged in as ${client.user?.tag}`);
  console.log(`[Bot] Serving ${client.guilds.cache.size} guild(s)`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // TODO: Route to command handlers
  const { commandName } = interaction;

  try {
    switch (commandName) {
      case 'ping':
        await interaction.reply({ content: 'Pong! 🏓', ephemeral: true });
        break;
      default:
        await interaction.reply({
          content: `Command \`/${commandName}\` is registered but not yet implemented.`,
          ephemeral: true,
        });
    }
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

async function main() {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    console.error('[Bot] DISCORD_TOKEN is not set. Check your .env file.');
    process.exit(1);
  }
  await client.login(token);
}

main().catch((err) => {
  console.error('[Bot] Failed to start:', err);
  process.exit(1);
});
