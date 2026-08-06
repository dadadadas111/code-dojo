import {
  ActionRowBuilder,
  ModalBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import type {
  ChatInputCommandInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
} from 'discord.js';
import type { Command } from './index';
import type { Homework, Submission } from '@code-dojo/shared';
import {
  ApiError,
  createSubmission,
  getActiveHomework,
  listSubmissions,
} from '../utils/api-client';
import { buildHomeworkListEmbed } from '../embeds/homework.embed';
import { buildSubmissionEmbed } from '../embeds/submission.embed';
import { componentId, type ComponentHandler } from '../interactions/ids';

const deadlineFormatter = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  dateStyle: 'medium',
});

function buildSubmitSelect(homeworks: Homework[]): ActionRowBuilder<StringSelectMenuBuilder> {
  const select = new StringSelectMenuBuilder()
    .setCustomId(componentId('hw', 'pick'))
    .setPlaceholder('📤 Chọn bài tập để nộp ngay...')
    .addOptions(
      homeworks.slice(0, 25).map((hw, i) => ({
        label: `#${i + 1} — ${hw.title}`.slice(0, 100),
        description: `Hạn nộp: ${deadlineFormatter.format(new Date(hw.deadline as unknown as string))}`,
        value: hw.id,
      })),
    );
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
}

export const homeworkCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('homework')
    .setDescription('Xem danh sách bài tập của khoá học đang hoạt động'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      const homeworks = await getActiveHomework();

      let submittedMap: Map<string, Submission> | undefined;
      try {
        const submissions = await listSubmissions({ discordId: interaction.user.id });
        submittedMap = new Map(submissions.map((s) => [s.homeworkId, s]));
      } catch {
        submittedMap = undefined;
      }

      const embed = buildHomeworkListEmbed(homeworks, submittedMap);
      const components = homeworks.length > 0 ? [buildSubmitSelect(homeworks)] : [];
      await interaction.reply({ embeds: [embed], components });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        await interaction.reply({
          content: 'Chưa có bài tập nào.',
          ephemeral: true,
        });
        return;
      }
      await interaction.reply({
        content: 'Có lỗi xảy ra khi lấy danh sách bài tập. Vui lòng thử lại sau.',
        ephemeral: true,
      });
    }
  },
};

export const homeworkComponents: ComponentHandler = {
  // Select a homework -> open the submit form. No awaits before showModal (3s window).
  async handleSelect(interaction: StringSelectMenuInteraction, args: string[]): Promise<void> {
    if (args[0] !== 'pick') return;
    const homeworkId = interaction.values[0];
    if (!homeworkId) return;

    const modal = new ModalBuilder()
      .setCustomId(componentId('hw', 'modal', homeworkId))
      .setTitle('Nộp bài tập')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('github_link')
            .setLabel('Link GitHub (tuỳ chọn)')
            .setPlaceholder('https://github.com/ban/bai-lam')
            .setStyle(TextInputStyle.Short)
            .setRequired(false),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('content')
            .setLabel('Nội dung bài nộp (tuỳ chọn)')
            .setPlaceholder('Ghi chú, câu trả lời, hoặc link khác...')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false),
        ),
      );
    await interaction.showModal(modal);
  },

  async handleModal(interaction: ModalSubmitInteraction, args: string[]): Promise<void> {
    if (args[0] !== 'modal') return;
    const homeworkId = args[1];
    const githubLink = interaction.fields.getTextInputValue('github_link').trim();
    const content = interaction.fields.getTextInputValue('content').trim();

    if (!homeworkId || (!githubLink && !content)) {
      await interaction.reply({
        content: 'Cần điền ít nhất một trong hai ô: link GitHub hoặc nội dung.',
        ephemeral: true,
      });
      return;
    }

    try {
      const submission = await createSubmission({
        discordId: interaction.user.id,
        homeworkId,
        ...(githubLink ? { githubLink } : {}),
        ...(content ? { content } : {}),
      });

      let homework: Homework | undefined;
      try {
        homework = (await getActiveHomework()).find((hw) => hw.id === homeworkId);
      } catch {
        homework = undefined;
      }

      await interaction.reply({ embeds: [buildSubmissionEmbed(submission, homework)] });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          await interaction.reply({
            content: 'Bạn đã nộp bài này rồi. Dùng /resubmit nếu được yêu cầu sửa.',
            ephemeral: true,
          });
          return;
        }
        if (err.status === 404) {
          await interaction.reply({
            content: 'Bạn chưa đăng ký. Dùng /register.',
            ephemeral: true,
          });
          return;
        }
        await interaction.reply({
          content: `Lỗi khi nộp bài: ${err.message}`,
          ephemeral: true,
        });
        return;
      }
      await interaction.reply({
        content: 'Có lỗi xảy ra khi nộp bài. Vui lòng thử lại sau.',
        ephemeral: true,
      });
    }
  },
};
