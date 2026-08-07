import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import type {
  CategoryChannel,
  ChatInputCommandInteraction,
  Guild,
  GuildMember,
  OverwriteResolvable,
  Role,
  TextChannel,
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
export const CATEGORY_NAME = 'Code Dojo';
export const LEVELUP_CHANNEL_NAME = 'level-up';
export const ANNOUNCE_CHANNEL_NAME = 'thông-báo';
export const HOMEWORK_CHANNEL_NAME = 'bài-tập';
export const EXTRA_CHANNEL_NAMES = [ANNOUNCE_CHANNEL_NAME, HOMEWORK_CHANNEL_NAME];
// Bot-command channels: register is open to everyone; the numbered ones are
// student+teacher only; the gv one is teacher only. Admins see all (Discord
// Administrator bypasses channel overwrites).
export const REGISTER_CHANNEL_NAME = 'đăng-ký';
export const STUDENT_BOT_CHANNEL_NAMES = ['lệnh-bot-1', 'lệnh-bot-2', 'lệnh-bot-3'];
export const TEACHER_BOT_CHANNEL_NAME = 'gv-lệnh-bot';

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

interface Ensured<T> {
  entity: T;
  created: boolean;
}

function describe<T extends { toString(): string }>(item: Ensured<T>): string {
  return `${item.entity.toString()} ${item.created ? '(mới tạo)' : '(đã có)'}`;
}

/** Reuses the configured/like-named role if present, otherwise creates it. */
async function ensureRole(
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

async function ensureCategory(guild: Guild): Promise<Ensured<CategoryChannel>> {
  const existing = guild.channels.cache.find(
    (channel) => channel.type === ChannelType.GuildCategory && channel.name === CATEGORY_NAME,
  ) as CategoryChannel | undefined;
  if (existing) return { entity: existing, created: false };

  const category = await guild.channels.create({
    name: CATEGORY_NAME,
    type: ChannelType.GuildCategory,
    reason: 'Code Dojo /setup',
  });
  return { entity: category, created: true };
}

/**
 * Reuses the configured/like-named text channel anywhere in the guild,
 * otherwise creates it under the category. When `overwrites` is given, it is
 * (re)applied even on reuse so re-running /setup converges on the intended
 * permission layout.
 */
async function ensureTextChannel(
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

      const category = await ensureCategory(guild);

      // Feed channels: everyone reads, only Teacher + bot post.
      const feedAccess: OverwriteResolvable[] = [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.SendMessages] },
        { id: teacher.entity.id, allow: [PermissionFlagsBits.SendMessages] },
        { id: me.id, allow: [PermissionFlagsBits.SendMessages] },
      ];
      const levelupChannel = await ensureTextChannel(
        guild,
        LEVELUP_CHANNEL_NAME,
        category.entity.id,
        levelupChannelId(),
        feedAccess,
      );
      const announceChannel = await ensureTextChannel(
        guild,
        ANNOUNCE_CHANNEL_NAME,
        category.entity.id,
        announceChannelId(),
        feedAccess,
      );
      // #bài-tập stays chatty — bot posts homework, students discuss under it.
      const homeworkChannel = await ensureTextChannel(
        guild,
        HOMEWORK_CHANNEL_NAME,
        category.entity.id,
        homeworkChannelId(),
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

      const registerChannel = await ensureTextChannel(
        guild,
        REGISTER_CHANNEL_NAME,
        category.entity.id,
        registerChannelId(),
      );
      await ensureStandingWelcome(registerChannel.entity);
      const studentBotChannels: Array<Ensured<TextChannel>> = [];
      for (const name of STUDENT_BOT_CHANNEL_NAMES) {
        studentBotChannels.push(
          await ensureTextChannel(guild, name, category.entity.id, null, studentAccess),
        );
      }
      const teacherBotChannel = await ensureTextChannel(
        guild,
        TEACHER_BOT_CHANNEL_NAME,
        category.entity.id,
        null,
        teacherAccess,
      );

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
                name: 'Kênh',
                value: [
                  `Danh mục **${CATEGORY_NAME}** ${category.created ? '(mới tạo)' : '(đã có)'}`,
                  `Feed (chỉ Teacher + bot đăng): ${describe(announceChannel)}, ${describe(levelupChannel)}`,
                  `${describe(homeworkChannel)} — bot tự đăng bài tập mới vào đây`,
                ].join('\n'),
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
                name: 'Kênh lệnh bot',
                value: [
                  `${describe(registerChannel)} — mở cho mọi người (\`/register\`, \`/help\`)`,
                  `${studentBotChannels.map((c) => describe(c)).join(', ')} — chỉ Student + Teacher`,
                  `${describe(teacherBotChannel)} — chỉ Teacher`,
                  '-# Admin thấy tất cả các kênh (quyền Administrator bỏ qua giới hạn kênh).',
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
