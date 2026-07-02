import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { Command } from './index';
import { ApiError, gradeSubmission, listSubmissions } from '../utils/api-client';
import { isTeacher } from '../utils/permissions';
import { buildPendingListEmbed, buildSubmissionEmbed } from '../embeds/submission.embed';
import { announceLevelUp, applyLevelRole } from '../utils/roles';

const GRADE_STATUSES = ['accepted', 'revision', 'grading'] as const;
type GradeStatus = (typeof GRADE_STATUSES)[number];

export const reviewCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('review')
    .setDescription('[Giáo viên] Xem hoặc chấm bài nộp')
    .addStringOption((opt) =>
      opt
        .setName('submission_id')
        .setDescription('ID bài nộp cần chấm (bỏ trống để xem danh sách chờ chấm)')
        .setRequired(false),
    )
    .addStringOption((opt) =>
      opt
        .setName('status')
        .setDescription('Trạng thái chấm')
        .setRequired(false)
        .addChoices(...GRADE_STATUSES.map((s) => ({ name: s, value: s }))),
    )
    .addIntegerOption((opt) =>
      opt.setName('score').setDescription('Điểm số (tuỳ chọn)').setRequired(false).setMinValue(0),
    )
    .addStringOption((opt) =>
      opt.setName('feedback').setDescription('Nhận xét (tuỳ chọn)').setRequired(false),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!isTeacher(interaction)) {
      await interaction.reply({
        content: 'Chỉ giáo viên dùng được lệnh này.',
        ephemeral: true,
      });
      return;
    }

    const submissionId = interaction.options.getString('submission_id');
    const status = interaction.options.getString('status') as GradeStatus | null;
    const score = interaction.options.getInteger('score');
    const feedback = interaction.options.getString('feedback');

    if (!submissionId) {
      try {
        const [pending, late] = await Promise.all([
          listSubmissions({ status: 'pending' }),
          listSubmissions({ status: 'late' }),
        ]);
        const embed = buildPendingListEmbed([...pending, ...late]);
        await interaction.reply({ embeds: [embed] });
      } catch (err) {
        if (err instanceof ApiError) {
          await interaction.reply({
            content: `Lỗi khi lấy danh sách bài nộp: ${err.message}`,
            ephemeral: true,
          });
          return;
        }
        await interaction.reply({
          content: 'Có lỗi xảy ra khi lấy danh sách bài nộp. Vui lòng thử lại sau.',
          ephemeral: true,
        });
      }
      return;
    }

    if (!status) {
      await interaction.reply({
        content: 'Cần cung cấp status khi chấm một bài nộp cụ thể.',
        ephemeral: true,
      });
      return;
    }

    try {
      const submission = await gradeSubmission(submissionId, {
        status,
        ...(score !== null ? { score } : {}),
        ...(feedback ? { feedback } : {}),
      });

      const embed = buildSubmissionEmbed(submission);

      if (submission.xp) {
        embed.addFields({
          name: 'XP',
          value: submission.xp.leveledUp
            ? `+${submission.xp.xpAwarded} XP — Lên cấp ${submission.xp.newLevel} (${submission.xp.newTitle})!`
            : `+${submission.xp.xpAwarded} XP`,
          inline: false,
        });
      }

      if (submission.coins) {
        embed.addFields({
          name: 'Coins',
          value: `+${submission.coins.coinsAwarded} coins`,
          inline: false,
        });
      }

      await interaction.reply({ embeds: [embed] });

      if (submission.xp?.leveledUp && interaction.guild) {
        const { discordId, newLevel, newTitle } = submission.xp;
        await applyLevelRole(interaction.guild, discordId, newLevel);
        await announceLevelUp(interaction.guild, discordId, newLevel, newTitle);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          await interaction.reply({
            content: 'Không thể chuyển trạng thái bài nộp này (chuyển đổi không hợp lệ).',
            ephemeral: true,
          });
          return;
        }
        if (err.status === 422) {
          await interaction.reply({
            content: 'Điểm số không hợp lệ (vượt quá điểm tối đa cho phép).',
            ephemeral: true,
          });
          return;
        }
        if (err.status === 404) {
          await interaction.reply({
            content: 'Không tìm thấy bài nộp.',
            ephemeral: true,
          });
          return;
        }
        await interaction.reply({
          content: `Lỗi khi chấm bài: ${err.message}`,
          ephemeral: true,
        });
        return;
      }
      await interaction.reply({
        content: 'Có lỗi xảy ra khi chấm bài. Vui lòng thử lại sau.',
        ephemeral: true,
      });
    }
  },
};
