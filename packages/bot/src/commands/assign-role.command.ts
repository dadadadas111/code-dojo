import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import type { ChatInputCommandInteraction, Role } from 'discord.js';
import { LEVEL_THRESHOLDS } from '@code-dojo/shared';
import type { Command } from './index';
import { isAdmin } from '../utils/permissions';
import { teacherRoleId, studentRoleId, levelRoleMap } from '../config/guild-config';

const ROLE_CHOICES = [
  { name: 'Teacher', value: 'teacher' },
  { name: 'Student', value: 'student' },
  ...Object.entries(LEVEL_THRESHOLDS).map(([level, { title }]) => ({
    name: `Cấp ${level} — ${title}`,
    value: level,
  })),
];

export const assignRoleCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('assign-role')
    .setDescription('[Admin] Gán hoặc gỡ role Code Dojo cho một thành viên')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((opt) =>
      opt.setName('user').setDescription('Thành viên cần gán/gỡ role').setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName('role')
        .setDescription('Role Code Dojo')
        .setRequired(true)
        .addChoices(...ROLE_CHOICES),
    )
    .addStringOption((opt) =>
      opt
        .setName('action')
        .setDescription('Gán (mặc định) hoặc gỡ role')
        .setRequired(false)
        .addChoices({ name: 'Gán', value: 'add' }, { name: 'Gỡ', value: 'remove' }),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guild = interaction.guild;
    if (!interaction.inGuild() || !guild) {
      await interaction.reply({ content: 'Lệnh này chỉ dùng được trong server.', ephemeral: true });
      return;
    }
    if (!isAdmin(interaction)) {
      await interaction.reply({
        content: 'Chỉ quản trị viên (Administrator) mới dùng được lệnh này.',
        ephemeral: true,
      });
      return;
    }

    const targetUser = interaction.options.getUser('user', true);
    const roleKey = interaction.options.getString('role', true);
    const action = interaction.options.getString('action') ?? 'add';
    const isLevelRole = roleKey !== 'teacher' && roleKey !== 'student';

    const roleId = isLevelRole
      ? (levelRoleMap()[roleKey] ?? null)
      : roleKey === 'teacher'
        ? teacherRoleId()
        : studentRoleId();
    if (!roleId) {
      await interaction.reply({
        content: 'Role này chưa được cấu hình cho server. Chạy /setup trước.',
        ephemeral: true,
      });
      return;
    }

    let role: Role | null;
    try {
      role = await guild.roles.fetch(roleId);
    } catch {
      role = null;
    }
    if (!role) {
      await interaction.reply({
        content: 'Role đã cấu hình không còn tồn tại trong server — chạy /setup lại.',
        ephemeral: true,
      });
      return;
    }

    try {
      const member = await guild.members.fetch(targetUser.id);

      if (action === 'remove') {
        await member.roles.remove(role, `Code Dojo /assign-role bởi ${interaction.user.tag}`);
        await interaction.reply({
          content: `Đã gỡ role ${role.toString()} khỏi ${targetUser.toString()}.`,
          allowedMentions: { parse: [] },
        });
        return;
      }

      // A member holds at most one level role — swap out any others first.
      if (isLevelRole) {
        const otherLevelRoleIds = Object.values(levelRoleMap()).filter(
          (id) => id !== roleId && member.roles.cache.has(id),
        );
        if (otherLevelRoleIds.length > 0) {
          await member.roles.remove(otherLevelRoleIds, 'Code Dojo /assign-role (đổi role cấp độ)');
        }
      }
      await member.roles.add(role, `Code Dojo /assign-role bởi ${interaction.user.tag}`);

      await interaction.reply({
        content:
          `Đã gán role ${role.toString()} cho ${targetUser.toString()}.` +
          (isLevelRole
            ? '\n-# Lưu ý: role cấp độ sẽ được đồng bộ lại theo XP khi học viên lên cấp.'
            : ''),
        allowedMentions: { parse: [] },
      });
    } catch (err) {
      console.warn('[Bot] /assign-role failed:', err);
      await interaction.reply({
        content:
          'Không gán/gỡ được role. Kiểm tra: thành viên còn trong server, bot có quyền **Manage Roles**, và role của bot nằm **trên** role cần gán (Server Settings → Roles).',
        ephemeral: true,
      });
    }
  },
};
