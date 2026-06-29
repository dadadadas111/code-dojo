import type { ChatInputCommandInteraction } from 'discord.js';
import { GuildMemberRoleManager } from 'discord.js';
import { env } from '../config/env';

export function isTeacher(interaction: ChatInputCommandInteraction): boolean {
  if (!interaction.inGuild()) return false;

  const { member } = interaction;
  if (!member) return false;

  const roleId = env.TEACHER_ROLE_ID;

  if (member.roles instanceof GuildMemberRoleManager) {
    return member.roles.cache.has(roleId);
  }

  // member.roles is string[] in raw REST interactions
  return (member.roles as string[]).includes(roleId);
}
