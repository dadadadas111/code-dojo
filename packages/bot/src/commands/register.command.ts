import { SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { Command } from './index';
import { ApiError, registerStudent } from '../utils/api-client';

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
            footer: { text: 'Dùng /profile để xem hồ sơ của bạn' },
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
