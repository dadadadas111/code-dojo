import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { Command } from './index';
import type { Course, HomeworkType } from '@code-dojo/shared';
import { ApiError, createHomework, getActiveCourse } from '../utils/api-client';
import { isTeacher } from '../utils/permissions';

const HOMEWORK_TYPES: HomeworkType[] = ['quiz', 'coding', 'reading', 'practice', 'challenge'];

export const homeworkCreateCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('homework-create')
    .setDescription('[Giáo viên] Tạo bài tập cho khoá học đang hoạt động')
    .addStringOption((opt) =>
      opt.setName('title').setDescription('Tiêu đề bài tập').setRequired(true),
    )
    .addStringOption((opt) =>
      opt.setName('description').setDescription('Mô tả bài tập').setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName('type')
        .setDescription('Loại bài tập')
        .setRequired(true)
        .addChoices(...HOMEWORK_TYPES.map((t) => ({ name: t, value: t }))),
    )
    .addStringOption((opt) =>
      opt
        .setName('deadline')
        .setDescription('Hạn nộp (YYYY-MM-DD hoặc YYYY-MM-DDTHH:mm)')
        .setRequired(true),
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

    const title = interaction.options.getString('title', true);
    const description = interaction.options.getString('description', true);
    const type = interaction.options.getString('type', true) as HomeworkType;
    const deadlineStr = interaction.options.getString('deadline', true);
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
        title,
        description,
        type,
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
    } catch (err) {
      if (err instanceof ApiError) {
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
