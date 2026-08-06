import type {
  ButtonInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
} from 'discord.js';
import { CUSTOM_ID_ROOT, type ComponentHandler } from './ids';
import { helpComponents } from '../commands/help.command';
import { homeworkComponents } from '../commands/homework.command';
import { reviewComponents } from '../commands/review.command';

const handlers: Record<string, ComponentHandler> = {
  help: helpComponents,
  hw: homeworkComponents,
  review: reviewComponents,
};

export type ComponentInteraction =
  ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction;

export async function routeComponent(interaction: ComponentInteraction): Promise<void> {
  const [root, namespace, ...args] = interaction.customId.split(':');
  if (root !== CUSTOM_ID_ROOT || !namespace) return;

  const handler = handlers[namespace];
  if (!handler) return;

  if (interaction.isButton()) {
    await handler.handleButton?.(interaction, args);
  } else if (interaction.isStringSelectMenu()) {
    await handler.handleSelect?.(interaction, args);
  } else {
    await handler.handleModal?.(interaction, args);
  }
}
