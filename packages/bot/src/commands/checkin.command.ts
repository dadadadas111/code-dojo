import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { Command } from './index';
import { ApiError, checkin } from '../utils/api-client';
import { buildCheckinEmbed } from '../embeds/attendance.embed';

export const checkinCommand: Command = {
  data: new SlashCommandBuilder().setName('checkin').setDescription('Điểm danh buổi học hôm nay'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      const attendance = await checkin(interaction.user.id);
      const embed = buildCheckinEmbed(attendance);
      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 404) {
          // Three 404 sources: unregistered student, no active course, or no lesson today.
          const content = err.message.toLowerCase().includes('student')
            ? 'Bạn chưa đăng ký. Dùng /register.'
            : 'Hôm nay không có buổi học nào.';
          await interaction.reply({ content, ephemeral: true });
          return;
        }
        if (err.status === 409) {
          await interaction.reply({
            content: 'Bạn đã điểm danh buổi học này rồi.',
            ephemeral: true,
          });
          return;
        }
        await interaction.reply({
          content: `Lỗi khi điểm danh: ${err.message}`,
          ephemeral: true,
        });
        return;
      }
      await interaction.reply({
        content: 'Có lỗi xảy ra khi điểm danh. Vui lòng thử lại sau.',
        ephemeral: true,
      });
    }
  },
};
