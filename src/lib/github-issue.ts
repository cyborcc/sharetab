export const GITHUB_REPO_URL = 'https://github.com/cyborcc/splitbon';

// Browsers and GitHub accept long URLs, but keep the pre-filled text well below common limits
const MAX_BODY_CHARS = 3000;

/**
 * A link that opens a pre-filled "new issue" form on GitHub. Nothing is sent from the server: the person
 * sees the text and submits it with their own GitHub account.
 */
export function buildIssueUrl(entry: { kind: 'BUG' | 'IDEA'; title: string; body?: string | null }): string {
  const text = (entry.body ?? '').trim();
  const clipped = text.length > MAX_BODY_CHARS ? `${text.slice(0, MAX_BODY_CHARS)}…` : text;
  const heading = entry.kind === 'BUG' ? 'Problem' : 'Idea';
  const body = [
    `**${heading}**`,
    '',
    clipped || '_No details._',
    '',
    '---',
    'Sent from the in-app feedback form.',
  ].join('\n');
  const params = new URLSearchParams({ title: entry.title.trim(), body });
  return `${GITHUB_REPO_URL}/issues/new?${params.toString()}`;
}
