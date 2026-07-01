import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { Command } from './index';
import type { Homework } from '@code-dojo/shared';
import { ApiError, createSubmission, getActiveHomework } from '../utils/api-client';
import { buildSubmissionEmbed } from '../embeds/submission.embed';

export const submitCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('submit')
    .setDescription('Nộp bài tập')
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

    try {
      const submission = await createSubmission({
        discordId: interaction.user.id,
        homeworkId: homework.id,
        ...(githubLink ? { githubLink } : {}),
        ...(content ? { content } : {}),
      });

      const embed = buildSubmissionEmbed(submission, homework);
      await interaction.reply({ embeds: [embed] });
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
