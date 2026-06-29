import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { Command } from './index';
import { ApiError, getNextLesson } from '../utils/api-client';
import { buildLessonEmbed } from '../embeds/lesson.embed';

export const lessonCommand: Command = {
  data: new SlashCommandBuilder().setName('lesson').setDescription('Xem buổi học tiếp theo'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      const lesson = await getNextLesson();
      const embed = buildLessonEmbed(lesson);
      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        await interaction.reply({
          content: 'Chưa có buổi học nào sắp tới.',
          ephemeral: true,
        });
        return;
      }
      await interaction.reply({
        content: 'Có lỗi xảy ra khi lấy thông tin buổi học. Vui lòng thử lại sau.',
        ephemeral: true,
      });
    }
  },
};
