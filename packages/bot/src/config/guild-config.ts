import type { GuildConfig } from '@code-dojo/shared';
import { env, levelRoleIds as envLevelRoleIds } from './env';
import { ApiError, fetchGuildConfig } from '../utils/api-client';

/**
 * Runtime guild configuration (teacher role, level roles, level-up channel).
 *
 * Primary source is the API-stored config written by /setup; the matching env
 * vars are only a fallback for pre-/setup installs. Loaded once at startup via
 * loadGuildConfig() and refreshed in place by /setup — no restart needed.
 */

type StoredConfig = Pick<
  GuildConfig,
  'teacherRoleId' | 'studentRoleId' | 'levelRoleIds' | 'levelupChannelId'
>;

let stored: StoredConfig = {
  teacherRoleId: null,
  studentRoleId: null,
  levelRoleIds: {},
  levelupChannelId: null,
};

/**
 * Fetches the guild's stored config from the API. A 404 (guild never /setup)
 * is normal and leaves the env fallback active. Returns whether stored config
 * is now present.
 */
export async function loadGuildConfig(guildId: string): Promise<boolean> {
  try {
    const config = await fetchGuildConfig(guildId);
    setGuildConfig(config);
    return true;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return false;
    }
    console.warn('[Bot] Failed to load guild config (using env fallback):', err);
    return false;
  }
}

/** Replaces the in-memory config — called by /setup right after saving. */
export function setGuildConfig(config: StoredConfig): void {
  stored = {
    teacherRoleId: config.teacherRoleId ?? null,
    studentRoleId: config.studentRoleId ?? null,
    levelRoleIds: config.levelRoleIds ?? {},
    levelupChannelId: config.levelupChannelId ?? null,
  };
}

/** Stored-only (no env fallback) — the Student role concept arrived with /setup. */
export function studentRoleId(): string | null {
  return stored.studentRoleId;
}

export function teacherRoleId(): string | null {
  return stored.teacherRoleId ?? env.TEACHER_ROLE_ID ?? null;
}

export function levelRoleMap(): Record<string, string> {
  if (Object.keys(stored.levelRoleIds).length > 0) {
    return stored.levelRoleIds;
  }
  return envLevelRoleIds();
}

export function levelupChannelId(): string | null {
  return stored.levelupChannelId ?? env.LEVELUP_CHANNEL_ID ?? null;
}
