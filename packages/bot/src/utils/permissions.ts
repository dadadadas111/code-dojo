import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
} from 'discord.js';
import { GuildMemberRoleManager, PermissionFlagsBits } from 'discord.js';
import { teacherRoleId } from '../config/guild-config';

/** Any interaction shape we gate on roles/permissions — slash, component, or modal. */
export type MemberInteraction =
  | ChatInputCommandInteraction
  | ButtonInteraction
  | StringSelectMenuInteraction
  | ModalSubmitInteraction;

export function isTeacher(interaction: MemberInteraction): boolean {
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

export function isAdmin(interaction: MemberInteraction): boolean {
  if (!interaction.inGuild()) return false;
  return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
}
