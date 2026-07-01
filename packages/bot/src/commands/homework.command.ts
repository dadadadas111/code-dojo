import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { Command } from './index';
import type { Submission } from '@code-dojo/shared';
import { ApiError, getActiveHomework, listSubmissions } from '../utils/api-client';
import { buildHomeworkListEmbed } from '../embeds/homework.embed';

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
      await interaction.reply({ embeds: [embed] });
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
