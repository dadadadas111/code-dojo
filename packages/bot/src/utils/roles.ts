import { EmbedBuilder } from 'discord.js';
import type { Guild } from 'discord.js';
import { env, levelRoleIds } from '../config/env';

/**
 * Syncs a member's level role: removes any other configured level roles they
 * hold and adds the role for `newLevel`. No-ops when LEVEL_ROLE_IDS is unset
 * or malformed. Never throws — Discord permission/hierarchy issues are logged
 * and swallowed so a role-sync failure can't break the calling command.
 */
export async function applyLevelRole(
  guild: Guild,
  discordId: string,
  newLevel: number,
): Promise<void> {
  const roleMap = levelRoleIds();
  const roleIds = Object.values(roleMap);
  if (roleIds.length === 0) return;

  const targetRoleId = roleMap[String(newLevel)];
  if (!targetRoleId) return;

  try {
    const member = await guild.members.fetch(discordId);

    const rolesToRemove = roleIds.filter(
      (roleId) => roleId !== targetRoleId && member.roles.cache.has(roleId),
    );
    if (rolesToRemove.length > 0) {
      await member.roles.remove(rolesToRemove);
    }

    if (!member.roles.cache.has(targetRoleId)) {
      await member.roles.add(targetRoleId);
    }
  } catch (err) {
    console.warn(`[Bot] Failed to sync level role for ${discordId}:`, err);
  }
}

/**
 * Posts a level-up announcement in LEVELUP_CHANNEL_ID. No-ops when unset.
 * Never throws — channel-fetch/send failures are logged and swallowed.
 */
export async function announceLevelUp(
  guild: Guild,
  discordId: string,
  newLevel: number,
  newTitle: string,
): Promise<void> {
  if (!env.LEVELUP_CHANNEL_ID) return;

  try {
    const channel = await guild.channels.fetch(env.LEVELUP_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) return;

    const embed = new EmbedBuilder()
      .setColor(0xfee75c)
      .setDescription(`🎉 <@${discordId}> đã đạt cấp ${newLevel} - ${newTitle}!`);

    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.warn(`[Bot] Failed to announce level-up for ${discordId}:`, err);
  }
}
