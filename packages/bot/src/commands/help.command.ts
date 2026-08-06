import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import type { APIEmbedField, ChatInputCommandInteraction } from 'discord.js';
import type { Command } from './index';
import { isTeacher } from '../utils/permissions';

const STUDENT_COMMANDS: ReadonlyArray<readonly [string, string]> = [
  ['/register', 'Đăng ký tham gia Code Dojo'],
  ['/profile', 'Xem hồ sơ: XP, cấp độ, coins'],
  ['/lesson', 'Xem buổi học tiếp theo'],
  ['/schedule', 'Xem lịch học của khoá đang hoạt động'],
  ['/homework', 'Xem danh sách bài tập'],
  ['/submit', 'Nộp bài tập (số thứ tự lấy từ /homework)'],
  ['/resubmit', 'Nộp lại bài tập cần sửa'],
  ['/checkin', 'Điểm danh buổi học hôm nay'],
  ['/attendance', 'Xem điểm danh của bạn'],
  ['/leaderboard', 'Xem bảng xếp hạng (XP / coins / streak)'],
  ['/ping', 'Kiểm tra bot còn sống không'],
];

const TEACHER_COMMANDS: ReadonlyArray<readonly [string, string]> = [
  ['/course-create', 'Tạo khoá học mới'],
  ['/lesson-add', 'Thêm buổi học vào khoá đang hoạt động'],
  ['/homework-create', 'Tạo bài tập (kèm XP/coins thưởng)'],
  ['/review', 'Xem danh sách chờ chấm hoặc chấm bài nộp'],
  ['/attendance lesson:<n>', 'Xem điểm danh cả lớp theo buổi học'],
  ['/attendance-mark', 'Sửa điểm danh cho học viên'],
];

const ADMIN_COMMANDS: ReadonlyArray<readonly [string, string]> = [
  ['/setup', 'Khởi tạo server: tạo role, kênh và lưu cấu hình'],
];

function formatCommands(rows: ReadonlyArray<readonly [string, string]>): string {
  return rows.map(([cmd, desc]) => `\`${cmd}\` — ${desc}`).join('\n');
}

export const helpCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Hướng dẫn sử dụng bot Code Dojo'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    // Sections are filtered per viewer so students don't see commands they can't run.
    const fields: APIEmbedField[] = [
      { name: '🎓 Học viên', value: formatCommands(STUDENT_COMMANDS), inline: false },
    ];
    if (isTeacher(interaction)) {
      fields.push({ name: '👨‍🏫 Giáo viên', value: formatCommands(TEACHER_COMMANDS), inline: false });
    }
    if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      fields.push({ name: '⚙️ Quản trị viên', value: formatCommands(ADMIN_COMMANDS), inline: false });
    }

    await interaction.reply({
      embeds: [
        {
          title: '📖 Hướng dẫn Code Dojo',
          description:
            'Bắt đầu: `/register` để tạo hồ sơ → `/homework` xem bài tập → `/submit` nộp bài → giáo viên chấm bài là bạn nhận XP và coins. Mỗi buổi học nhớ `/checkin` để điểm danh.',
          color: 0x5865f2,
          fields,
          footer: { text: 'Gõ / trong ô chat để xem mô tả và tham số chi tiết của từng lệnh.' },
        },
      ],
      ephemeral: true,
    });
  },
};
