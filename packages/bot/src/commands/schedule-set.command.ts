import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { Command } from './index';
import { ApiError, getActiveCourse, setCourseSchedule } from '../utils/api-client';
import { isTeacher } from '../utils/permissions';
import { parseSlot, scheduleLabel } from '../utils/schedule';

export const scheduleSetCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('schedule-set')
    .setDescription('[Giáo viên] Đặt nhịp dạy cố định — buổi học tự xếp vào các slot này')
    .setDefaultMemberPermissions('0')
    .addStringOption((opt) =>
      opt
        .setName('slot1')
        .setDescription('Slot 1, vd: "T7 08:00" (T2–T7 hoặc CN + giờ 24h)')
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt.setName('slot2').setDescription('Slot 2, vd: "T2 20:00" (tuỳ chọn)').setRequired(false),
    )
    .addStringOption((opt) =>
      opt.setName('slot3').setDescription('Slot 3 (tuỳ chọn)').setRequired(false),
    )
    .addStringOption((opt) =>
      opt.setName('slot4').setDescription('Slot 4 (tuỳ chọn)').setRequired(false),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!isTeacher(interaction)) {
      await interaction.reply({ content: 'Chỉ giáo viên dùng được lệnh này.', ephemeral: true });
      return;
    }

    const raws = ['slot1', 'slot2', 'slot3', 'slot4']
      .map((name) => interaction.options.getString(name))
      .filter((v): v is string => v !== null);

    const slots = [];
    for (const raw of raws) {
      const slot = parseSlot(raw);
      if (!slot) {
        await interaction.reply({
          content: `Slot không hợp lệ: "${raw}". Định dạng: \`T2\`–\`T7\` hoặc \`CN\` + giờ 24h, vd \`T7 08:00\`.`,
          ephemeral: true,
        });
        return;
      }
      slots.push(slot);
    }

    try {
      const course = await getActiveCourse();
      const updated = await setCourseSchedule(course.id, { slots });
      const schedule = updated.schedule;

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('📅 Đã đặt nhịp dạy')
            .setColor(0x57f287)
            .setDescription(
              [
                `Khoá **${updated.name}** học cố định: **${schedule ? scheduleLabel(schedule) : '—'}**`,
                '',
                'Từ giờ `/lesson-add` không cần nhập ngày — buổi mới tự xếp vào slot trống kế tiếp.',
                'Bận đột xuất? Dùng `/postpone` để dời cả lịch một slot.',
              ].join('\n'),
            ),
        ],
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        await interaction.reply({
          content: 'Chưa có khoá học đang hoạt động. Tạo khoá học trước.',
          ephemeral: true,
        });
        return;
      }
      const message =
        err instanceof ApiError
          ? `Lỗi khi đặt lịch: ${err.message}`
          : 'Có lỗi xảy ra khi đặt lịch. Vui lòng thử lại sau.';
      await interaction.reply({ content: message, ephemeral: true });
    }
  },
};
