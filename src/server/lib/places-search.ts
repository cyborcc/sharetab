/**
 * Optional place search through a TREK Places API instance (an Overture Places index) that knows many
 * restaurants OpenStreetMap lacks. Off unless PLACES_API_URL names an instance, so no third-party service
 * is contacted by default (the public one is https://places.liketrek.com; check its terms before using it).
 * Called from the server, so the browser never talks to it. PLACES_API_ENABLED=false switches it off.
 */
const TIMEOUT_MS = 4000;
const NEAR_METERS = 50_000;

export type PlaceHit = { name: string; lat: number; lon: number; category: string | null; distance: number | null };

type RawHit = { name?: string; lat?: number; lng?: number; category?: string | null };

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.sqrt(a));
}

/** The query and shorter versions of it ("White Elephant Thai Restaurant el gouna" -> "White Elephant Thai"). */
export function queryVariants(q: string): string[] {
  const words = q.split(/\s+/).filter(Boolean);
  const out = new Set<string>([words.join(' ')]);
  for (let n = words.length - 1; n >= Math.min(2, words.length); n--) out.add(words.slice(0, n).join(' '));
  return [...out].slice(0, 4);
}

async function fetchHits(
  q: string,
  near: { lat: number; lon: number } | null,
  signal?: AbortSignal,
): Promise<RawHit[]> {
  const base = (process.env.PLACES_API_URL?.trim() ?? '').replace(/\/+$/, '');
  const url = new URL(`${base}/v1/search`);
  url.searchParams.set('q', q);
  url.searchParams.set('limit', '8');
  if (near) {
    url.searchParams.set('lat', String(near.lat));
    url.searchParams.set('lng', String(near.lon));
  }
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'X-TREK-Instance': 'splitbon' },
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!res.ok) return [];
  const body = (await res.json()) as { results?: RawHit[] };
  return body.results ?? [];
}

/**
 * Longest query first; a variant only counts when the name of a hit contains its first word, because
 * the index ranks by closeness and otherwise answers a long query with whatever stands next door.
 */
export async function searchPlacesIndex(
  q: string,
  near: { lat: number; lon: number } | null,
  signal?: AbortSignal,
): Promise<PlaceHit[]> {
  if (process.env.PLACES_API_ENABLED?.trim().toLowerCase() === 'false') return [];
  if (!process.env.PLACES_API_URL?.trim()) return [];
  const first = q.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  if (first.length < 2) return [];
  // With a position, a hit within NEAR_METERS of it beats a better-named one on the other side of the
  // world; far hits are only the fallback when no variant finds anything close.
  let farFallback: PlaceHit[] = [];
  for (const variant of queryVariants(q.trim())) {
    let raw: RawHit[];
    try {
      raw = await fetchHits(variant, near, signal);
    } catch {
      return farFallback;
    }
    const hits = raw
      .filter(
        (h) => h.name && typeof h.lat === 'number' && typeof h.lng === 'number' && h.name.toLowerCase().includes(first),
      )
      .map((h) => ({
        name: h.name as string,
        lat: h.lat as number,
        lon: h.lng as number,
        category: h.category ?? null,
        distance: near ? distanceMeters(near.lat, near.lon, h.lat as number, h.lng as number) : null,
      }));
    if (!near) {
      if (hits.length > 0) return hits;
      continue;
    }
    hits.sort((x, y) => (x.distance ?? 0) - (y.distance ?? 0));
    const close = hits.filter((h) => (h.distance ?? 0) <= NEAR_METERS);
    if (close.length > 0) return close.slice(0, 8);
    if (farFallback.length === 0) farFallback = hits;
  }
  return farFallback;
}
