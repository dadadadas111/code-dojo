import type { HomeworkSource, LeetCodeDifficulty } from '@code-dojo/shared';
import { AppError, NotFoundError, ValidationError } from '../errors';

/**
 * LeetCode adapter. LeetCode has no official public API; this uses the same
 * public GraphQL endpoint their site uses. Everything LeetCode-specific stays
 * in this file so a breaking upstream change degrades gracefully (teachers
 * fall back to manual homework) instead of rippling through the codebase.
 */

const GRAPHQL_URL = 'https://leetcode.com/graphql';
const FETCH_TIMEOUT_MS = 8000;

/** Reward defaults by difficulty — teacher-overridable at create time. */
export const REWARDS_BY_DIFFICULTY: Record<LeetCodeDifficulty, { xp: number; coins: number }> = {
  Easy: { xp: 50, coins: 20 },
  Medium: { xp: 100, coins: 40 },
  Hard: { xp: 200, coins: 80 },
};

/** Accepts a bare slug ("two-sum") or any problem URL; returns the slug. */
export function extractSlug(input: string): string {
  const trimmed = input.trim();
  const urlMatch = /leetcode\.(?:com|cn)\/problems\/([\w-]+)/i.exec(trimmed);
  if (urlMatch) return urlMatch[1]!.toLowerCase();
  if (/^[\w-]+$/.test(trimmed)) return trimmed.toLowerCase();
  throw new ValidationError(`Not a LeetCode slug or problem URL: ${input}`);
}

export interface LeetCodeProblem {
  title: string;
  slug: string;
  difficulty: LeetCodeDifficulty;
  url: string;
  tags: string[];
}

interface QuestionResponse {
  data?: {
    question?: {
      title: string;
      titleSlug: string;
      difficulty: string;
      topicTags?: Array<{ name: string }>;
    } | null;
  };
}

export async function fetchProblem(slugOrUrl: string): Promise<LeetCodeProblem> {
  const slug = extractSlug(slugOrUrl);

  let res: Response;
  try {
    res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Referer: 'https://leetcode.com' },
      body: JSON.stringify({
        query:
          'query q($titleSlug: String!) { question(titleSlug: $titleSlug) { title titleSlug difficulty topicTags { name } } }',
        variables: { titleSlug: slug },
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    throw new AppError('LeetCode is unreachable right now — try again or create manually', 502);
  }
  if (!res.ok) {
    throw new AppError(`LeetCode responded with ${res.status} — try again later`, 502);
  }

  const payload = (await res.json()) as QuestionResponse;
  const question = payload.data?.question;
  if (!question) {
    throw new NotFoundError(`LeetCode problem not found: ${slug}`);
  }

  const difficulty = (['Easy', 'Medium', 'Hard'] as const).includes(
    question.difficulty as LeetCodeDifficulty,
  )
    ? (question.difficulty as LeetCodeDifficulty)
    : 'Medium';

  return {
    title: question.title,
    slug: question.titleSlug,
    difficulty,
    url: `https://leetcode.com/problems/${question.titleSlug}/`,
    tags: (question.topicTags ?? []).map((t) => t.name),
  };
}

export function toHomeworkSource(problem: LeetCodeProblem): HomeworkSource {
  return { type: 'leetcode', slug: problem.slug, difficulty: problem.difficulty, url: problem.url };
}
