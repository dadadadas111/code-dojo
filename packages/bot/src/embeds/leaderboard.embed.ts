import { EmbedBuilder } from 'discord.js';
import type { PaginatedResponse } from '@code-dojo/shared';
import type { LeaderboardEntry, LeaderboardMetric, LeaderboardRank } from '../utils/api-client';

const METRIC_LABELS: Record<LeaderboardMetric, string> = {
  xp: 'XP',
  coins: 'Coins',
  streak: 'Streak',
};

const METRIC_UNITS: Record<LeaderboardMetric, string> = {
  xp: 'XP',
  coins: 'coins',
  streak: '🔥',
};

function medal(rank: number): string {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return '#';
}

function formatEntry(entry: LeaderboardEntry, unit: string): string {
  const prefix = medal(entry.rank);
  const rankLabel = prefix === '#' ? `#${entry.rank}` : `${prefix} #${entry.rank}`;
  return `${rankLabel} ${entry.displayName} — ${entry.score} ${unit}`;
}

export function buildLeaderboardEmbed(
  metric: LeaderboardMetric,
  board: PaginatedResponse<LeaderboardEntry>,
  viewerRank?: LeaderboardRank,
): EmbedBuilder {
  const unit = METRIC_UNITS[metric];
  const embed = new EmbedBuilder()
    .setTitle(`🏆 Bảng xếp hạng — ${METRIC_LABELS[metric]}`)
    .setColor(0xf1c40f);

  if (board.data.length === 0) {
    embed.setDescription('Chưa có dữ liệu.');
  } else {
    embed.setDescription(board.data.map((entry) => formatEntry(entry, unit)).join('\n'));
  }

  if (viewerRank) {
    embed.addFields({
      name: 'Hạng của bạn',
      value: `#${viewerRank.rank} — ${viewerRank.score} ${unit}`,
    });
  }

  // totalPages is 0 when the board is empty; show at least 1 so the footer reads "1/1".
  embed.setFooter({ text: `Trang ${board.page}/${Math.max(1, board.totalPages)}` });

  return embed;
}
