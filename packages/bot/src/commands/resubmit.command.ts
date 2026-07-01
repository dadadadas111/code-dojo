import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { Command } from './index';
import type { Homework } from '@code-dojo/shared';
import {
  ApiError,
  getActiveHomework,
  listSubmissions,
  resubmitSubmission,
} from '../utils/api-client';
import { buildSubmissionEmbed } from '../embeds/submission.embed';

export const resubmitCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('resubmit')
    .setDescription('Nộp lại bài tập cần sửa')
    .addIntegerOption((opt) =>
      opt
        .setName('homework')
        .setDescription('Số thứ tự bài tập (xem /homework)')
        .setRequired(true)
        .setMinValue(1),
    )
    .addStringOption((opt) =>
      opt.setName('github_link').setDescription('Link GitHub (tuỳ chọn)').setRequired(false),
    )
    .addStringOption((opt) =>
      opt.setName('content').setDescription('Nội dung bài nộp (tuỳ chọn)').setRequired(false),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const index = interaction.options.getInteger('homework', true);
    const githubLink = interaction.options.getString('github_link');
    const content = interaction.options.getString('content');

    if (!githubLink && !content) {
      await interaction.reply({
        content: 'Cần cung cấp ít nhất một trong hai: github_link hoặc content.',
        ephemeral: true,
      });
      return;
    }

    let homeworks: Homework[];
    try {
      homeworks = await getActiveHomework();
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
      return;
    }

    const homework = homeworks[index - 1];
    if (!homework) {
      await interaction.reply({
        content: `Không tìm thấy bài tập #${index}. Dùng /homework để xem danh sách.`,
        ephemeral: true,
      });
      return;
    }

    const discordId = interaction.user.id;

    let existing;
    try {
      const submissions = await listSubmissions({ homeworkId: homework.id, discordId });
      existing = submissions[0];
    } catch {
      await interaction.reply({
        content: 'Có lỗi xảy ra khi tìm bài nộp. Vui lòng thử lại sau.',
        ephemeral: true,
      });
      return;
    }

    if (!existing) {
      await interaction.reply({
        content: 'Chưa có bài nộp.',
        ephemeral: true,
      });
      return;
    }

    try {
      const submission = await resubmitSubmission({
        id: existing.id,
        discordId,
        ...(githubLink ? { githubLink } : {}),
        ...(content ? { content } : {}),
      });

      const embed = buildSubmissionEmbed(submission, homework);
      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          await interaction.reply({
            content: 'Bài này không ở trạng thái cần sửa.',
            ephemeral: true,
          });
          return;
        }
        if (err.status === 403) {
          await interaction.reply({
            content: 'Bạn không có quyền nộp lại bài này.',
            ephemeral: true,
          });
          return;
        }
        await interaction.reply({
          content: `Lỗi khi nộp lại bài: ${err.message}`,
          ephemeral: true,
        });
        return;
      }
      await interaction.reply({
        content: 'Có lỗi xảy ra khi nộp lại bài. Vui lòng thử lại sau.',
        ephemeral: true,
      });
    }
  },
};
