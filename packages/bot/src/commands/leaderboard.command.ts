import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { Command } from './index';
import type { LeaderboardMetric, LeaderboardRank } from '../utils/api-client';
import { ApiError, getLeaderboard, getLeaderboardRank } from '../utils/api-client';
import { buildLeaderboardEmbed } from '../embeds/leaderboard.embed';

const METRIC_CHOICES: { name: string; value: LeaderboardMetric }[] = [
  { name: 'XP', value: 'xp' },
  { name: 'Coins', value: 'coins' },
  { name: 'Streak', value: 'streak' },
];

export const leaderboardCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Xem bảng xếp hạng')
    .addStringOption((opt) =>
      opt
        .setName('metric')
        .setDescription('Tiêu chí xếp hạng (mặc định: XP)')
        .setRequired(false)
        .addChoices(...METRIC_CHOICES),
    )
    .addIntegerOption((opt) =>
      opt.setName('page').setDescription('Trang (mặc định: 1)').setRequired(false).setMinValue(1),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const metric = (interaction.options.getString('metric') as LeaderboardMetric | null) ?? 'xp';
    const page = interaction.options.getInteger('page') ?? 1;

    try {
      const board = await getLeaderboard(metric, page);

      // Best-effort: show the caller's own rank if they're a ranked student.
      // Any failure (unregistered → 404, or a transient error) just omits the field.
      let viewerRank: LeaderboardRank | undefined;
      try {
        viewerRank = await getLeaderboardRank(metric, interaction.user.id);
      } catch {
        viewerRank = undefined;
      }

      const embed = buildLeaderboardEmbed(metric, board, viewerRank);
      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      if (err instanceof ApiError) {
        await interaction.reply({
          content: `Lỗi khi lấy bảng xếp hạng: ${err.message}`,
          ephemeral: true,
        });
        return;
      }
      await interaction.reply({
        content: 'Có lỗi xảy ra khi lấy bảng xếp hạng. Vui lòng thử lại sau.',
        ephemeral: true,
      });
    }
  },
};
