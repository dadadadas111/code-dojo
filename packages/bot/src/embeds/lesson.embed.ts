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

export function buildLessonEmbed(lesson: Lesson, course?: Course): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`Buổi ${lesson.order}: ${lesson.topic}`)
    .setDescription(lesson.description)
    .setColor(0x5865f2)
    .addFields({ name: 'Thời gian', value: formatICT(lesson.scheduledDate), inline: true });

  if (course) {
    embed.addFields({ name: 'Khoá học', value: course.name, inline: true });
  }

  if (lesson.slideUrl) {
    embed.addFields({ name: 'Slides', value: lesson.slideUrl, inline: false });
  }

  if (lesson.recordingUrl) {
    embed.addFields({ name: 'Recording', value: lesson.recordingUrl, inline: false });
  }

  embed.setFooter({ text: `Lesson ID: ${lesson.id}` });

  return embed;
}
