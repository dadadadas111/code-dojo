import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import type {
  CategoryChannel,
  ChatInputCommandInteraction,
  Guild,
  GuildMember,
  Role,
  TextChannel,
} from 'discord.js';
import { LEVEL_THRESHOLDS } from '@code-dojo/shared';
import type { Command } from './index';
import { ApiError, saveGuildConfig } from '../utils/api-client';
import {
  setGuildConfig,
  teacherRoleId,
  levelRoleMap,
  levelupChannelId,
} from '../config/guild-config';

const TEACHER_ROLE_NAME = 'Teacher';
const CATEGORY_NAME = 'Code Dojo';
const LEVELUP_CHANNEL_NAME = 'level-up';
// Classroom scaffold — created for convenience, not wired to any bot feature.
const EXTRA_CHANNEL_NAMES = ['thông-báo', 'bài-tập'];

const TEACHER_ROLE_COLOR = 0xed4245;
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

/** Reuses the configured/like-named text channel anywhere in the guild, otherwise creates it under the category. */
async function ensureTextChannel(
  guild: Guild,
  name: string,
  parentId: string,
  preferredId: string | null,
): Promise<Ensured<TextChannel>> {
  if (preferredId) {
    const existing = guild.channels.cache.get(preferredId);
    if (existing && existing.type === ChannelType.GuildText) {
      return { entity: existing as TextChannel, created: false };
    }
  }
  const byName = guild.channels.cache.find(
    (channel) => channel.type === ChannelType.GuildText && channel.name === name,
  ) as TextChannel | undefined;
  if (byName) return { entity: byName, created: false };

  const channel = await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: parentId,
    reason: 'Code Dojo /setup',
  });
  return { entity: channel, created: true };
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
      const levelupChannel = await ensureTextChannel(
        guild,
        LEVELUP_CHANNEL_NAME,
        category.entity.id,
        levelupChannelId(),
      );
      const extraChannels: Array<Ensured<TextChannel>> = [];
      for (const name of EXTRA_CHANNEL_NAMES) {
        extraChannels.push(await ensureTextChannel(guild, name, category.entity.id, null));
      }

      const savedConfig = await saveGuildConfig(guild.id, {
        teacherRoleId: teacher.entity.id,
        levelRoleIds: Object.fromEntries(
          levelRoles.map(({ level, result }) => [String(level), result.entity.id]),
        ),
        levelupChannelId: levelupChannel.entity.id,
      });
      // Apply immediately — no restart needed.
      setGuildConfig(savedConfig);

      const warnings: string[] = [];
      const unassignable = levelRoles.filter(
        ({ result }) => me.roles.highest.comparePositionTo(result.entity) <= 0,
      );
      if (unassignable.length > 0) {
        warnings.push(
          'Role của bot đang nằm **dưới** các role cấp độ ' +
            `(${unassignable.map(({ title }) => title).join(', ')}). ` +
            'Vào Server Settings → Roles và kéo role của bot lên trên các role này, nếu không bot sẽ không gán được role khi học viên lên cấp.',
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
                  `Kênh level-up: ${describe(levelupChannel)}`,
                  ...extraChannels.map((channel) => describe(channel)),
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
