import type { ChatInputCommandInteraction } from 'discord.js';

export interface Command {
  data: { name: string; toJSON(): object };
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
}

import { pingCommand } from './ping.command';
import { registerCommand } from './register.command';
import { profileCommand } from './profile.command';

export const commands = new Map<string, Command>([
  [pingCommand.data.name, pingCommand],
  [registerCommand.data.name, registerCommand],
  [profileCommand.data.name, profileCommand],
]);
