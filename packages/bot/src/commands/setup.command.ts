import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import type {
  CategoryChannel,
  ChatInputCommandInteraction,
  Guild,
  GuildMember,
  OverwriteResolvable,
  Role,
  TextChannel,
  VoiceChannel,
} from 'discord.js';
import { LEVEL_THRESHOLDS } from '@code-dojo/shared';
import type { Command } from './index';
import { ApiError, saveGuildConfig } from '../utils/api-client';
import {
  setGuildConfig,
  teacherRoleId,
  studentRoleId,
  levelRoleMap,
  levelupChannelId,
  announceChannelId,
  homeworkChannelId,
  registerChannelId,
} from '../config/guild-config';
import { buildStandingWelcome, WELCOME_PIN_TITLE } from '../interactions/welcome';

// Exported so /uninstall can find and remove the same artifacts by name.
export const TEACHER_ROLE_NAME = 'Teacher';
export const STUDENT_ROLE_NAME = 'Student';
// Type-based category taxonomy: a category names WHAT KIND of channel lives in it.
export const CATEGORY_ANNOUNCE = '📢 Thông Báo';
export const CATEGORY_STUDY = '📚 Học Tập';
export const CATEGORY_CHAT = '💬 Trò Chuyện';
export const CATEGORY_VOICE = '🔊 Voice';
export const CATEGORY_TEACHER = '🧑‍🏫 Giáo Viên';
// Older layouts (single "Code Dojo", journey-based v2) — emptied + deleted on
// /setup re-runs, and swept by /uninstall.
export const LEGACY_CATEGORY_NAMES = ['Code Dojo', '👋 Bắt Đầu', '💬 Cộng Đồng'];
export const CATEGORY_NAMES = [
  CATEGORY_ANNOUNCE,
  CATEGORY_STUDY,
  CATEGORY_CHAT,
  CATEGORY_VOICE,
  CATEGORY_TEACHER,
  ...LEGACY_CATEGORY_NAMES,
];
export const LEVELUP_CHANNEL_NAME = 'level-up';
export const ANNOUNCE_CHANNEL_NAME = 'thông-báo';
export const HOMEWORK_CHANNEL_NAME = 'bài-tập';
export const EXTRA_CHANNEL_NAMES = [ANNOUNCE_CHANNEL_NAME, HOMEWORK_CHANNEL_NAME];
// Bot-command channels: register is open to everyone; the numbered ones are
// student+teacher only; the gv one is teacher only. Admins see all (Discord
// Administrator bypasses channel overwrites).
export const REGISTER_CHANNEL_NAME = 'đăng-ký';
export const RESOURCE_CHANNEL_NAME = 'chia-sẻ-tài-nguyên';
export const STUDENT_BOT_CHANNEL_NAMES = ['lệnh-bot-1', 'lệnh-bot-2', 'lệnh-bot-3'];
export const TEACHER_BOT_CHANNEL_NAME = 'gv-lệnh-bot';
export const VOICE_CHANNEL_NAMES = ['🎙️ Lớp Học', '🎙️ Tự Học', '🎙️ Chill'];

const TEACHER_ROLE_COLOR = 0xed4245;
const STUDENT_ROLE_COLOR = 0x1abc9c;
const LEVEL_ROLE_COLORS: Record<number, number> = {
  1: 0x95a5a6, // Beginner — gray
  2: 0x2ecc71, // Coder — green
  3: 0x3498db, // Programmer — blue
  4: 0x9b59b6, // Developer — purple
  5: 0xe67e22, // Master — orange
  6: 0xf1c40f, // Legend — gold
};

export interface Ensured<T> {
  entity: T;
  created: boolean;
}

function describe<T extends { toString(): string }>(item: Ensured<T>): string {
  return `${item.entity.toString()} ${item.created ? '(mới tạo)' : '(đã có)'}`;
}

/** Reuses the configured/like-named role if present, otherwise creates it. */
export async function ensureRole(
  guild: Guild,
  name: string,
  color: number,
  preferredId: string | null,
): Promise<Ensured<Role>> {
  if (preferredId) {
    const existing = guild.roles.cache.get(preferredId);
    if (existing) return { entity: existing, created: false };
  }
  const byName = guild.roles.cache.find((role) => role.name === name);
  if (byName) return { entity: byName, created: false };

  const role = await guild.roles.create({ name, color, reason: 'Code Dojo /setup' });
  return { entity: role, created: true };
}

async function ensureCategory(
  guild: Guild,
  name: string,
  overwrites?: OverwriteResolvable[],
): Promise<Ensured<CategoryChannel>> {
  const existing = guild.channels.cache.find(
    (channel) => channel.type === ChannelType.GuildCategory && channel.name === name,
  ) as CategoryChannel | undefined;
  if (existing) {
    if (overwrites) await existing.permissionOverwrites.set(overwrites, 'Code Dojo /setup');
    return { entity: existing, created: false };
  }

  const category = await guild.channels.create({
    name,
    type: ChannelType.GuildCategory,
    reason: 'Code Dojo /setup',
    ...(overwrites ? { permissionOverwrites: overwrites } : {}),
  });
  return { entity: category, created: true };
}

export interface CategoryIds {
  announce: string;
  study: string;
  chat: string;
  voice: string;
  teacher: string;
}

/**
 * The professional 4-category layout. Idempotent: creates what's missing,
 * re-applies the teacher category's gating, and best-effort orders them.
 */
export async function ensureCategories(
  guild: Guild,
  teacherId: string,
  botId: string,
): Promise<CategoryIds> {
  const teacherOnly: OverwriteResolvable[] = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: teacherId, allow: [PermissionFlagsBits.ViewChannel] },
    { id: botId, allow: [PermissionFlagsBits.ViewChannel] },
  ];
  // Announce category is read-only at category level: any channel dropped in
  // becomes a feed by default (channels re-apply their own overwrites anyway).
  const announceOnly: OverwriteResolvable[] = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.SendMessages] },
    { id: teacherId, allow: [PermissionFlagsBits.SendMessages] },
    { id: botId, allow: [PermissionFlagsBits.SendMessages] },
  ];
  const announce = await ensureCategory(guild, CATEGORY_ANNOUNCE, announceOnly);
  const study = await ensureCategory(guild, CATEGORY_STUDY);
  const chat = await ensureCategory(guild, CATEGORY_CHAT);
  const voice = await ensureCategory(guild, CATEGORY_VOICE);
  const teacher = await ensureCategory(guild, CATEGORY_TEACHER, teacherOnly);

  const order = [announce, study, chat, voice, teacher];
  for (let i = 0; i < order.length; i++) {
    try {
      await order[i]!.entity.setPosition(i);
    } catch {
      // Position is cosmetic — never fail setup over it.
    }
  }
  return {
    announce: announce.entity.id,
    study: study.entity.id,
    chat: chat.entity.id,
    voice: voice.entity.id,
    teacher: teacher.entity.id,
  };
}

/** Voice room: find by name (any category) or create in the voice category. */
export async function ensureVoiceChannel(
  guild: Guild,
  name: string,
  parentId: string,
): Promise<Ensured<VoiceChannel>> {
  const existing = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildVoice && c.name === name,
  ) as VoiceChannel | undefined;
  if (existing) {
    if (existing.parentId !== parentId) {
      await existing.setParent(parentId, { lockPermissions: false });
    }
    return { entity: existing, created: false };
  }
  const channel = await guild.channels.create({
    name,
    type: ChannelType.GuildVoice,
    parent: parentId,
    reason: 'Code Dojo /setup',
  });
  return { entity: channel, created: true };
}

/** Best-effort intra-category ordering; Discord treats position loosely. */
export async function orderChannels(guild: Guild, ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i++) {
    const channel = guild.channels.cache.get(ids[i]!);
    if (!channel || channel.type === ChannelType.GuildCategory) continue;
    try {
      await (channel as TextChannel).setPosition(i);
    } catch {
      // cosmetic only
    }
  }
}

/** Deletes emptied categories from older layouts. Returns how many were removed. */
export async function cleanupLegacyCategory(guild: Guild): Promise<number> {
  let removed = 0;
  for (const name of LEGACY_CATEGORY_NAMES) {
    const legacy = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildCategory && c.name === name,
    ) as CategoryChannel | undefined;
    if (!legacy) continue;
    const hasChildren = guild.channels.cache.some((c) => c.parentId === legacy.id);
    if (hasChildren) continue;
    try {
      await legacy.delete('Code Dojo /setup — migrated to type-based layout');
      removed++;
    } catch {
      // leave it; /uninstall will sweep
    }
  }
  return removed;
}

/**
 * Reuses the configured/like-named text channel anywhere in the guild,
 * otherwise creates it under the category. When `overwrites` is given, it is
 * (re)applied even on reuse so re-running /setup converges on the intended
 * permission layout.
 */
export async function ensureTextChannel(
  guild: Guild,
  name: string,
  parentId: string,
  preferredId: string | null,
  overwrites?: OverwriteResolvable[],
): Promise<Ensured<TextChannel>> {
  let existing: TextChannel | undefined;
  if (preferredId) {
    const byId = guild.channels.cache.get(preferredId);
    if (byId && byId.type === ChannelType.GuildText) existing = byId as TextChannel;
  }
  existing ??= guild.channels.cache.find(
    (channel) => channel.type === ChannelType.GuildText && channel.name === name,
  ) as TextChannel | undefined;

  if (existing) {
    if (overwrites) {
      await existing.permissionOverwrites.set(overwrites, 'Code Dojo /setup');
    }
    // Migrate to the intended category (keep the channel's own permission overwrites).
    if (parentId && existing.parentId !== parentId) {
      await existing.setParent(parentId, { lockPermissions: false });
    }
    return { entity: existing, created: false };
  }

  const channel = await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: parentId,
    reason: 'Code Dojo /setup',
    ...(overwrites ? { permissionOverwrites: overwrites } : {}),
  });
  return { entity: channel, created: true };
}

/** Posts + pins the standing welcome message in #đăng-ký; skips if already pinned. */
async function ensureStandingWelcome(channel: TextChannel): Promise<void> {
  try {
    const pins = await channel.messages.fetchPinned();
    const existing = pins.find(
      (msg) =>
        msg.author.id === channel.client.user.id && msg.embeds[0]?.title === WELCOME_PIN_TITLE,
    );
    if (existing) return;
    const message = await channel.send(buildStandingWelcome());
    await message.pin();
  } catch (err) {
    console.warn('[Bot] Failed to pin standing welcome:', err);
  }
}

export const setupCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Khởi tạo server Code Dojo: tạo role, kênh và lưu cấu hình (chỉ admin)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guild = interaction.guild;
    if (!interaction.inGuild() || !guild) {
      await interaction.reply({ content: 'Lệnh này chỉ dùng được trong server.', ephemeral: true });
      return;
    }

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({
        content: 'Chỉ quản trị viên (Administrator) mới dùng được lệnh /setup.',
        ephemeral: true,
      });
      return;
    }

    const me: GuildMember | null = guild.members.me ?? (await guild.members.fetchMe());
    const missingPerms: string[] = [];
    if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) missingPerms.push('Manage Roles');
    if (!me.permissions.has(PermissionFlagsBits.ManageChannels)) {
      missingPerms.push('Manage Channels');
    }
    if (missingPerms.length > 0) {
      await interaction.reply({
        content:
          `Bot thiếu quyền: **${missingPerms.join(', ')}**. ` +
          'Hãy cấp quyền cho role của bot (hoặc mời lại bot với đủ quyền) rồi chạy /setup lần nữa.',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();

    try {
      // Fill caches so the ensure* helpers can reuse existing roles/channels.
      await guild.roles.fetch();
      await guild.channels.fetch();

      const teacher = await ensureRole(
        guild,
        TEACHER_ROLE_NAME,
        TEACHER_ROLE_COLOR,
        teacherRoleId(),
      );
      const student = await ensureRole(
        guild,
        STUDENT_ROLE_NAME,
        STUDENT_ROLE_COLOR,
        studentRoleId(),
      );

      const existingLevelMap = levelRoleMap();
      const levelRoles: Array<{ level: number; title: string; result: Ensured<Role> }> = [];
      for (const [levelStr, { title }] of Object.entries(LEVEL_THRESHOLDS)) {
        const level = Number(levelStr);
        const result = await ensureRole(
          guild,
          title,
          LEVEL_ROLE_COLORS[level] ?? 0x95a5a6,
          existingLevelMap[levelStr] ?? null,
        );
        levelRoles.push({ level, title, result });
      }

      const cats = await ensureCategories(guild, teacher.entity.id, me.id);

      // Feed channels: everyone reads, only Teacher + bot post.
      const feedAccess: OverwriteResolvable[] = [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.SendMessages] },
        { id: teacher.entity.id, allow: [PermissionFlagsBits.SendMessages] },
        { id: me.id, allow: [PermissionFlagsBits.SendMessages] },
      ];
      const levelupChannel = await ensureTextChannel(
        guild,
        LEVELUP_CHANNEL_NAME,
        cats.announce,
        levelupChannelId(),
        feedAccess,
      );
      const announceChannel = await ensureTextChannel(
        guild,
        ANNOUNCE_CHANNEL_NAME,
        cats.announce,
        announceChannelId(),
        feedAccess,
      );
      // #bài-tập stays chatty — bot posts homework, students discuss under it.
      const homeworkChannel = await ensureTextChannel(
        guild,
        HOMEWORK_CHANNEL_NAME,
        cats.study,
        homeworkChannelId(),
      );
      // Open study channel for sharing links/docs (also counts toward Discord's
      // onboarding "5 sendable channels" constraint).
      const resourceChannel = await ensureTextChannel(
        guild,
        RESOURCE_CHANNEL_NAME,
        cats.study,
        null,
      );

      // Bot-command channels with permission overwrites. Admins bypass all of
      // these via the Administrator permission — no explicit grant needed.
      const commandAllow = [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.UseApplicationCommands,
      ];
      const studentAccess: OverwriteResolvable[] = [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: student.entity.id, allow: commandAllow },
        { id: teacher.entity.id, allow: commandAllow },
        { id: me.id, allow: commandAllow },
      ];
      const teacherAccess: OverwriteResolvable[] = [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: teacher.entity.id, allow: commandAllow },
        { id: me.id, allow: commandAllow },
      ];

      // Read-only: the bot greets and the pinned button does the work — no chat noise.
      const registerChannel = await ensureTextChannel(
        guild,
        REGISTER_CHANNEL_NAME,
        cats.announce,
        registerChannelId(),
        feedAccess,
      );
      await ensureStandingWelcome(registerChannel.entity);
      const studentBotChannels: Array<Ensured<TextChannel>> = [];
      for (const name of STUDENT_BOT_CHANNEL_NAMES) {
        studentBotChannels.push(
          await ensureTextChannel(guild, name, cats.study, null, studentAccess),
        );
      }
      const teacherBotChannel = await ensureTextChannel(
        guild,
        TEACHER_BOT_CHANNEL_NAME,
        cats.teacher,
        null,
        teacherAccess,
      );

      const voiceChannels: Array<Ensured<VoiceChannel>> = [];
      for (const name of VOICE_CHANNEL_NAMES) {
        voiceChannels.push(await ensureVoiceChannel(guild, name, cats.voice));
      }

      // Sensible in-category order (best-effort).
      await orderChannels(guild, [
        registerChannel.entity.id,
        announceChannel.entity.id,
        levelupChannel.entity.id,
      ]);
      await orderChannels(guild, [
        homeworkChannel.entity.id,
        resourceChannel.entity.id,
        ...studentBotChannels.map((c) => c.entity.id),
      ]);

      // Older layouts: everything has been re-homed above; drop emptied categories.
      const legacyRemoved = await cleanupLegacyCategory(guild);

      const savedConfig = await saveGuildConfig(guild.id, {
        teacherRoleId: teacher.entity.id,
        studentRoleId: student.entity.id,
        levelRoleIds: Object.fromEntries(
          levelRoles.map(({ level, result }) => [String(level), result.entity.id]),
        ),
        levelupChannelId: levelupChannel.entity.id,
        announceChannelId: announceChannel.entity.id,
        homeworkChannelId: homeworkChannel.entity.id,
        registerChannelId: registerChannel.entity.id,
      });
      // Apply immediately — no restart needed.
      setGuildConfig(savedConfig);

      const warnings: string[] = [];
      // The bot assigns these roles itself (level-ups, /register) — hierarchy matters.
      const assignedByBot = [
        ...levelRoles.map(({ title, result }) => ({ title, role: result.entity })),
        { title: STUDENT_ROLE_NAME, role: student.entity },
      ];
      const unassignable = assignedByBot.filter(
        ({ role }) => me.roles.highest.comparePositionTo(role) <= 0,
      );
      if (unassignable.length > 0) {
        warnings.push(
          'Role của bot đang nằm **dưới** các role ' +
            `(${unassignable.map(({ title }) => title).join(', ')}). ` +
            'Vào Server Settings → Roles và kéo role của bot lên trên các role này, nếu không bot sẽ không tự gán được role (khi /register và khi lên cấp).',
        );
      }
      warnings.push(
        `Nhớ tự gán role ${teacher.entity.toString()} cho giáo viên (bot không tự biết ai là giáo viên).`,
      );

      await interaction.editReply({
        embeds: [
          {
            title: '⚙️ Thiết lập Code Dojo hoàn tất!',
            color: 0x57f287,
            fields: [
              { name: 'Role giáo viên', value: describe(teacher), inline: false },
              {
                name: 'Role học viên',
                value: `${describe(student)} — tự gán khi \`/register\``,
                inline: false,
              },
              {
                name: 'Role cấp độ',
                value: levelRoles
                  .map(({ level, result }) => `Cấp ${level}: ${describe(result)}`)
                  .join('\n'),
                inline: false,
              },
              {
                name: 'Cấu trúc kênh',
                value: [
                  `**${CATEGORY_ANNOUNCE}** (chỉ đọc): ${describe(registerChannel)}, ${describe(announceChannel)}, ${describe(levelupChannel)}`,
                  `**${CATEGORY_STUDY}**: ${describe(homeworkChannel)}, ${describe(resourceChannel)}, ${studentBotChannels.map((c) => describe(c)).join(', ')}`,
                  `**${CATEGORY_CHAT}**: tán-gẫu, khoe-thành-tích (tạo bởi /setup-onboarding)`,
                  `**${CATEGORY_VOICE}**: ${voiceChannels.map((c) => describe(c)).join(', ')}`,
                  `**${CATEGORY_TEACHER}** (ẩn với học sinh): ${describe(teacherBotChannel)}`,
                  legacyRemoved > 0 ? `-# Đã xoá ${legacyRemoved} danh mục layout cũ.` : '',
                ]
                  .filter(Boolean)
                  .join('\n'),
                inline: false,
              },
              {
                name: '👁️ Ẩn lệnh giáo viên với học sinh (làm 1 lần)',
                value:
                  'Server Settings → **Integrations** → Code Dojo → chọn từng lệnh giáo viên ' +
                  '(`course-create`, `lesson-add`, `homework-create`, `review`, `attendance-mark`, `schedule-set`, `postpone`) ' +
                  '→ thêm role **Teacher**. Bot không tự làm được bước này (giới hạn của Discord).',
                inline: false,
              },
              {
                name: 'Quyền kênh',
                value: [
                  `Cả nhóm **${CATEGORY_ANNOUNCE}** chỉ đọc (bấm nút vẫn hoạt động) · \`lệnh-bot-*\` chỉ Student+Teacher · voice mở cho mọi người`,
                  '-# Admin thấy tất cả (quyền Administrator bỏ qua giới hạn kênh).',
                ].join('\n'),
                inline: false,
              },
              { name: '⚠️ Lưu ý', value: warnings.join('\n\n'), inline: false },
            ],
            footer: {
              text: 'Cấu hình đã được lưu — dùng ngay được, không cần sửa .env hay khởi động lại bot.',
            },
          },
        ],
      });
    } catch (err) {
      console.error('[Bot] /setup failed:', err);
      const message =
        err instanceof ApiError
          ? `Không lưu được cấu hình (API ${err.status}): ${err.message}`
          : 'Có lỗi xảy ra khi thiết lập server. Kiểm tra quyền của bot rồi thử lại.';
      await interaction.editReply({ content: message });
    }
  },
};
