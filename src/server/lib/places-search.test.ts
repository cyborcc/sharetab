import { afterEach, describe, expect, it, vi } from 'vitest';
import { queryVariants, searchPlacesIndex } from './places-search';

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.PLACES_API_ENABLED;
});

describe('queryVariants', () => {
  it('shortens a long query word by word, down to two words', () => {
    expect(queryVariants('White Elephant Thai Restaurant el gouna')).toEqual([
      'White Elephant Thai Restaurant el gouna',
      'White Elephant Thai Restaurant el',
      'White Elephant Thai Restaurant',
      'White Elephant Thai',
    ]);
  });
});

describe('searchPlacesIndex', () => {
  const near = { lat: 27.3963, lon: 33.6759 };
  const hit = (name: string, lat: number, lng: number) => ({ name, lat, lng, category: 'restaurant' });

  it('skips variants whose hits do not match the name and sorts by distance', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [hit('Tambel Irish Pub', 27.397, 33.675)] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [hit('White Elephant', 27.163, 33.823), hit('White Elephant Thai', 27.3963, 33.6758)],
        }),
      });
    vi.stubGlobal('fetch', fetchMock);
    const hits = await searchPlacesIndex('White Elephant el gouna', near);
    expect(hits.map((h) => h.name)).toEqual(['White Elephant Thai', 'White Elephant']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('can be switched off', async () => {
    process.env.PLACES_API_ENABLED = 'false';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await searchPlacesIndex('White Elephant', near)).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns nothing when the service fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    expect(await searchPlacesIndex('White Elephant', near)).toEqual([]);
  });
});
