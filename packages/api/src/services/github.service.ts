import { ValidationError } from '../errors';

/**
 * GitHub link validation for submissions — teachers should never click a dead
 * link. Fail-open by design: only a *definitive* "repo does not exist" blocks
 * a submission; rate limits and network errors let it through.
 */

const FETCH_TIMEOUT_MS = 6000;

/** Parses github.com/{owner}/{repo}[/...] — throws on non-GitHub URLs. */
export function parseRepoUrl(url: string): { owner: string; repo: string } {
  const match =
    /^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[/?#].*)?$/.exec(
      url.trim(),
    );
  if (!match) {
    throw new ValidationError(`Not a GitHub repository link: ${url}`);
  }
  return { owner: match[1]!, repo: match[2]! };
}

/**
 * Throws ValidationError only when GitHub definitively reports the repo does
 * not exist (or the URL isn't a repo link at all). Anything else — rate
 * limits, timeouts, 5xx — passes silently.
 */
export async function assertRepoReachable(url: string): Promise<void> {
  const { owner, repo } = parseRepoUrl(url);

  let res: Response;
  try {
    res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'code-dojo-bot' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    return; // network trouble — don't block students on GitHub's availability
  }

  if (res.status === 404) {
    throw new ValidationError(
      `GitHub repo not found (or private): ${owner}/${repo} — check the link`,
    );
  }
  // 200 OK, 403 rate-limited, 5xx: all fine to proceed.
}
