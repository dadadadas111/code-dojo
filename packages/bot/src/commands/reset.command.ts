import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import type { ButtonInteraction, ChatInputCommandInteraction } from 'discord.js';
import type { Command } from './index';
import { ApiError, resetAllData } from '../utils/api-client';
import { isAdmin } from '../utils/permissions';
import { componentId, type ComponentHandler } from '../interactions/ids';

const COLLECTION_LABELS: Record<string, string> = {
  students: 'Học viên',
  courses: 'Khoá học',
  lessons: 'Buổi học',
  homeworks: 'Bài tập',
  submissions: 'Bài nộp',
  attendances: 'Điểm danh',
  activityLogs: 'Nhật ký hoạt động',
};

export const resetCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('reset')
    .setDescription('[Admin] Xoá TOÀN BỘ dữ liệu lớp học — tiện ích cho giai đoạn dev/test')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.inGuild()) {
      await interaction.reply({ content: 'Lệnh này chỉ dùng được trong server.', ephemeral: true });
      return;
    }
    if (!isAdmin(interaction)) {
      await interaction.reply({
        content: 'Chỉ quản trị viên (Administrator) mới dùng được lệnh này.',
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({
      embeds: [
        {
          title: '⚠️ Xoá toàn bộ dữ liệu lớp học?',
          color: 0xed4245,
          description: [
            'Hành động này xoá **vĩnh viễn, không khôi phục được**:',
            '- Tất cả hồ sơ học viên (XP, cấp độ, coins, streak)',
            '- Tất cả khoá học, buổi học, bài tập',
            '- Tất cả bài nộp, điểm danh, nhật ký hoạt động',
            '- Bảng xếp hạng',
            '',
            '-# Role và kênh Discord không bị ảnh hưởng — dùng `/uninstall` cho việc đó.',
          ].join('\n'),
        },
      ],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(componentId('reset', 'confirm'))
            .setLabel('⚠️ Xoá toàn bộ dữ liệu')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(componentId('reset', 'cancel'))
            .setLabel('Huỷ')
            .setStyle(ButtonStyle.Secondary),
        ),
      ],
      ephemeral: true,
    });
  },
};

export const resetComponents: ComponentHandler = {
  async handleButton(interaction: ButtonInteraction, args: string[]): Promise<void> {
    if (args[0] === 'cancel') {
      await interaction.update({ content: 'Đã huỷ reset.', embeds: [], components: [] });
      return;
    }
    if (args[0] !== 'confirm') return;
    if (!isAdmin(interaction)) {
      await interaction.reply({ content: 'Chỉ quản trị viên dùng được nút này.', ephemeral: true });
      return;
    }

    await interaction.deferUpdate();

    try {
      const { deleted } = await resetAllData();
      const lines = Object.entries(deleted).map(
        ([key, count]) => `${COLLECTION_LABELS[key] ?? key}: **${count}**`,
      );
      await interaction.editReply({
        embeds: [
          {
            title: '✅ Đã reset dữ liệu lớp học',
            color: 0x57f287,
            description: [
              'Số bản ghi đã xoá:',
              ...lines,
              'Bảng xếp hạng: **đã xoá**',
              '',
              '-# Role cấp độ của thành viên chưa bị gỡ — dùng `/uninstall` hoặc `/assign-role` nếu cần.',
            ].join('\n'),
          },
        ],
        components: [],
      });
    } catch (err) {
      const message =
        err instanceof ApiError
          ? `Reset thất bại (API ${err.status}): ${err.message}`
          : 'Reset thất bại. Vui lòng thử lại sau.';
      await interaction.editReply({ content: message, embeds: [], components: [] });
    }
  },
};
