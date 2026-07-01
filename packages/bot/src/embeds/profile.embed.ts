import { EmbedBuilder } from 'discord.js';
import type { User } from 'discord.js';
import type { Student } from '@code-dojo/shared';
import { getLevelFromXp, LEVEL_THRESHOLDS } from '@code-dojo/shared';

const PROGRESS_BAR_LENGTH = 10;

function buildProgressBar(ratio: number): string {
  const filled = Math.round(Math.min(Math.max(ratio, 0), 1) * PROGRESS_BAR_LENGTH);
  return '█'.repeat(filled) + '░'.repeat(PROGRESS_BAR_LENGTH - filled);
}

function buildXpProgressText(xp: number): string {
  const { level } = getLevelFromXp(xp);
  const maxLevel = Math.max(...Object.keys(LEVEL_THRESHOLDS).map(Number));

  if (level >= maxLevel) {
    return `${buildProgressBar(1)} MAX`;
  }

  const currentFloor = LEVEL_THRESHOLDS[level]?.xp ?? 0;
  const nextFloor = LEVEL_THRESHOLDS[level + 1]?.xp ?? currentFloor;
  const bandSize = nextFloor - currentFloor;
  const xpIntoBand = xp - currentFloor;
  const ratio = bandSize > 0 ? xpIntoBand / bandSize : 1;

  return `${buildProgressBar(ratio)} ${xpIntoBand} / ${bandSize} XP đến cấp ${level + 1}`;
}

export function buildProfileEmbed(student: Student, discordUser: User): EmbedBuilder {
  const { title } = getLevelFromXp(student.xp);

  return new EmbedBuilder()
    .setTitle(`Hồ sơ: ${student.displayName}`)
    .setThumbnail(discordUser.displayAvatarURL())
    .setColor(0x5865f2)
    .addFields(
      { name: 'Cấp độ', value: `${student.level} — ${title}`, inline: true },
      { name: 'XP', value: String(student.xp), inline: true },
      { name: 'Coins', value: String(student.coins), inline: true },
      { name: 'Chuỗi hiện tại', value: `${student.currentStreak} ngày`, inline: true },
      { name: 'Chuỗi cao nhất', value: `${student.maxStreak} ngày`, inline: true },
      { name: 'Tiến độ lên cấp', value: buildXpProgressText(student.xp), inline: false },
    )
    .setFooter({ text: `ID: ${student.id}` })
    .setTimestamp(new Date(student.joinDate));
}
