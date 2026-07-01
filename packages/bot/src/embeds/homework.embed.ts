import { EmbedBuilder } from 'discord.js';
import type { Homework, HomeworkType, Submission } from '@code-dojo/shared';

const ictFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh',
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatICT(date: Date | string): string {
  return ictFormatter.format(new Date(date as string));
}

const TYPE_LABELS: Record<HomeworkType, string> = {
  quiz: 'Trắc nghiệm',
  coding: 'Lập trình',
  reading: 'Đọc tài liệu',
  practice: 'Luyện tập',
  challenge: 'Thử thách',
};

export function buildHomeworkListEmbed(
  homeworks: Homework[],
  submittedMap?: Map<string, Submission>,
): EmbedBuilder {
  const embed = new EmbedBuilder().setTitle('Bài tập đang hoạt động').setColor(0x5865f2);

  if (homeworks.length === 0) {
    embed.setDescription('Chưa có bài tập nào.');
    return embed;
  }

  homeworks.forEach((hw, i) => {
    const index = i + 1;
    const submission = submittedMap?.get(hw.id);
    const statusNote = submission ? ` — Đã nộp (${submission.status})` : '';

    embed.addFields({
      name: `#${index} — ${hw.title}`,
      value:
        [
          `Loại: ${TYPE_LABELS[hw.type]}`,
          `Hạn nộp: ${formatICT(hw.deadline)}`,
          `Thưởng: ${hw.xpReward} XP, ${hw.coinReward} coins`,
        ].join('\n') + statusNote,
      inline: false,
    });
  });

  embed.setFooter({ text: 'Dùng /submit với số thứ tự (#) để nộp bài' });

  return embed;
}

export function buildHomeworkDetailEmbed(homework: Homework): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(homework.title)
    .setDescription(homework.description)
    .setColor(0x5865f2)
    .addFields(
      { name: 'Loại', value: TYPE_LABELS[homework.type], inline: true },
      { name: 'Hạn nộp', value: formatICT(homework.deadline), inline: true },
      {
        name: 'Thưởng',
        value: `${homework.xpReward} XP, ${homework.coinReward} coins`,
        inline: true,
      },
      { name: 'Điểm tối đa', value: String(homework.maxScore), inline: true },
    )
    .setFooter({ text: `Homework ID: ${homework.id}` });
}
