import type { ChatInputCommandInteraction } from 'discord.js';

export interface Command {
  data: { name: string; toJSON(): object };
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
}

import { pingCommand } from './ping.command';
import { registerCommand } from './register.command';
import { profileCommand } from './profile.command';
import { courseCreateCommand } from './course-create.command';
import { lessonAddCommand } from './lesson-add.command';
import { lessonCommand } from './lesson.command';
import { scheduleCommand } from './schedule.command';
import { homeworkCreateCommand } from './homework-create.command';
import { homeworkCommand } from './homework.command';
import { submitCommand } from './submit.command';
import { resubmitCommand } from './resubmit.command';
import { reviewCommand } from './review.command';

export const commands = new Map<string, Command>([
  [pingCommand.data.name, pingCommand],
  [registerCommand.data.name, registerCommand],
  [profileCommand.data.name, profileCommand],
  [courseCreateCommand.data.name, courseCreateCommand],
  [lessonAddCommand.data.name, lessonAddCommand],
  [lessonCommand.data.name, lessonCommand],
  [scheduleCommand.data.name, scheduleCommand],
  [homeworkCreateCommand.data.name, homeworkCreateCommand],
  [homeworkCommand.data.name, homeworkCommand],
  [submitCommand.data.name, submitCommand],
  [resubmitCommand.data.name, resubmitCommand],
  [reviewCommand.data.name, reviewCommand],
]);
