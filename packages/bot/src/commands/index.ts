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

export const commands = new Map<string, Command>([
  [pingCommand.data.name, pingCommand],
  [registerCommand.data.name, registerCommand],
  [profileCommand.data.name, profileCommand],
  [courseCreateCommand.data.name, courseCreateCommand],
  [lessonAddCommand.data.name, lessonAddCommand],
  [lessonCommand.data.name, lessonCommand],
  [scheduleCommand.data.name, scheduleCommand],
]);
