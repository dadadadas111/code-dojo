import { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder } from 'discord.js';
import type { APIEmbed, ButtonInteraction, ChatInputCommandInteraction } from 'discord.js';
import type { Command } from './index';
import { componentId, type ComponentHandler } from '../interactions/ids';
import { isAdmin, isTeacher, type MemberInteraction } from '../utils/permissions';

type SectionKey = 'student' | 'teacher' | 'admin';

interface Section {
  label: string;
  title: string;
  description: string;
  commands: ReadonlyArray<readonly [string, string]>;
}

const SECTIONS: Record<SectionKey, Section> = {
  student: {
    label: '🎓 Học viên',
    title: '📖 Lệnh dành cho học viên',
    description:
      'Bắt đầu: `/register` để tạo hồ sơ → `/homework` xem bài tập → nộp bài (chọn từ menu hoặc `/submit`) → giáo viên chấm bài là bạn nhận XP và coins. Mỗi buổi học nhớ `/checkin` để điểm danh.',
    commands: [
      ['/register', 'Đăng ký tham gia Code Dojo'],
      ['/profile', 'Xem hồ sơ: XP, cấp độ, coins'],
      ['/lesson', 'Xem buổi học tiếp theo'],
      ['/schedule', 'Xem lịch học của khoá đang hoạt động'],
      ['/homework', 'Xem bài tập — chọn từ menu để nộp ngay'],
      ['/submit', 'Nộp bài tập (số thứ tự lấy từ /homework)'],
      ['/resubmit', 'Nộp lại bài tập cần sửa'],
      ['/checkin', 'Điểm danh buổi học hôm nay'],
      ['/attendance', 'Xem điểm danh của bạn'],
      ['/leaderboard', 'Xem bảng xếp hạng (XP / coins / streak)'],
      ['/ping', 'Kiểm tra bot còn sống không'],
    ],
  },
  teacher: {
    label: '👨‍🏫 Giáo viên',
    title: '📖 Lệnh dành cho giáo viên',
    description:
      'Quy trình dạy: `/course-create` → `/schedule-set` đặt nhịp dạy → `/lesson-add` (tự xếp lịch) → `/homework-create` bài tập → `/review` chấm bài (chọn từ menu, bấm nút để chấm).',
    commands: [
      ['/course-create', 'Tạo khoá học mới'],
      ['/schedule-set', 'Đặt nhịp dạy cố định (vd T7 08:00 + T2 20:00)'],
      ['/lesson-add', 'Thêm buổi học — tự xếp vào slot dạy kế tiếp'],
      ['/postpone', 'Dời lịch một slot, cả khoá tự map lại + tự thông báo'],
      ['/homework-create', 'Tạo bài tập (kèm XP/coins thưởng)'],
      ['/review', 'Danh sách chờ chấm — chọn bài và bấm nút để chấm'],
      ['/attendance lesson:<n>', 'Xem điểm danh cả lớp theo buổi học'],
      ['/attendance-mark', 'Sửa điểm danh cho học viên'],
    ],
  },
  admin: {
    label: '⚙️ Quản trị',
    title: '📖 Lệnh dành cho quản trị viên',
    description:
      'Lệnh một-lần và quản lý server. Chỉ tài khoản có quyền Administrator thấy mục này.',
    commands: [
      ['/setup', 'Khởi tạo server: tạo role, kênh và lưu cấu hình'],
      ['/assign-role', 'Gán / gỡ role Code Dojo (Teacher, role cấp độ) cho thành viên'],
      ['/uninstall', 'Gỡ cài đặt: xoá role, kênh và cấu hình do /setup tạo'],
      ['/reset', 'Xoá TOÀN BỘ dữ liệu lớp học (dev/test)'],
    ],
  },
};

function availableSections(interaction: MemberInteraction): SectionKey[] {
  const sections: SectionKey[] = ['student'];
  if (isTeacher(interaction)) sections.push('teacher');
  if (isAdmin(interaction)) sections.push('admin');
  return sections;
}

/** Teachers land on the teaching commands; admins without the Teacher role on admin; everyone else on student. */
function defaultSection(available: SectionKey[]): SectionKey {
  if (available.includes('teacher')) return 'teacher';
  if (available.includes('admin')) return 'admin';
  return 'student';
}

interface HelpView {
  embeds: APIEmbed[];
  components: ActionRowBuilder<ButtonBuilder>[];
}

function buildHelpView(current: SectionKey, available: SectionKey[]): HelpView {
  const section = SECTIONS[current];
  const embed: APIEmbed = {
    title: section.title,
    description: section.description,
    color: 0x5865f2,
    fields: [
      {
        name: 'Lệnh',
        value: section.commands.map(([cmd, desc]) => `\`${cmd}\` — ${desc}`).join('\n'),
        inline: false,
      },
    ],
    footer: { text: 'Gõ / trong ô chat để xem mô tả và tham số chi tiết của từng lệnh.' },
  };

  const components =
    available.length > 1
      ? [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            available.map((key) =>
              new ButtonBuilder()
                .setCustomId(componentId('help', key))
                .setLabel(SECTIONS[key].label)
                .setStyle(key === current ? ButtonStyle.Primary : ButtonStyle.Secondary)
                .setDisabled(key === current),
            ),
          ),
        ]
      : [];

  return { embeds: [embed], components };
}

export const helpCommand: Command = {
  data: new SlashCommandBuilder().setName('help').setDescription('Hướng dẫn sử dụng bot Code Dojo'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const available = availableSections(interaction);
    const view = buildHelpView(defaultSection(available), available);
    await interaction.reply({ ...view, ephemeral: true });
  },
};

export const helpComponents: ComponentHandler = {
  async handleButton(interaction: ButtonInteraction, args: string[]): Promise<void> {
    const requested = args[0] as SectionKey | undefined;
    // Re-derive permissions on every click instead of trusting the button set.
    const available = availableSections(interaction);
    const section = requested && available.includes(requested) ? requested : 'student';
    await interaction.update(buildHelpView(section, available));
  },
};
