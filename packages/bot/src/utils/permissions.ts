import type { ChatInputCommandInteraction } from 'discord.js';
import { GuildMemberRoleManager } from 'discord.js';
import { teacherRoleId } from '../config/guild-config';

export function isTeacher(interaction: ChatInputCommandInteraction): boolean {
  if (!interaction.inGuild()) return false;

  const { member } = interaction;
  if (!member) return false;

  // Null until /setup has run (or TEACHER_ROLE_ID is set) — nobody is a teacher yet.
  const roleId = teacherRoleId();
  if (!roleId) return false;

  if (member.roles instanceof GuildMemberRoleManager) {
    return member.roles.cache.has(roleId);
  }

  // member.roles is string[] in raw REST interactions
  return (member.roles as string[]).includes(roleId);
}
