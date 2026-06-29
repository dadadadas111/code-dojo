import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { Command } from './index';
import { ApiError, getStudentByDiscord } from '../utils/api-client';
import { buildProfileEmbed } from '../embeds/profile.embed';

export const profileCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Xem hồ sơ học sinh')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('Học sinh cần xem (mặc định: bạn)').setRequired(false),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const targetUser = interaction.options.getUser('user') ?? interaction.user;

    try {
      const student = await getStudentByDiscord(targetUser.id);
      const embed = buildProfileEmbed(student, targetUser);
      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        await interaction.reply({
          content: 'Chưa có hồ sơ. Dùng /register trước.',
          ephemeral: true,
        });
        return;
      }
      await interaction.reply({
        content: 'Có lỗi xảy ra khi lấy hồ sơ. Vui lòng thử lại sau.',
        ephemeral: true,
      });
    }
  },
};
