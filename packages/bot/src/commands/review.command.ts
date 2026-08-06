import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
} from 'discord.js';
import type { Command } from './index';
import type { Submission } from '@code-dojo/shared';
import { ApiError, getSubmissionById, gradeSubmission, listSubmissions } from '../utils/api-client';
import { isTeacher } from '../utils/permissions';
import { buildPendingListEmbed, buildSubmissionEmbed } from '../embeds/submission.embed';
import { announceLevelUp, applyLevelRole } from '../utils/roles';
import { componentId, type ComponentHandler } from '../interactions/ids';

const GRADE_STATUSES = ['accepted', 'revision', 'grading'] as const;
type GradeStatus = (typeof GRADE_STATUSES)[number];

type GradeableInteraction = ChatInputCommandInteraction | ModalSubmitInteraction;

function buildPendingSelect(submissions: Submission[]): ActionRowBuilder<StringSelectMenuBuilder> {
  const select = new StringSelectMenuBuilder()
    .setCustomId(componentId('review', 'pick'))
    .setPlaceholder('📝 Chọn bài nộp để chấm...')
    .addOptions(
      submissions.slice(0, 25).map((s, i) => ({
        label: `#${i + 1} — ${s.id}`.slice(0, 100),
        description: `Trạng thái: ${s.status}`,
        value: s.id,
      })),
    );
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
}

/** Grades a submission and replies with the result embed + XP/coins + role sync. Shared by the slash path and the modal path. */
async function gradeAndReply(
  interaction: GradeableInteraction,
  submissionId: string,
  status: GradeStatus,
  score: number | null,
  feedback: string | null,
): Promise<void> {
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
}

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
        const all = [...pending, ...late];
        const embed = buildPendingListEmbed(all);
        const components = all.length > 0 ? [buildPendingSelect(all)] : [];
        await interaction.reply({ embeds: [embed], components });
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

    await gradeAndReply(interaction, submissionId, status, score, feedback);
  },
};

export const reviewComponents: ComponentHandler = {
  // Pick a submission from the pending list -> show its details + grading buttons.
  async handleSelect(interaction: StringSelectMenuInteraction, args: string[]): Promise<void> {
    if (args[0] !== 'pick') return;
    if (!isTeacher(interaction)) {
      await interaction.reply({ content: 'Chỉ giáo viên chấm được bài.', ephemeral: true });
      return;
    }
    const submissionId = interaction.values[0];
    if (!submissionId) return;

    try {
      const submission = await getSubmissionById(submissionId);
      const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(componentId('review', 'grade', 'accepted', submissionId))
          .setLabel('✅ Đạt')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(componentId('review', 'grade', 'revision', submissionId))
          .setLabel('✏️ Cần sửa')
          .setStyle(ButtonStyle.Danger),
      );
      await interaction.reply({
        embeds: [buildSubmissionEmbed(submission)],
        components: [buttons],
        ephemeral: true,
      });
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 404
          ? 'Không tìm thấy bài nộp.'
          : 'Có lỗi xảy ra khi lấy bài nộp. Vui lòng thử lại sau.';
      await interaction.reply({ content: message, ephemeral: true });
    }
  },

  // Grade button -> open the score/feedback form. No awaits before showModal (3s window).
  async handleButton(interaction: ButtonInteraction, args: string[]): Promise<void> {
    const [action, status, submissionId] = args;
    if (action !== 'grade' || !submissionId) return;
    if (status !== 'accepted' && status !== 'revision') return;
    if (!isTeacher(interaction)) {
      await interaction.reply({ content: 'Chỉ giáo viên chấm được bài.', ephemeral: true });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(componentId('review', 'modal', status, submissionId))
      .setTitle(status === 'accepted' ? 'Chấm bài — Đạt' : 'Chấm bài — Cần sửa')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('score')
            .setLabel('Điểm số (để trống nếu không chấm điểm)')
            .setPlaceholder('vd: 95')
            .setStyle(TextInputStyle.Short)
            .setRequired(false),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('feedback')
            .setLabel('Nhận xét (tuỳ chọn)')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false),
        ),
      );
    await interaction.showModal(modal);
  },

  async handleModal(interaction: ModalSubmitInteraction, args: string[]): Promise<void> {
    const [action, status, submissionId] = args;
    if (action !== 'modal' || !submissionId) return;
    if (status !== 'accepted' && status !== 'revision') return;
    if (!isTeacher(interaction)) {
      await interaction.reply({ content: 'Chỉ giáo viên chấm được bài.', ephemeral: true });
      return;
    }

    const scoreRaw = interaction.fields.getTextInputValue('score').trim();
    const feedback = interaction.fields.getTextInputValue('feedback').trim();

    let score: number | null = null;
    if (scoreRaw.length > 0) {
      if (!/^\d+$/.test(scoreRaw)) {
        await interaction.reply({
          content: 'Điểm số phải là số nguyên không âm (vd: 95).',
          ephemeral: true,
        });
        return;
      }
      score = Number(scoreRaw);
    }

    await gradeAndReply(interaction, submissionId, status, score, feedback || null);
  },
};
