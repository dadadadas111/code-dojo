import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import type { ButtonInteraction, ChatInputCommandInteraction, Guild } from 'discord.js';
import { LEVEL_THRESHOLDS } from '@code-dojo/shared';
import type { Command } from './index';
import { deleteGuildConfig } from '../utils/api-client';
import { isAdmin } from '../utils/permissions';
import {
  setGuildConfig,
  teacherRoleId,
  studentRoleId,
  levelRoleMap,
  levelupChannelId,
} from '../config/guild-config';
import { componentId, type ComponentHandler } from '../interactions/ids';
import {
  CATEGORY_NAME,
  EXTRA_CHANNEL_NAMES,
  LEVELUP_CHANNEL_NAME,
  REGISTER_CHANNEL_NAME,
  STUDENT_BOT_CHANNEL_NAMES,
  STUDENT_ROLE_NAME,
  TEACHER_BOT_CHANNEL_NAME,
  TEACHER_ROLE_NAME,
} from './setup.command';
import {
  RULES_CHANNEL_NAME,
  CHAT_CHANNEL_NAME,
  QA_CHANNEL_NAME,
  FLEX_CHANNEL_NAME,
  INTEREST_ROLES,
} from './setup-onboarding.command';

interface RemovalPlan {
  roleIds: string[];
  channelIds: string[];
  categoryId: string | null;
}

/** Collects everything /setup manages: configured IDs first, then name-based fallbacks. */
async function buildRemovalPlan(guild: Guild): Promise<RemovalPlan> {
  await guild.roles.fetch();
  await guild.channels.fetch();

  const roleIds = new Set<string>();
  for (const id of [teacherRoleId(), studentRoleId(), ...Object.values(levelRoleMap())]) {
    if (id && guild.roles.cache.has(id)) roleIds.add(id);
  }
  const roleNames = new Set([
    TEACHER_ROLE_NAME,
    STUDENT_ROLE_NAME,
    ...INTEREST_ROLES.map((r) => r.name),
    ...Object.values(LEVEL_THRESHOLDS).map(({ title }) => title),
  ]);
  for (const role of guild.roles.cache.values()) {
    if (roleNames.has(role.name)) roleIds.add(role.id);
  }

  const channelIds = new Set<string>();
  const configuredLevelup = levelupChannelId();
  if (configuredLevelup && guild.channels.cache.has(configuredLevelup)) {
    channelIds.add(configuredLevelup);
  }
  const channelNames = new Set([
    LEVELUP_CHANNEL_NAME,
    REGISTER_CHANNEL_NAME,
    TEACHER_BOT_CHANNEL_NAME,
    RULES_CHANNEL_NAME,
    CHAT_CHANNEL_NAME,
    QA_CHANNEL_NAME,
    FLEX_CHANNEL_NAME,
    ...STUDENT_BOT_CHANNEL_NAMES,
    ...EXTRA_CHANNEL_NAMES,
  ]);
  const category = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name === CATEGORY_NAME,
  );
  for (const channel of guild.channels.cache.values()) {
    if (channel.type !== ChannelType.GuildText) continue;
    const inCategory = category !== undefined && channel.parentId === category.id;
    if (channelNames.has(channel.name) || inCategory) channelIds.add(channel.id);
  }

  return {
    roleIds: [...roleIds],
    channelIds: [...channelIds],
    categoryId: category?.id ?? null,
  };
}

export const uninstallCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('uninstall')
    .setDescription('[Admin] Gỡ cài đặt Code Dojo: xoá role, kênh đã tạo và cấu hình server')
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

    const plan = await buildRemovalPlan(guild);
    const total = plan.roleIds.length + plan.channelIds.length + (plan.categoryId ? 1 : 0);
    if (total === 0) {
      await interaction.reply({
        content:
          'Không tìm thấy role/kênh nào của Code Dojo để xoá. Cấu hình (nếu có) sẽ được xoá.',
        components: [confirmRow()],
        ephemeral: true,
      });
      return;
    }

    await interaction.reply({
      embeds: [
        {
          title: '🗑️ Gỡ cài đặt Code Dojo?',
          color: 0xed4245,
          description: [
            'Các mục sau sẽ bị **xoá vĩnh viễn** khỏi server:',
            `- ${plan.roleIds.length} role: ${plan.roleIds.map((id) => `<@&${id}>`).join(', ')}`,
            `- ${plan.channelIds.length} kênh: ${plan.channelIds.map((id) => `<#${id}>`).join(', ')}`,
            plan.categoryId ? `- Danh mục **${CATEGORY_NAME}**` : '',
            '- Cấu hình server đã lưu (chạy `/setup` để tạo lại)',
            '',
            '-# Dữ liệu lớp học (học viên, bài nộp...) KHÔNG bị xoá — dùng `/reset` cho việc đó.',
          ]
            .filter(Boolean)
            .join('\n'),
        },
      ],
      components: [confirmRow()],
      ephemeral: true,
    });
  },
};

function confirmRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(componentId('uninstall', 'confirm'))
      .setLabel('🗑️ Xoá tất cả')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(componentId('uninstall', 'cancel'))
      .setLabel('Huỷ')
      .setStyle(ButtonStyle.Secondary),
  );
}

export const uninstallComponents: ComponentHandler = {
  async handleButton(interaction: ButtonInteraction, args: string[]): Promise<void> {
    if (args[0] === 'cancel') {
      await interaction.update({ content: 'Đã huỷ gỡ cài đặt.', embeds: [], components: [] });
      return;
    }
    if (args[0] !== 'confirm') return;
    const guild = interaction.guild;
    if (!guild || !isAdmin(interaction)) {
      await interaction.reply({ content: 'Chỉ quản trị viên dùng được nút này.', ephemeral: true });
      return;
    }

    await interaction.deferUpdate();

    // Re-plan at confirm time — the server may have changed since the prompt.
    const plan = await buildRemovalPlan(guild);
    const failures: string[] = [];
    let removed = 0;

    for (const id of plan.channelIds) {
      try {
        await guild.channels.delete(id, 'Code Dojo /uninstall');
        removed++;
      } catch {
        failures.push(`kênh <#${id}>`);
      }
    }
    if (plan.categoryId) {
      try {
        await guild.channels.delete(plan.categoryId, 'Code Dojo /uninstall');
        removed++;
      } catch {
        failures.push(`danh mục ${CATEGORY_NAME}`);
      }
    }
    for (const id of plan.roleIds) {
      try {
        await guild.roles.delete(id, 'Code Dojo /uninstall');
        removed++;
      } catch {
        failures.push(`role <@&${id}>`);
      }
    }

    let configCleared = false;
    try {
      await deleteGuildConfig(guild.id);
      setGuildConfig({
        teacherRoleId: null,
        studentRoleId: null,
        levelRoleIds: {},
        levelupChannelId: null,
        announceChannelId: null,
        homeworkChannelId: null,
        registerChannelId: null,
      });
      configCleared = true;
    } catch (err) {
      console.warn('[Bot] /uninstall: failed to delete guild config:', err);
    }

    await interaction.editReply({
      embeds: [
        {
          title: '🗑️ Gỡ cài đặt hoàn tất',
          color: failures.length > 0 ? 0xfee75c : 0x57f287,
          description: [
            `Đã xoá **${removed}** mục.`,
            configCleared
              ? 'Cấu hình server đã được xoá.'
              : '⚠️ Không xoá được cấu hình server (API lỗi) — thử lại sau.',
            failures.length > 0
              ? `⚠️ Không xoá được: ${failures.join(', ')} — kiểm tra quyền **Manage Roles / Manage Channels** và vị trí role của bot.`
              : '',
            '',
            'Chạy `/setup` bất cứ lúc nào để cài đặt lại từ đầu.',
          ]
            .filter(Boolean)
            .join('\n'),
        },
      ],
      components: [],
    });
  },
};
