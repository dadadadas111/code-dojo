import { EmbedBuilder } from 'discord.js';
import type { User } from 'discord.js';
import type { Student } from '@code-dojo/shared';
import { getLevelFromXp } from '@code-dojo/shared';

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
    )
    .setFooter({ text: `ID: ${student.id}` })
    .setTimestamp(new Date(student.joinDate));
}
