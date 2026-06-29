import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { Command } from './index';
import type { Course } from '@code-dojo/shared';
import { ApiError, createLesson, getActiveCourse } from '../utils/api-client';
import { isTeacher } from '../utils/permissions';

export const lessonAddCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('lesson-add')
    .setDescription('[Giáo viên] Thêm buổi học vào khoá học đang hoạt động')
    .addIntegerOption((opt) =>
      opt
        .setName('order')
        .setDescription('Thứ tự buổi học (số nguyên)')
        .setRequired(true)
        .setMinValue(0),
    )
    .addStringOption((opt) =>
      opt.setName('topic').setDescription('Chủ đề buổi học').setRequired(true),
    )
    .addStringOption((opt) =>
      opt.setName('description').setDescription('Mô tả buổi học').setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName('scheduled_date')
        .setDescription('Ngày/giờ học (YYYY-MM-DD hoặc YYYY-MM-DDTHH:mm)')
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt.setName('slide_url').setDescription('Link slide (tuỳ chọn)').setRequired(false),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!isTeacher(interaction)) {
      await interaction.reply({
        content: 'Chỉ giáo viên dùng được lệnh này.',
        ephemeral: true,
      });
      return;
    }

    const order = interaction.options.getInteger('order', true);
    const topic = interaction.options.getString('topic', true);
    const description = interaction.options.getString('description', true);
    const scheduledDateStr = interaction.options.getString('scheduled_date', true);
    const slideUrl = interaction.options.getString('slide_url');

    const scheduledDate = new Date(scheduledDateStr);
    if (isNaN(scheduledDate.getTime())) {
      await interaction.reply({
        content: `Ngày học không hợp lệ: "${scheduledDateStr}". Dùng định dạng YYYY-MM-DD hoặc YYYY-MM-DDTHH:mm.`,
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
          content: 'Chưa có khoá học đang hoạt động. Tạo khoá học trước.',
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
      const lesson = await createLesson(course.id, {
        order,
        topic,
        description,
        scheduledDate: scheduledDate.toISOString(),
        slideUrl: slideUrl ?? null,
      });

      const embed = new EmbedBuilder()
        .setTitle(`Buổi học đã được thêm!`)
        .setColor(0x57f287)
        .addFields(
          { name: 'Buổi', value: String(lesson.order), inline: true },
          { name: 'Chủ đề', value: lesson.topic, inline: true },
          {
            name: 'Thời gian',
            value: new Intl.DateTimeFormat('en-GB', {
              timeZone: 'Asia/Ho_Chi_Minh',
              dateStyle: 'medium',
              timeStyle: 'short',
            }).format(new Date(lesson.scheduledDate as unknown as string)),
            inline: true,
          },
          { name: 'Khoá học', value: course.name, inline: false },
        )
        .setFooter({ text: `Lesson ID: ${lesson.id}` });

      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          await interaction.reply({
            content: `Bài học thứ ${order} đã tồn tại.`,
            ephemeral: true,
          });
          return;
        }
        await interaction.reply({
          content: `Lỗi khi thêm buổi học: ${err.message}`,
          ephemeral: true,
        });
        return;
      }
      await interaction.reply({
        content: 'Có lỗi xảy ra khi thêm buổi học. Vui lòng thử lại sau.',
        ephemeral: true,
      });
    }
  },
};
