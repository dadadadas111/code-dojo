import { EmbedBuilder } from 'discord.js';
import type { Course, Lesson } from '@code-dojo/shared';

const ictFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh',
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatICT(date: Date | string): string {
  return ictFormatter.format(new Date(date as string));
}

export function buildScheduleEmbed(course: Course, lessons: Lesson[]): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`Lịch học: ${course.name}`)
    .setDescription(course.description)
    .setColor(0xfee75c);

  if (lessons.length === 0) {
    embed.addFields({ name: 'Lịch học', value: 'Chưa có buổi học nào được lên lịch.' });
    return embed;
  }

  for (const lesson of lessons) {
    embed.addFields({
      name: `Buổi ${lesson.order}: ${lesson.topic}`,
      value: formatICT(lesson.scheduledDate),
      inline: false,
    });
  }

  embed.setFooter({ text: `Tổng ${lessons.length} buổi · Khoá học ID: ${course.id}` });

  return embed;
}
