import { EmbedBuilder } from 'discord.js';
import type { Course, Lesson } from '@code-dojo/shared';
import { scheduleLabel } from '../utils/schedule';

const ictFormatter = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

function formatICT(date: Date | string): string {
  return ictFormatter.format(new Date(date as string));
}

export function buildScheduleEmbed(course: Course, lessons: Lesson[]): EmbedBuilder {
  const rhythm = course.schedule
    ? `\n📅 Nhịp dạy: **${scheduleLabel(course.schedule)}**`
    : '\n📅 Chưa đặt nhịp dạy cố định — giáo viên dùng `/schedule-set`.';

  const embed = new EmbedBuilder()
    .setTitle(`Lịch học: ${course.name}`)
    .setDescription(course.description + rhythm)
    .setColor(0xfee75c);

  if (lessons.length === 0) {
    embed.addFields({ name: 'Lịch học', value: 'Chưa có buổi học nào được lên lịch.' });
    return embed;
  }

  const now = Date.now();
  const next = lessons
    .filter((l) => new Date(l.scheduledDate as unknown as string).getTime() >= now)
    .sort(
      (a, b) =>
        new Date(a.scheduledDate as unknown as string).getTime() -
        new Date(b.scheduledDate as unknown as string).getTime(),
    )[0];

  for (const lesson of lessons) {
    const badges = [
      lesson.id === next?.id ? '⬅️ kế tiếp' : '',
      lesson.postponedCount > 0 ? '🔁' : '',
    ]
      .filter(Boolean)
      .join(' ');
    embed.addFields({
      name: `Buổi ${lesson.order}: ${lesson.topic}${badges ? ` ${badges}` : ''}`,
      value: formatICT(lesson.scheduledDate),
      inline: false,
    });
  }

  embed.setFooter({ text: `Tổng ${lessons.length} buổi · Khoá học ID: ${course.id}` });

  return embed;
}
