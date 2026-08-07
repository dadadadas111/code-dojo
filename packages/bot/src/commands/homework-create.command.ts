import {
  ActionRowBuilder,
  EmbedBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { Command } from './index';
import type { Course, Homework, HomeworkType } from '@code-dojo/shared';
import { ApiError, createHomework, getActiveCourse } from '../utils/api-client';
import { isTeacher } from '../utils/permissions';
import { homeworkChannelId } from '../config/guild-config';
import { buildHomeworkDetailEmbed } from '../embeds/homework.embed';
import { componentId } from '../interactions/ids';

/** Auto-posts new homework to #bài-tập with a submit menu. Never throws. */
async function announceHomework(
  interaction: ChatInputCommandInteraction,
  homework: Homework,
): Promise<void> {
  const channelId = homeworkChannelId();
  if (!channelId || !interaction.guild) return;
  try {
    const channel = await interaction.guild.channels.fetch(channelId);
    if (!channel?.isTextBased()) return;
    const select = new StringSelectMenuBuilder()
      .setCustomId(componentId('hw', 'pick'))
      .setPlaceholder('📤 Nộp bài này...')
      .addOptions([{ label: `Nộp: ${homework.title}`.slice(0, 100), value: homework.id }]);
    await channel.send({
      content: '📚 **Bài tập mới!**',
      embeds: [buildHomeworkDetailEmbed(homework)],
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
    });
  } catch (err) {
    console.warn('[Bot] Failed to announce homework:', err);
  }
}

const HOMEWORK_TYPES: HomeworkType[] = ['quiz', 'coding', 'reading', 'practice', 'challenge'];

export const homeworkCreateCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('homework-create')
    .setDescription('[Giáo viên] Tạo bài tập cho khoá học đang hoạt động')
    .setDefaultMemberPermissions('0')
    .addStringOption((opt) =>
      opt
        .setName('deadline')
        .setDescription('Hạn nộp (YYYY-MM-DD hoặc YYYY-MM-DDTHH:mm)')
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName('leetcode')
        .setDescription('Slug hoặc link bài LeetCode — tự lấy đề, độ khó và thưởng')
        .setRequired(false),
    )
    .addStringOption((opt) =>
      opt
        .setName('title')
        .setDescription('Tiêu đề (bỏ trống nếu dùng leetcode)')
        .setRequired(false),
    )
    .addStringOption((opt) =>
      opt
        .setName('description')
        .setDescription('Mô tả (bỏ trống nếu dùng leetcode)')
        .setRequired(false),
    )
    .addStringOption((opt) =>
      opt
        .setName('type')
        .setDescription('Loại bài tập (mặc định coding nếu dùng leetcode)')
        .setRequired(false)
        .addChoices(...HOMEWORK_TYPES.map((t) => ({ name: t, value: t }))),
    )
    .addIntegerOption((opt) =>
      opt
        .setName('xp_reward')
        .setDescription('XP thưởng (tuỳ chọn)')
        .setRequired(false)
        .setMinValue(0),
    )
    .addIntegerOption((opt) =>
      opt
        .setName('coin_reward')
        .setDescription('Coins thưởng (tuỳ chọn)')
        .setRequired(false)
        .setMinValue(0),
    )
    .addIntegerOption((opt) =>
      opt
        .setName('max_score')
        .setDescription('Điểm tối đa (tuỳ chọn)')
        .setRequired(false)
        .setMinValue(1),
    )
    .addStringOption((opt) =>
      opt.setName('lesson_id').setDescription('Lesson ID liên quan (tuỳ chọn)').setRequired(false),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!isTeacher(interaction)) {
      await interaction.reply({
        content: 'Chỉ giáo viên dùng được lệnh này.',
        ephemeral: true,
      });
      return;
    }

    const leetcode = interaction.options.getString('leetcode');
    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description');
    const type = interaction.options.getString('type') as HomeworkType | null;
    const deadlineStr = interaction.options.getString('deadline', true);

    if (!leetcode && (!title || !description || !type)) {
      await interaction.reply({
        content:
          'Cần `leetcode:` (slug/link) HOẶC đủ bộ `title` + `description` + `type` để tạo bài tập.',
        ephemeral: true,
      });
      return;
    }
    const xpReward = interaction.options.getInteger('xp_reward');
    const coinReward = interaction.options.getInteger('coin_reward');
    const maxScore = interaction.options.getInteger('max_score');
    const lessonId = interaction.options.getString('lesson_id');

    const deadline = new Date(deadlineStr);
    if (isNaN(deadline.getTime())) {
      await interaction.reply({
        content: `Hạn nộp không hợp lệ: "${deadlineStr}". Dùng định dạng YYYY-MM-DD hoặc YYYY-MM-DDTHH:mm.`,
        ephemeral: true,
      });
      return;
    }

    let course: Course;
    try {
      course = await getActiveCourse();
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        await interaction.reply({
          content: 'Chưa có khoá học đang hoạt động. Tạo khoá học trước.',
          ephemeral: true,
        });
        return;
      }
      await interaction.reply({
        content: 'Có lỗi xảy ra khi lấy khoá học. Vui lòng thử lại sau.',
        ephemeral: true,
      });
      return;
    }

    try {
      const homework = await createHomework(course.id, {
        ...(title ? { title } : {}),
        ...(description ? { description } : {}),
        ...(type ? { type } : {}),
        ...(leetcode ? { leetcodeSlug: leetcode } : {}),
        deadline: deadline.toISOString(),
        ...(xpReward !== null ? { xpReward } : {}),
        ...(coinReward !== null ? { coinReward } : {}),
        ...(maxScore !== null ? { maxScore } : {}),
        ...(lessonId ? { lessonId } : {}),
      });

      const embed = new EmbedBuilder()
        .setTitle('Bài tập đã được tạo!')
        .setColor(0x57f287)
        .addFields(
          { name: 'Tiêu đề', value: homework.title, inline: true },
          { name: 'Loại', value: homework.type, inline: true },
          {
            name: 'Hạn nộp',
            value: new Intl.DateTimeFormat('en-GB', {
              timeZone: 'Asia/Ho_Chi_Minh',
              dateStyle: 'medium',
              timeStyle: 'short',
            }).format(new Date(homework.deadline as unknown as string)),
            inline: true,
          },
          { name: 'Khoá học', value: course.name, inline: false },
        )
        .setFooter({ text: `Homework ID: ${homework.id}` });

      await interaction.reply({ embeds: [embed] });
      await announceHomework(interaction, homework);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 404 && leetcode) {
          await interaction.reply({
            content: `Không tìm thấy bài LeetCode "${leetcode}" — kiểm tra slug/link.`,
            ephemeral: true,
          });
          return;
        }
        if (err.status === 502) {
          await interaction.reply({
            content: 'LeetCode đang không truy cập được — thử lại sau hoặc tạo thủ công.',
            ephemeral: true,
          });
          return;
        }
        await interaction.reply({
          content: `Lỗi khi tạo bài tập: ${err.message}`,
          ephemeral: true,
        });
        return;
      }
      await interaction.reply({
        content: 'Có lỗi xảy ra khi tạo bài tập. Vui lòng thử lại sau.',
        ephemeral: true,
      });
    }
  },
};
