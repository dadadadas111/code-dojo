import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { Command } from './index';
import type { AttendanceStatus, Course, Lesson } from '@code-dojo/shared';
import { ApiError, getActiveCourse, getCourseLessons, markAttendance } from '../utils/api-client';
import { isTeacher } from '../utils/permissions';

const ATTENDANCE_STATUSES = ['present', 'late', 'absent'] as const;

const STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: '✅ Có mặt',
  late: '⏰ Đi trễ',
  absent: '❌ Vắng',
};

export const attendanceMarkCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('attendance-mark')
    .setDescription('[Giáo viên] Sửa điểm danh cho học viên')
    .setDefaultMemberPermissions('0')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('Học viên cần sửa điểm danh').setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName('status')
        .setDescription('Trạng thái điểm danh')
        .setRequired(true)
        .addChoices(...ATTENDANCE_STATUSES.map((s) => ({ name: s, value: s }))),
    )
    .addIntegerOption((opt) =>
      opt.setName('lesson').setDescription('Thứ tự buổi học').setRequired(true).setMinValue(0),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!isTeacher(interaction)) {
      await interaction.reply({
        content: 'Chỉ giáo viên dùng được lệnh này.',
        ephemeral: true,
      });
      return;
    }

    const targetUser = interaction.options.getUser('user', true);
    const status = interaction.options.getString('status', true) as AttendanceStatus;
    const order = interaction.options.getInteger('lesson', true);

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
      const attendance = await markAttendance(lesson.id, targetUser.id, status);

      const embed = new EmbedBuilder()
        .setTitle('Đã cập nhật điểm danh')
        .setColor(0x57f287)
        .addFields(
          { name: 'Học viên', value: `<@${targetUser.id}>`, inline: true },
          { name: 'Buổi', value: `${lesson.order}: ${lesson.topic}`, inline: true },
          { name: 'Trạng thái', value: STATUS_LABELS[attendance.status], inline: true },
        )
        .setFooter({ text: `Attendance ID: ${attendance.id}` });

      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 404) {
          await interaction.reply({
            content: 'Không tìm thấy học viên hoặc buổi học.',
            ephemeral: true,
          });
          return;
        }
        await interaction.reply({
          content: `Lỗi khi sửa điểm danh: ${err.message}`,
          ephemeral: true,
        });
        return;
      }
      await interaction.reply({
        content: 'Có lỗi xảy ra khi sửa điểm danh. Vui lòng thử lại sau.',
        ephemeral: true,
      });
    }
  },
};
