import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { Command } from './index';
import {
  ApiError,
  getActiveCourse,
  shiftCourseSchedule,
  type ScheduleShiftChange,
} from '../utils/api-client';
import { isTeacher } from '../utils/permissions';
import { announceChannelId } from '../config/guild-config';

const ictFormatter = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

function fmt(date: string): string {
  return ictFormatter.format(new Date(date));
}

function changeLines(changes: ScheduleShiftChange[]): string {
  const lines = changes
    .slice(0, 10)
    .map((c) => `Buổi ${c.order} (${c.topic}): ${fmt(c.from)} → **${fmt(c.to)}**`);
  if (changes.length > 10) lines.push(`… và ${changes.length - 10} buổi sau đó`);
  return lines.join('\n');
}

export const postponeCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('postpone')
    .setDescription('[Giáo viên] Dời lịch: các buổi sắp tới trượt một slot, cả khoá tự map lại')
    .setDefaultMemberPermissions('0')
    .addIntegerOption((opt) =>
      opt
        .setName('lesson')
        .setDescription('Dời từ buổi số mấy (bỏ trống = buổi sắp tới)')
        .setRequired(false)
        .setMinValue(0),
    )
    .addStringOption((opt) =>
      opt
        .setName('direction')
        .setDescription('Hướng dời (mặc định: lùi lại sau)')
        .setRequired(false)
        .addChoices(
          { name: 'Lùi lại sau (postpone)', value: 'later' },
          { name: 'Kéo lên sớm (hoàn tác)', value: 'earlier' },
        ),
    )
    .addStringOption((opt) =>
      opt
        .setName('reason')
        .setDescription('Lý do — sẽ được thông báo trong kênh thông báo')
        .setRequired(false),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!isTeacher(interaction)) {
      await interaction.reply({ content: 'Chỉ giáo viên dùng được lệnh này.', ephemeral: true });
      return;
    }

    const fromOrder = interaction.options.getInteger('lesson') ?? undefined;
    const direction = (interaction.options.getString('direction') ?? 'later') as
      'later' | 'earlier';
    const reason = interaction.options.getString('reason');

    try {
      const course = await getActiveCourse();
      const { changes } = await shiftCourseSchedule(course.id, direction, fromOrder);

      if (changes.length === 0) {
        await interaction.reply({ content: 'Không có buổi nào cần dời.', ephemeral: true });
        return;
      }

      const title = direction === 'later' ? '🔁 Đã dời lịch học' : '⏪ Đã kéo lịch học lên sớm';
      const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(direction === 'later' ? 0xfee75c : 0x57f287)
        .setDescription(changeLines(changes))
        .setFooter({ text: `Khoá: ${course.name}` });
      if (reason) embed.addFields({ name: 'Lý do', value: reason, inline: false });

      await interaction.reply({ embeds: [embed] });

      // Students find out without the teacher writing an announcement.
      const channelId = announceChannelId();
      if (channelId && interaction.guild) {
        try {
          const channel = await interaction.guild.channels.fetch(channelId);
          if (channel?.isTextBased() && channel.id !== interaction.channelId) {
            await channel.send({ embeds: [embed] });
          }
        } catch (err) {
          console.warn('[Bot] /postpone: failed to announce:', err);
        }
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 404) {
          await interaction.reply({
            content:
              'Không có gì để dời — chưa có khoá học đang hoạt động hoặc không còn buổi sắp tới.',
            ephemeral: true,
          });
          return;
        }
        if (err.status === 409) {
          await interaction.reply({
            content: `Không kéo lên sớm được: ${err.message}`,
            ephemeral: true,
          });
          return;
        }
        await interaction.reply({ content: `Lỗi khi dời lịch: ${err.message}`, ephemeral: true });
        return;
      }
      await interaction.reply({
        content: 'Có lỗi xảy ra khi dời lịch. Vui lòng thử lại sau.',
        ephemeral: true,
      });
    }
  },
};
