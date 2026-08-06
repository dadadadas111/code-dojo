import { z } from 'zod';

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().optional(),
  DISCORD_GUILD_ID: z.string().optional(),
  API_URL: z.string().url(),
  API_KEY: z.string().min(16),
  // Optional since /setup: guild config stored via the API is the primary
  // source; this env var is only the fallback for pre-/setup installs.
  TEACHER_ROLE_ID: z.string().min(1).optional(),
  // JSON object mapping level -> Discord role ID, e.g. {"1":"roleid","2":"roleid"}.
  // Never throws on missing/malformed input — parsed safely via levelRoleIds().
  LEVEL_ROLE_IDS: z.string().optional(),
  LEVELUP_CHANNEL_ID: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('[Bot] Invalid environment variables:');
  for (const issue of result.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env: Env = result.data;

/**
 * Parses LEVEL_ROLE_IDS into a level -> roleId map. Tolerates absent or
 * malformed JSON by returning {} instead of throwing, so gamification
 * role-sync stays fully optional.
 */
export function levelRoleIds(): Record<string, string> {
  if (!env.LEVEL_ROLE_IDS) return {};
  try {
    const parsed: unknown = JSON.parse(env.LEVEL_ROLE_IDS);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
    return {};
  } catch {
    return {};
  }
}
