import {
  EmbedBuilder,
  GuildOnboardingMode,
  GuildOnboardingPromptType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import type {
  ChatInputCommandInteraction,
  Guild,
  GuildMember,
  OverwriteResolvable,
  TextChannel,
} from 'discord.js';
import type { Command } from './index';
import { isAdmin } from '../utils/permissions';
import {
  teacherRoleId,
  studentRoleId,
  announceChannelId,
  homeworkChannelId,
  registerChannelId,
  levelupChannelId,
} from '../config/guild-config';
import { ensureRole, ensureTextChannel, CATEGORY_NAME } from './setup.command';
import { welcomeButtons } from '../interactions/welcome';

// Community channels (open chat unless noted). Exported for /uninstall.
export const RULES_CHANNEL_NAME = 'luật-server'; // read-only feed
export const CHAT_CHANNEL_NAME = 'tán-gẫu';
export const QA_CHANNEL_NAME = 'hỏi-đáp';
export const FLEX_CHANNEL_NAME = 'khoe-thành-tích';
export const INTEREST_ROLES: Array<{ name: string; emoji: string; color: number }> = [
  { name: 'Frontend', emoji: '🎨', color: 0xe91e63 },
  { name: 'Backend', emoji: '🛠️', color: 0x607d8b },
  { name: 'Game Dev', emoji: '🎮', color: 0x9c27b0 },
  { name: 'AI', emoji: '🤖', color: 0x00bcd4 },
];

export const RULES_PIN_TITLE = '📜 Chào mừng & Nội quy Code Dojo';

/** The Vietnamese welcome + rules message, pinned in #luật-server. */
function buildRulesEmbeds(): EmbedBuilder[] {
  const intro = new EmbedBuilder()
    .setTitle(RULES_PIN_TITLE)
    .setColor(0x5865f2)
    .setDescription(
      [
        'Chào mừng bạn đến **Code Dojo** — lớp học lập trình gamified: làm bài nhận **XP + coins**, lên cấp nhận role, đua bảng xếp hạng. 🥋',
        '',
        '**Bản đồ kênh:**',
        '🚪 <#REGISTER> — điểm bắt đầu: bấm nút **🎓 Đăng ký** để mở khu học tập',
        '📢 <#ANNOUNCE> — thông báo lớp: lịch học, dời lịch, bài tập, deadline *(chỉ đọc)*',
        '📚 <#HOMEWORK> — bài tập mới đăng ở đây, nộp bài ngay dưới mỗi bài',
        '🎉 <#LEVELUP> — vinh danh lên cấp *(chỉ đọc)*',
        '🤖 `#lệnh-bot-1/2/3` — khu gõ lệnh bot cho học viên (`/profile`, `/schedule`, `/help`…)',
        `💬 \`#${CHAT_CHANNEL_NAME}\` — chuyện trò tự do`,
        `❓ \`#${QA_CHANNEL_NAME}\` — hỏi bài, thảo luận kiến thức`,
        `🏆 \`#${FLEX_CHANNEL_NAME}\` — khoe điểm, khoe dự án, khoe streak`,
      ].join('\n'),
    );

  const rules = new EmbedBuilder()
    .setTitle('📏 Nội quy')
    .setColor(0xed4245)
    .setDescription(
      [
        '**1.** Tôn trọng mọi người — không công kích cá nhân, không toxic, không phân biệt.',
        '**2.** Không spam, không quảng cáo, không gửi link lạ.',
        '**3.** Làm bài **trung thực**: tham khảo thoải mái, chép nguyên bài thì không. Bài LeetCode phải tự tay AC.',
        '**4.** Hỏi bài ở <#QA>, đăng đúng kênh đúng chủ đề.',
        '**5.** Tên hiển thị nghiêm túc, để giáo viên nhận ra bạn.',
        '**6.** Vi phạm: nhắc nhở 1 lần → tái phạm mời rời lớp.',
        '**7.** Cần hỗ trợ? Nhắn giáo viên hoặc admin bất cứ lúc nào.',
        '',
        '*Đồng ý nội quy và sẵn sàng học? Bấm nút bên dưới!* 👇',
      ].join('\n'),
    );

  return [intro, rules];
}

/** Fills channel mentions the embeds can't know at build time. */
function resolveMentions(embeds: EmbedBuilder[], ids: Record<string, string | null>): void {
  for (const embed of embeds) {
    const desc = embed.data.description ?? '';
    embed.setDescription(
      desc
        .replace('<#REGISTER>', ids['register'] ? `<#${ids['register']}>` : '#đăng-ký')
        .replace('<#ANNOUNCE>', ids['announce'] ? `<#${ids['announce']}>` : '#thông-báo')
        .replace('<#HOMEWORK>', ids['homework'] ? `<#${ids['homework']}>` : '#bài-tập')
        .replace('<#LEVELUP>', ids['levelup'] ? `<#${ids['levelup']}>` : '#level-up')
        .replace('<#QA>', ids['qa'] ? `<#${ids['qa']}>` : `#${QA_CHANNEL_NAME}`),
    );
  }
}

async function ensurePinnedRules(
  channel: TextChannel,
  ids: Record<string, string | null>,
): Promise<void> {
  const pins = await channel.messages.fetchPinned();
  const existing = pins.find(
    (msg) => msg.author.id === channel.client.user.id && msg.embeds[0]?.title === RULES_PIN_TITLE,
  );
  if (existing) return;
  const embeds = buildRulesEmbeds();
  resolveMentions(embeds, ids);
  const message = await channel.send({ embeds, components: [welcomeButtons()] });
  await message.pin();
}

function findCategoryId(guild: Guild): string | null {
  const category = guild.channels.cache.find(
    (c) => c.type === 4 && c.name === CATEGORY_NAME, // 4 = GuildCategory
  );
  return category?.id ?? null;
}

export const setupOnboardingCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('setup-onboarding')
    .setDescription(
      '[Admin] Bật màn hình onboarding full-screen của Discord + kênh cộng đồng + nội quy',
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guild = interaction.guild;
    if (!interaction.inGuild() || !guild) {
      await interaction.reply({ content: 'Lệnh này chỉ dùng được trong server.', ephemeral: true });
      return;
    }
    if (!isAdmin(interaction)) {
      await interaction.reply({
        content: 'Chỉ quản trị viên (Administrator) mới dùng được lệnh này.',
        ephemeral: true,
      });
      return;
    }
    if (!studentRoleId() || !teacherRoleId()) {
      await interaction.reply({
        content: 'Chạy `/setup` trước — onboarding cần role Student và các kênh Code Dojo.',
        ephemeral: true,
      });
      return;
    }

    const me: GuildMember = guild.members.me ?? (await guild.members.fetchMe());
    if (!me.permissions.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({
        content:
          'Bot cần thêm quyền **Manage Server** để cấu hình onboarding.\n' +
          'Server Settings → **Roles** → role của bot → bật **Manage Server**, rồi chạy lại lệnh này.',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();

    try {
      await guild.channels.fetch();
      await guild.roles.fetch();
      const categoryId = findCategoryId(guild) ?? '';

      // 1. Community channels. Rules channel is a read-only feed.
      const teacherId = teacherRoleId()!;
      const feedAccess: OverwriteResolvable[] = [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.SendMessages] },
        { id: teacherId, allow: [PermissionFlagsBits.SendMessages] },
        { id: me.id, allow: [PermissionFlagsBits.SendMessages] },
      ];
      const rulesChannel = await ensureTextChannel(
        guild,
        RULES_CHANNEL_NAME,
        categoryId,
        null,
        feedAccess,
      );
      const chat = await ensureTextChannel(guild, CHAT_CHANNEL_NAME, categoryId, null);
      const qa = await ensureTextChannel(guild, QA_CHANNEL_NAME, categoryId, null);
      const flex = await ensureTextChannel(guild, FLEX_CHANNEL_NAME, categoryId, null);

      // 2. Enable Community if missing (needs Administrator; else guide the user).
      let communityNote = '';
      if (!guild.features.includes('COMMUNITY')) {
        if (me.permissions.has(PermissionFlagsBits.Administrator)) {
          await guild.edit({
            features: [...guild.features, 'COMMUNITY'],
            rulesChannel: rulesChannel.entity.id,
            publicUpdatesChannel: announceChannelId() ?? rulesChannel.entity.id,
            verificationLevel: 1,
            explicitContentFilter: 2,
            reason: 'Code Dojo /setup-onboarding',
          });
          communityNote = 'Đã bật **Community mode** cho server.';
        } else {
          await interaction.editReply({
            content:
              'Server chưa bật **Community mode** (điều kiện của onboarding).\n' +
              'Cách 1: Server Settings → **Enable Community** (chọn kênh luật = ' +
              `${rulesChannel.entity.toString()}), rồi chạy lại lệnh này.\n` +
              'Cách 2: cấp **Administrator** cho bot rồi chạy lại — bot tự bật.',
          });
          return;
        }
      }

      // 3. Rules + welcome message, pinned.
      await ensurePinnedRules(rulesChannel.entity, {
        register: registerChannelId(),
        announce: announceChannelId(),
        homework: homeworkChannelId(),
        levelup: levelupChannelId(),
        qa: qa.entity.id,
      });

      // 4. Interest roles for the second onboarding question.
      const interestRoles: string[] = [];
      for (const spec of INTEREST_ROLES) {
        const role = await ensureRole(guild, spec.name, spec.color, null);
        interestRoles.push(role.entity.id);
      }

      // 5. The full-screen onboarding itself. Discord requires >=7 default
      // channels with >=5 sendable by @everyone — the mix below satisfies it.
      const studentChannels = guild.channels.cache
        .filter((c) => /^lệnh-bot-\d$/.test(c.name))
        .map((c) => c.id);
      const openIds = [
        registerChannelId(),
        homeworkChannelId(),
        chat.entity.id,
        qa.entity.id,
        flex.entity.id,
      ].filter((id): id is string => Boolean(id));
      const readOnlyIds = [announceChannelId(), levelupChannelId(), rulesChannel.entity.id].filter(
        (id): id is string => Boolean(id),
      );

      await guild.editOnboarding({
        enabled: true,
        mode: GuildOnboardingMode.OnboardingAdvanced,
        defaultChannels: [...openIds, ...readOnlyIds],
        prompts: [
          {
            id: '0',
            type: GuildOnboardingPromptType.MultipleChoice,
            title: 'Bạn đến Code Dojo để làm gì?',
            singleSelect: true,
            required: true,
            inOnboarding: true,
            options: [
              {
                title: 'Học lập trình nghiêm túc',
                description: 'Nhận role Học viên + mở toàn bộ khu học tập',
                emoji: '🎓',
                roles: [studentRoleId()!],
                channels: studentChannels,
              },
              {
                title: 'Tham quan cho biết',
                description: 'Ngó nghiêng xem lớp học có gì',
                emoji: '👀',
                channels: [chat.entity.id],
              },
            ],
          },
          {
            id: '1',
            type: GuildOnboardingPromptType.MultipleChoice,
            title: 'Bạn quan tâm mảng nào?',
            singleSelect: false,
            required: false,
            inOnboarding: true,
            options: INTEREST_ROLES.map((spec, i) => ({
              title: spec.name,
              emoji: spec.emoji,
              roles: [interestRoles[i]!],
            })),
          },
        ],
      });

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle('✨ Onboarding full-screen đã bật!')
            .setColor(0x57f287)
            .setDescription(
              [
                communityNote,
                `Nội quy đã ghim tại ${rulesChannel.entity.toString()}.`,
                `Kênh mới: ${chat.entity.toString()}, ${qa.entity.toString()}, ${flex.entity.toString()}.`,
                'Người mới join giờ sẽ thấy màn hình câu hỏi: chọn **🎓 Học viên** là có role Student + khu học tập; chọn mảng quan tâm để nhận role Frontend/Backend/Game Dev/AI.',
                '',
                '-# Lưu ý: role Student từ onboarding mở kênh, nhưng hồ sơ học viên (XP/coins) vẫn tạo qua nút 🎓 Đăng ký hoặc `/register`.',
                '-# Tinh chỉnh giao diện thêm: Server Settings → **Onboarding** (Server Guide, ảnh bìa từng câu hỏi...).',
              ]
                .filter(Boolean)
                .join('\n'),
            ),
        ],
      });
    } catch (err) {
      console.error('[Bot] /setup-onboarding failed:', err);
      await interaction.editReply({
        content:
          'Cấu hình onboarding thất bại. Nguyên nhân thường gặp: server chưa đủ điều kiện Community, ' +
          'bot thiếu quyền, hoặc Discord đổi ràng buộc (≥7 kênh mặc định, ≥5 kênh mở). ' +
          `Chi tiết lỗi: ${err instanceof Error ? err.message : 'không rõ'}`,
      });
    }
  },
};
