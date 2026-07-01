import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { Command } from './index';
import type { Course, Lesson } from '@code-dojo/shared';
import {
  ApiError,
  getActiveCourse,
  getCourseLessons,
  getLessonAttendance,
  getMyAttendance,
} from '../utils/api-client';
import { isTeacher } from '../utils/permissions';
import { buildLessonAttendanceEmbed, buildMyAttendanceEmbed } from '../embeds/attendance.embed';

export const attendanceCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('attendance')
    .setDescription('Xem điểm danh')
    .addIntegerOption((opt) =>
      opt
        .setName('lesson')
        .setDescription('[Giáo viên] Thứ tự buổi học cần xem điểm danh')
        .setRequired(false)
        .setMinValue(0),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const order = interaction.options.getInteger('lesson');

    if (order === null) {
      try {
        const attendances = await getMyAttendance(interaction.user.id);
        // Best-effort: resolve the active course's lessons so history shows
        // "Buổi N: topic" instead of raw ids. Falls back gracefully if unavailable.
        let lessons: Lesson[] | undefined;
        try {
          const course = await getActiveCourse();
          lessons = await getCourseLessons(course.id);
        } catch {
          lessons = undefined;
        }
        const embed = buildMyAttendanceEmbed(attendances, lessons);
        await interaction.reply({ embeds: [embed] });
      } catch (err) {
        if (err instanceof ApiError) {
          await interaction.reply({
            content: `Lỗi khi lấy dữ liệu điểm danh: ${err.message}`,
            ephemeral: true,
          });
          return;
        }
        await interaction.reply({
          content: 'Có lỗi xảy ra khi lấy dữ liệu điểm danh. Vui lòng thử lại sau.',
          ephemeral: true,
        });
      }
      return;
    }

    if (!isTeacher(interaction)) {
      await interaction.reply({
        content: 'Chỉ giáo viên dùng được lệnh này.',
        ephemeral: true,
      });
      return;
    }

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

    let lessons: Lesson[];
    try {
      lessons = await getCourseLessons(course.id);
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
      return;
    }

    const lesson = lessons.find((l) => l.order === order);
    if (!lesson) {
      await interaction.reply({
        content: `Không tìm thấy buổi học thứ ${order}. Dùng /schedule để xem lịch học.`,
        ephemeral: true,
      });
      return;
    }

    try {
      const { attendances, stats } = await getLessonAttendance(lesson.id);
      const embed = buildLessonAttendanceEmbed(lesson, attendances, stats);
      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      if (err instanceof ApiError) {
        await interaction.reply({
          content: `Lỗi khi lấy điểm danh: ${err.message}`,
          ephemeral: true,
        });
        return;
      }
      await interaction.reply({
        content: 'Có lỗi xảy ra khi lấy điểm danh. Vui lòng thử lại sau.',
        ephemeral: true,
      });
    }
  },
};
