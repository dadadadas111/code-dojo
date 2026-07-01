import { EmbedBuilder } from 'discord.js';
import type { Homework, Submission, SubmissionStatus } from '@code-dojo/shared';

const ictFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh',
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatICT(date: Date | string): string {
  return ictFormatter.format(new Date(date as string));
}

const STATUS_LABELS: Record<SubmissionStatus, string> = {
  pending: '⏳ Chờ chấm',
  grading: '🔍 Đang chấm',
  accepted: '✅ Đạt',
  revision: '✏️ Cần sửa',
  late: '⏰ Nộp trễ',
};

const STATUS_COLORS: Record<SubmissionStatus, number> = {
  pending: 0xfee75c,
  grading: 0x5865f2,
  accepted: 0x57f287,
  revision: 0xed4245,
  late: 0xed4245,
};

export function buildSubmissionEmbed(submission: Submission, homework?: Homework): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(homework ? `Bài nộp: ${homework.title}` : 'Bài nộp')
    .setColor(STATUS_COLORS[submission.status])
    .addFields(
      { name: 'Trạng thái', value: STATUS_LABELS[submission.status], inline: true },
      { name: 'Nộp lúc', value: formatICT(submission.submittedAt), inline: true },
    );

  if (submission.githubLink) {
    embed.addFields({ name: 'GitHub', value: submission.githubLink, inline: false });
  }

  if (submission.content) {
    embed.addFields({ name: 'Nội dung', value: submission.content, inline: false });
  }

  if (submission.score !== null) {
    embed.addFields({ name: 'Điểm', value: String(submission.score), inline: true });
  }

  if (submission.feedback) {
    embed.addFields({ name: 'Nhận xét', value: submission.feedback, inline: false });
  }

  embed.setFooter({ text: `Submission ID: ${submission.id}` });

  return embed;
}

export function buildPendingListEmbed(submissions: Submission[]): EmbedBuilder {
  const embed = new EmbedBuilder().setTitle('Bài nộp chờ chấm').setColor(0xfee75c);

  if (submissions.length === 0) {
    embed.setDescription('Không có bài nộp nào đang chờ chấm.');
    return embed;
  }

  for (const s of submissions) {
    embed.addFields({
      name: `${STATUS_LABELS[s.status]} — ${s.id}`,
      value: [
        `Homework ID: ${s.homeworkId}`,
        `Student ID: ${s.studentId}`,
        `Nộp lúc: ${formatICT(s.submittedAt)}`,
      ].join('\n'),
      inline: false,
    });
  }

  embed.setFooter({ text: 'Dùng /review submission_id:<id> status:<...> để chấm bài' });

  return embed;
}
