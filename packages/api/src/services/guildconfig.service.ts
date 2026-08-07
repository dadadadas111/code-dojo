import type mongoose from 'mongoose';
import type { GuildConfig } from '@code-dojo/shared';
import { GuildConfigModel } from '../db/models/guildconfig.model';
import { NotFoundError } from '../errors';

function toGuildConfig(doc: mongoose.Document): GuildConfig {
  return doc.toJSON() as unknown as GuildConfig;
}

export interface UpsertGuildConfigInput {
  teacherRoleId?: string | null;
  levelRoleIds?: Record<string, string>;
  levelupChannelId?: string | null;
}

export async function getGuildConfig(guildId: string): Promise<GuildConfig> {
  const doc = await GuildConfigModel.findOne({ guildId });
  if (!doc) {
    throw new NotFoundError('Guild config not found');
  }
  return toGuildConfig(doc);
}

/** Idempotent — returns whether a config existed. Used by the bot's /uninstall. */
export async function deleteGuildConfig(guildId: string): Promise<boolean> {
  const res = await GuildConfigModel.deleteOne({ guildId });
  return res.deletedCount > 0;
}

export async function upsertGuildConfig(
  guildId: string,
  input: UpsertGuildConfigInput,
): Promise<GuildConfig> {
  // An empty $set is rejected by MongoDB — a bodyless PUT still upserts defaults.
  const update = Object.keys(input).length > 0 ? { $set: input } : {};
  const doc = await GuildConfigModel.findOneAndUpdate({ guildId }, update, {
    new: true,
    upsert: true,
    setDefaultsOnInsert: true,
  });
  return toGuildConfig(doc);
}
