import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction, Guild } from 'discord.js';
import type { Command } from './index';
import { ApiError, registerStudent } from '../utils/api-client';
import { studentRoleId } from '../config/guild-config';

/**
 * Grants the Student role (unlocks the student bot-command channels).
 * Never throws — a missing role or hierarchy problem must not fail /register.
 */
export async function grantStudentRole(guild: Guild | null, discordId: string): Promise<boolean> {
  const roleId = studentRoleId();
  if (!guild || !roleId) return false;
  try {
    const member = await guild.members.fetch(discordId);
    if (!member.roles.cache.has(roleId)) {
      await member.roles.add(roleId, 'Code Dojo /register');
    }
    return true;
  } catch (err) {
    console.warn(`[Bot] Failed to grant Student role to ${discordId}:`, err);
    return false;
  }
}

export const registerCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('register')
    .setDescription('Đăng ký tham gia Code Dojo')
    .addStringOption((opt) =>
      opt
        .setName('display_name')
        .setDescription('Tên hiển thị (mặc định: tên Discord của bạn)')
        .setRequired(false),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const displayName =
      interaction.options.getString('display_name') ??
      interaction.user.displayName ??
      interaction.user.username;

    try {
      const student = await registerStudent(interaction.user.id, displayName);
      const roleGranted = await grantStudentRole(interaction.guild, interaction.user.id);
      await interaction.reply({
        embeds: [
          {
            title: 'Đăng ký thành công!',
            description: `Chào mừng **${student.displayName}** đến với Code Dojo!`,
            color: 0x57f287,
            fields: [
              { name: 'Cấp độ khởi đầu', value: String(student.level), inline: true },
              { name: 'XP', value: String(student.xp), inline: true },
              { name: 'Coins', value: String(student.coins), inline: true },
            ],
            footer: {
              text: roleGranted
                ? 'Role Student đã được gán — các kênh lệnh bot đã mở cho bạn. Dùng /profile để xem hồ sơ.'
                : 'Dùng /profile để xem hồ sơ của bạn',
            },
          },
        ],
        ephemeral: false,
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        await interaction.reply({ content: 'Bạn đã đăng ký rồi!', ephemeral: true });
        return;
      }
      await interaction.reply({
        content: 'Có lỗi xảy ra khi đăng ký. Vui lòng thử lại sau.',
        ephemeral: true,
      });
    }
  },
};
