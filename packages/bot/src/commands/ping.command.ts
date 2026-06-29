import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { Command } from './index';

export const pingCommand: Command = {
  data: new SlashCommandBuilder().setName('ping').setDescription('Kiểm tra bot còn sống không'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.reply({ content: 'Pong! 🏓', ephemeral: true });
  },
};
