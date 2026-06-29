import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { Command } from './index';
import { ApiError, createCourse } from '../utils/api-client';
import { isTeacher } from '../utils/permissions';

export const courseCreateCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('course-create')
    .setDescription('[Giáo viên] Tạo khoá học mới')
    .addStringOption((opt) => opt.setName('name').setDescription('Tên khoá học').setRequired(true))
    .addStringOption((opt) =>
      opt.setName('description').setDescription('Mô tả khoá học').setRequired(true),
    )
    .addStringOption((opt) =>
      opt.setName('start_date').setDescription('Ngày bắt đầu (YYYY-MM-DD)').setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName('end_date')
        .setDescription('Ngày kết thúc (YYYY-MM-DD, tuỳ chọn)')
        .setRequired(false),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!isTeacher(interaction)) {
      await interaction.reply({
        content: 'Chỉ giáo viên dùng được lệnh này.',
        ephemeral: true,
      });
      return;
    }

    const name = interaction.options.getString('name', true);
    const description = interaction.options.getString('description', true);
    const startDateStr = interaction.options.getString('start_date', true);
    const endDateStr = interaction.options.getString('end_date');

    const startDate = new Date(startDateStr);
    if (isNaN(startDate.getTime())) {
      await interaction.reply({
        content: `Ngày bắt đầu không hợp lệ: "${startDateStr}". Dùng định dạng YYYY-MM-DD.`,
        ephemeral: true,
      });
      return;
    }

    let endDateISO: string | null = null;
    if (endDateStr) {
      const endDate = new Date(endDateStr);
      if (isNaN(endDate.getTime())) {
        await interaction.reply({
          content: `Ngày kết thúc không hợp lệ: "${endDateStr}". Dùng định dạng YYYY-MM-DD.`,
          ephemeral: true,
        });
        return;
      }
      endDateISO = endDate.toISOString();
    }

    try {
      const course = await createCourse({
        name,
        description,
        startDate: startDate.toISOString(),
        endDate: endDateISO,
      });

      const embed = new EmbedBuilder()
        .setTitle('Khoá học đã được tạo!')
        .setColor(0x57f287)
        .addFields(
          { name: 'Tên', value: course.name, inline: true },
          { name: 'ID', value: course.id, inline: true },
          {
            name: 'Ngày bắt đầu',
            value: new Intl.DateTimeFormat('en-GB', {
              timeZone: 'Asia/Ho_Chi_Minh',
              dateStyle: 'medium',
            }).format(new Date(course.startDate as unknown as string)),
            inline: true,
          },
        )
        .setFooter({ text: 'Dùng /lesson-add để thêm buổi học' });

      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      if (err instanceof ApiError) {
        await interaction.reply({
          content: `Lỗi khi tạo khoá học: ${err.message}`,
          ephemeral: true,
        });
        return;
      }
      await interaction.reply({
        content: 'Có lỗi xảy ra khi tạo khoá học. Vui lòng thử lại sau.',
        ephemeral: true,
      });
    }
  },
};
