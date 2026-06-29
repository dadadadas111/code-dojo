import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { Course } from '@code-dojo/shared';
import type { Command } from './index';
import { ApiError, getActiveCourse, getCourseLessons } from '../utils/api-client';
import { buildScheduleEmbed } from '../embeds/schedule.embed';

export const scheduleCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('schedule')
    .setDescription('Xem lịch học của khoá học đang hoạt động'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    let course: Course;
    try {
      course = await getActiveCourse();
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        await interaction.reply({
          content: 'Chưa có khoá học đang hoạt động.',
          ephemeral: true,
        });
        return;
      }
      await interaction.reply({
        content: 'Có lỗi xảy ra khi lấy khoá học. Vui lòng thử lại sau.',
        ephemeral: true,
      });
      return;
    }

    try {
      const lessons = await getCourseLessons(course.id);
      const embed = buildScheduleEmbed(course, lessons);
      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      if (err instanceof ApiError) {
        await interaction.reply({
          content: `Lỗi khi lấy lịch học: ${err.message}`,
          ephemeral: true,
        });
        return;
      }
      await interaction.reply({
        content: 'Có lỗi xảy ra khi lấy lịch học. Vui lòng thử lại sau.',
        ephemeral: true,
      });
    }
  },
};
