import { EmbedBuilder } from 'discord.js';
import type { Attendance, AttendanceStatus, Lesson } from '@code-dojo/shared';

const ictFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh',
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatICT(date: Date | string): string {
  return ictFormatter.format(new Date(date));
}

const STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: '✅ Có mặt',
  late: '⏰ Đi trễ',
  absent: '❌ Vắng',
};

const STATUS_COLORS: Record<AttendanceStatus, number> = {
  present: 0x57f287,
  late: 0xfee75c,
  absent: 0xed4245,
};

export function buildCheckinEmbed(attendance: Attendance): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('Điểm danh thành công')
    .setColor(STATUS_COLORS[attendance.status])
    .addFields({ name: 'Trạng thái', value: STATUS_LABELS[attendance.status], inline: true });

  if (attendance.checkinTime) {
    embed.addFields({
      name: 'Thời gian điểm danh',
      value: formatICT(attendance.checkinTime),
      inline: true,
    });
  }

  embed.setFooter({ text: `Lesson ID: ${attendance.lessonId}` });

  return embed;
}

export function buildMyAttendanceEmbed(
  attendances: Attendance[],
  lessons?: Lesson[],
): EmbedBuilder {
  const embed = new EmbedBuilder().setTitle('Lịch sử điểm danh của bạn').setColor(0x5865f2);

  if (attendances.length === 0) {
    embed.setDescription('Chưa có dữ liệu điểm danh.');
    return embed;
  }

  const lessonById = new Map((lessons ?? []).map((l) => [l.id, l]));

  for (const a of attendances) {
    const lesson = lessonById.get(a.lessonId);
    embed.addFields({
      name: lesson ? `Buổi ${lesson.order}: ${lesson.topic}` : `Lesson ID: ${a.lessonId}`,
      value: [
        STATUS_LABELS[a.status],
        a.checkinTime ? `Điểm danh lúc: ${formatICT(a.checkinTime)}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
      inline: false,
    });
  }

  embed.setFooter({ text: `Tổng ${attendances.length} buổi` });

  return embed;
}

export function buildLessonAttendanceEmbed(
  lesson: Lesson,
  attendances: Attendance[],
  stats: { present: number; late: number; absent: number; total: number },
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`Điểm danh: Buổi ${lesson.order} - ${lesson.topic}`)
    .setColor(0x5865f2)
    .addFields(
      { name: 'Có mặt', value: String(stats.present), inline: true },
      { name: 'Đi trễ', value: String(stats.late), inline: true },
      { name: 'Vắng', value: String(stats.absent), inline: true },
      { name: 'Tổng', value: String(stats.total), inline: true },
    );

  if (attendances.length === 0) {
    embed.addFields({ name: 'Danh sách', value: 'Chưa có dữ liệu điểm danh.' });
    return embed;
  }

  for (const a of attendances) {
    embed.addFields({
      name: `${STATUS_LABELS[a.status]} — Student ID: ${a.studentId}`,
      value: a.checkinTime ? `Điểm danh lúc: ${formatICT(a.checkinTime)}` : 'Chưa điểm danh',
      inline: false,
    });
  }

  embed.setFooter({ text: `Lesson ID: ${lesson.id}` });

  return embed;
}
