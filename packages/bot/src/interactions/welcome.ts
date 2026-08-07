import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import type {
  APIEmbed,
  ButtonInteraction,
  GuildMember,
  ModalSubmitInteraction,
  TextChannel,
} from 'discord.js';
import { ApiError, registerStudent } from '../utils/api-client';
import { grantStudentRole } from '../commands/register.command';
import { componentId, type ComponentHandler } from './ids';

/**
 * Onboarding UI: newcomers get greeted in #đăng-ký with a register button —
 * no slash-command knowledge needed. The same button lives on a standing
 * pinned message posted by /setup.
 */

export const WELCOME_PIN_TITLE = '🥋 Chào mừng đến Code Dojo!';

export function welcomeButtons(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(componentId('welcome', 'register'))
      .setLabel('🎓 Đăng ký học viên')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(componentId('welcome', 'help'))
      .setLabel('❓ Mình làm gì ở đây?')
      .setStyle(ButtonStyle.Secondary),
  );
}

/** The standing pinned message in #đăng-ký (posted once by /setup). */
export function buildStandingWelcome(): {
  embeds: APIEmbed[];
  components: ActionRowBuilder<ButtonBuilder>[];
} {
  return {
    embeds: [
      {
        title: WELCOME_PIN_TITLE,
        color: 0x57f287,
        description: [
          'Đây là lớp học lập trình gamified: làm bài tập nhận **XP + coins**, lên cấp, leo bảng xếp hạng.',
          '',
          'Bấm nút bên dưới để đăng ký — sau đó các kênh học tập sẽ mở ra cho bạn.',
        ].join('\n'),
      },
    ],
    components: [welcomeButtons()],
  };
}

/** Per-newcomer greeting posted on guildMemberAdd. */
export async function greetNewMember(member: GuildMember, channel: TextChannel): Promise<void> {
  await channel.send({
    content: `Chào ${member.toString()}! 👋`,
    embeds: [
      {
        color: 0x5865f2,
        description:
          'Chào mừng bạn đến **Code Dojo**! Bấm **🎓 Đăng ký học viên** để tạo hồ sơ và mở các kênh học tập.',
      },
    ],
    components: [welcomeButtons()],
  });
}

export const welcomeComponents: ComponentHandler = {
  async handleButton(interaction: ButtonInteraction, args: string[]): Promise<void> {
    if (args[0] === 'help') {
      await interaction.reply({
        ephemeral: true,
        embeds: [
          {
            title: '📖 Code Dojo hoạt động thế nào?',
            color: 0x5865f2,
            description: [
              '1. **Đăng ký** bằng nút 🎓 (hoặc lệnh `/register`).',
              '2. Xem lịch học ở `/schedule`, buổi kế tiếp ở `/lesson`.',
              '3. Làm bài trong kênh **#bài-tập** — chọn bài từ menu để nộp.',
              '4. Điểm danh mỗi buổi học bằng `/checkin`.',
              '5. Nhận **XP + coins** khi bài được chấm, lên cấp là có role mới + vinh danh ở **#level-up**.',
              '',
              'Gõ `/help` bất cứ lúc nào để xem đầy đủ lệnh.',
            ].join('\n'),
          },
        ],
      });
      return;
    }

    if (args[0] !== 'register') return;
    // Show the name form right away — no awaits allowed before showModal.
    const modal = new ModalBuilder()
      .setCustomId(componentId('welcome', 'modal'))
      .setTitle('Đăng ký học viên')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('display_name')
            .setLabel('Tên hiển thị (bỏ trống = tên Discord)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false),
        ),
      );
    await interaction.showModal(modal);
  },

  async handleModal(interaction: ModalSubmitInteraction, args: string[]): Promise<void> {
    if (args[0] !== 'modal') return;
    const displayName =
      interaction.fields.getTextInputValue('display_name').trim() ||
      interaction.user.displayName ||
      interaction.user.username;

    try {
      const student = await registerStudent(interaction.user.id, displayName);
      const roleGranted = await grantStudentRole(interaction.guild, interaction.user.id);
      await interaction.reply({
        ephemeral: true,
        embeds: [
          {
            title: '🎉 Đăng ký thành công!',
            color: 0x57f287,
            description: [
              `Chào mừng **${student.displayName}**! Bạn bắt đầu ở cấp ${student.level}.`,
              roleGranted ? 'Role **Student** đã được gán — các kênh học tập đã mở cho bạn.' : '',
              'Thử ngay: `/profile` để xem hồ sơ, `/schedule` để xem lịch học.',
            ]
              .filter(Boolean)
              .join('\n'),
          },
        ],
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Already registered — still make sure the role is on (e.g. rejoined member).
        await grantStudentRole(interaction.guild, interaction.user.id);
        await interaction.reply({
          content:
            'Bạn đã đăng ký từ trước rồi — role Student đã được kiểm tra lại. Dùng `/profile` để xem hồ sơ.',
          ephemeral: true,
        });
        return;
      }
      await interaction.reply({
        content: 'Có lỗi xảy ra khi đăng ký. Vui lòng thử lại sau hoặc dùng lệnh `/register`.',
        ephemeral: true,
      });
    }
  },
};
