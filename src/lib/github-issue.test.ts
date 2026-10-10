import { describe, expect, it } from 'vitest';
import { buildIssueUrl, GITHUB_REPO_URL } from './github-issue';

describe('buildIssueUrl', () => {
  it('opens the new-issue form of the repository with title and body filled in', () => {
    const url = new URL(buildIssueUrl({ kind: 'BUG', title: ' Crash on scan ', body: 'It closes & reloads' }));
    expect(url.origin + url.pathname).toBe(`${GITHUB_REPO_URL}/issues/new`);
    expect(url.searchParams.get('title')).toBe('Crash on scan');
    const body = url.searchParams.get('body')!;
    expect(body).toContain('**Problem**');
    expect(body).toContain('It closes & reloads');
  });

  it('labels ideas and handles a missing body', () => {
    const url = new URL(buildIssueUrl({ kind: 'IDEA', title: 'Tip on receipt', body: null }));
    const body = url.searchParams.get('body')!;
    expect(body).toContain('**Idea**');
    expect(body).toContain('_No details._');
  });

  it('shortens very long text so the link stays usable', () => {
    const url = new URL(buildIssueUrl({ kind: 'IDEA', title: 'Long', body: 'x'.repeat(10000) }));
    expect(url.searchParams.get('body')!.length).toBeLessThan(3200);
  });
});
