import type {
  ButtonInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
} from 'discord.js';

/**
 * Component customId convention: `cd:<namespace>:<...args>`.
 * The registry routes on <namespace>; handlers interpret the rest.
 * Kept in its own file (no imports from command files) so command files can
 * import componentId() without creating a cycle with the registry.
 */
export const CUSTOM_ID_ROOT = 'cd';

export function componentId(...parts: string[]): string {
  return [CUSTOM_ID_ROOT, ...parts].join(':');
}

export interface ComponentHandler {
  handleButton?(interaction: ButtonInteraction, args: string[]): Promise<void>;
  handleSelect?(interaction: StringSelectMenuInteraction, args: string[]): Promise<void>;
  handleModal?(interaction: ModalSubmitInteraction, args: string[]): Promise<void>;
}
