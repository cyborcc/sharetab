'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Compass, History, LocateFixed, MapPin, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { nearbyFilters } from '@/lib/categories';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export type PlaceValue = { placeName: string; latitude: number | null; longitude: number | null };

type Hit = { display_name: string; lat: string; lon: string };
type Anchor = { lat: number; lon: number };

/** Half-width in degrees of the box around the anchor that the search prefers (about 30 km). */
const NEAR_DEGREES = 0.3;

const NOMINATIM = 'https://nominatim.openstreetmap.org';

export function osmLink(lat: number, lon: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`;
}

function shortName(displayName: string): string {
  return displayName.split(', ').slice(0, 3).join(', ');
}

const OVERPASS_URLS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const NEARBY_RADIUS_M = 1000;

type Nearby = { name: string; lat: number; lon: number; distance: number };

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.sqrt(a));
}

async function fetchNearby(lat: number, lon: number, filters: string[]): Promise<Nearby[]> {
  const parts = filters.map((f) => `nwr(around:${NEARBY_RADIUS_M},${lat},${lon})[${f}][name];`).join('');
  const body = `data=${encodeURIComponent(`[out:json][timeout:20];(${parts});out center tags 60;`)}`;
  for (const url of OVERPASS_URLS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        elements: { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: { name?: string } }[];
      };
      const seen = new Set<string>();
      const places: Nearby[] = [];
      for (const el of data.elements) {
        const elLat = el.lat ?? el.center?.lat;
        const elLon = el.lon ?? el.center?.lon;
        const name = el.tags?.name;
        if (elLat === undefined || elLon === undefined || !name || seen.has(name)) continue;
        seen.add(name);
        places.push({ name, lat: elLat, lon: elLon, distance: distanceMeters(lat, lon, elLat, elLon) });
      }
      return places.sort((a, b) => a.distance - b.distance).slice(0, 8);
    } catch {
      // try the next mirror
    }
  }
  throw new Error('overpass');
}

async function nominatimSearch(
  q: string,
  locale: string,
  signal: AbortSignal,
  anchor: Anchor | null,
  bounded: boolean,
): Promise<Hit[]> {
  const box = anchor
    ? `&viewbox=${anchor.lon - NEAR_DEGREES},${anchor.lat + NEAR_DEGREES},${anchor.lon + NEAR_DEGREES},${anchor.lat - NEAR_DEGREES}${bounded ? '&bounded=1' : ''}`
    : '';
  const res = await fetch(
    `${NOMINATIM}/search?format=jsonv2&limit=5&accept-language=${locale}&q=${encodeURIComponent(q)}${box}`,
    { signal },
  );
  return res.ok ? ((await res.json()) as Hit[]) : [];
}

/** Name search in OpenStreetMap around the anchor, for venues Nominatim does not find by text. */
async function overpassNameSearch(words: string[], anchor: Anchor, signal: AbortSignal): Promise<Hit[]> {
  const escaped = words.slice(0, 2).map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''));
  if (escaped.some((w) => w.length < 2)) return [];
  const regex = escaped.join('.*');
  const body = `data=${encodeURIComponent(
    `[out:json][timeout:20];nwr(around:25000,${anchor.lat},${anchor.lon})["name"~"${regex}",i];out center tags 10;`,
  )}`;
  for (const url of OVERPASS_URLS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal,
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        elements: { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: { name?: string } }[];
      };
      return data.elements.flatMap((el) => {
        const lat = el.lat ?? el.center?.lat;
        const lon = el.lon ?? el.center?.lon;
        return lat === undefined || lon === undefined || !el.tags?.name
          ? []
          : [{ display_name: el.tags.name, lat: String(lat), lon: String(lon) }];
      });
    } catch (err) {
      if (signal.aborted) throw err;
    }
  }
  return [];
}

/**
 * Staged place search. A long free-text query such as "White Elephant Thai Restaurant el gouna" often
 * finds nothing in Nominatim, so with an anchor (the group's accommodation or last place) it tries,
 * strictly inside the box around it, the query and then shorter versions of it, then the whole world,
 * and finally a name search in OpenStreetMap around the anchor.
 */
async function searchPlaces(q: string, locale: string, signal: AbortSignal, anchor: Anchor | null): Promise<Hit[]> {
  const words = q.split(/\s+/).filter(Boolean);
  const variants: string[] = [];
  for (let n = words.length; n >= Math.min(words.length, 2) && variants.length < 4; n--) {
    variants.push(words.slice(0, n).join(' '));
  }
  if (anchor) {
    for (const v of variants) {
      const hits = await nominatimSearch(v, locale, signal, anchor, true);
      if (hits.length > 0) return hits;
    }
  }
  const world = await nominatimSearch(q, locale, signal, anchor, false);
  if (world.length > 0 && !anchor) return world;
  if (anchor) {
    const named = await overpassNameSearch(words, anchor, signal);
    if (named.length > 0) return named;
    return world;
  }
  for (const v of variants.slice(1)) {
    const hits = await nominatimSearch(v, locale, signal, null, false);
    if (hits.length > 0) return hits;
  }
  return [];
}

function currentPosition(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('unsupported'));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      reject,
      { enableHighAccuracy: true, timeout: 15000 },
    );
  });
}

/**
 * Place search via OpenStreetMap (Nominatim), "use my location" through the browser's GPS, and
 * nearby places that fit the chosen category (OpenStreetMap via Overpass).
 */
export function LocationField({
  value,
  onChange,
  category,
  suggestion,
  autoPick = false,
  groupId,
}: {
  value: PlaceValue;
  onChange: (value: PlaceValue) => void;
  category?: string;
  /** Offers the group's recently visited places (of this category) as one-tap choices */
  groupId?: string;
  /** Pre-filled search text, e.g. merchant name and address read from a receipt */
  suggestion?: string;
  /** Take the best match of the suggestion automatically (only sensible for precise addresses) */
  autoPick?: boolean;
}) {
  const t = useTranslations('expenses');
  const locale = useLocale();
  const [query, setQuery] = useState(value.placeName || suggestion || '');
  const autoPicked = useRef(false);
  // Silent position hint (only if location access was already granted) so chain names resolve nearby
  const [bias, setBias] = useState<Anchor | null>(null);
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nearby, setNearby] = useState<Nearby[] | null>(null);
  const filters = nearbyFilters(category);
  const recent = trpc.expenses.recentPlaces.useQuery(
    { groupId: groupId ?? '', ...(category?.trim() ? { category: category.trim() } : {}) },
    { enabled: !!groupId, staleTime: 60_000 },
  );
  // Where to look first: the group's accommodation or last place, else the device position (if allowed)
  const groupAnchor = trpc.expenses.placeAnchor.useQuery(
    { groupId: groupId ?? '' },
    { enabled: !!groupId, staleTime: 300_000 },
  );
  const anchor: Anchor | null = groupAnchor.data ?? bias;
  const searching = query.trim().length >= 3 && !(value.latitude !== null && query.trim() === value.placeName);

  async function findNearby() {
    if (!filters) return;
    setError(null);
    setBusy(true);
    try {
      // Anchor: the chosen place if it has coordinates, otherwise the device position
      const anchor =
        value.latitude !== null && value.longitude !== null
          ? { latitude: value.latitude, longitude: value.longitude }
          : await currentPosition();
      const places = await fetchNearby(anchor.latitude, anchor.longitude, filters);
      setNearby(places);
      if (places.length === 0) setError(t('new.nearbyNone'));
    } catch {
      setError(t('new.nearbyFailed'));
    } finally {
      setBusy(false);
    }
  }

  function pickNearby(p: Nearby) {
    setQuery(p.name);
    setNearby(null);
    setHits([]);
    onChange({ placeName: p.name, latitude: p.lat, longitude: p.lon });
  }

  useEffect(() => {
    if (!suggestion || !navigator.permissions) return;
    navigator.permissions
      .query({ name: 'geolocation' })
      .then((status) => {
        if (status.state !== 'granted') return;
        navigator.geolocation.getCurrentPosition((pos) =>
          setBias({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        );
      })
      .catch(() => undefined);
  }, [suggestion]);

  // Debounced search while typing; skipped once a place with coordinates is chosen
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3 || (value.latitude !== null && q === value.placeName)) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const found = await searchPlaces(q, locale, controller.signal, anchor);
        setHits(found);
        const best = found[0];
        if (autoPick && !autoPicked.current && best && value.latitude === null) {
          autoPicked.current = true;
          pick(best);
        }
      } catch {
        // aborted or offline: the typed text is still kept as the place name
      }
    }, 500);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pick() only forwards to the stable onChange
  }, [query, locale, value.latitude, value.placeName, anchor?.lat, anchor?.lon, autoPick]);

  function pickRecent(p: { placeName: string; latitude: number | null; longitude: number | null }) {
    autoPicked.current = true; // a recent place replaces the receipt's address guess
    setQuery(p.placeName);
    setHits([]);
    setNearby(null);
    onChange({ placeName: p.placeName, latitude: p.latitude, longitude: p.longitude });
  }

  function pick(hit: Hit) {
    const name = shortName(hit.display_name);
    setQuery(name);
    setHits([]);
    onChange({ placeName: name, latitude: Number(hit.lat), longitude: Number(hit.lon) });
  }

  function useMyLocation() {
    setError(null);
    if (!navigator.geolocation) {
      setError(t('new.locationUnavailable'));
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        let name = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
        try {
          const res = await fetch(
            `${NOMINATIM}/reverse?format=jsonv2&zoom=18&accept-language=${locale}&lat=${latitude}&lon=${longitude}`,
          );
          if (res.ok) {
            const data = (await res.json()) as { display_name?: string };
            if (data.display_name) name = shortName(data.display_name);
          }
        } catch {
          // keep coordinates as the name
        }
        setQuery(name);
        setHits([]);
        onChange({ placeName: name, latitude, longitude });
        setBusy(false);
      },
      () => {
        setError(t('new.locationDenied'));
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  function clear() {
    setQuery('');
    setHits([]);
    onChange({ placeName: '', latitude: null, longitude: null });
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <MapPin className="pointer-events-none absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            id="location"
            className="pl-8"
            placeholder={t('new.locationPlaceholder')}
            value={query}
            maxLength={200}
            onChange={(e) => {
              setQuery(e.target.value);
              onChange({ placeName: e.target.value, latitude: null, longitude: null });
            }}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={busy}
          onClick={useMyLocation}
          aria-label={t('new.locationUse')}
        >
          <LocateFixed className="h-4 w-4" />
        </Button>
        {(query || value.latitude !== null) && (
          <Button type="button" variant="ghost" size="icon" onClick={clear} aria-label={t('new.locationClear')}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      {recent.data && recent.data.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" data-testid="recent-places">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <History className="h-3 w-3" />
            {t('new.recentPlaces')}
          </span>
          {recent.data.map((p) => {
            const active = value.placeName.trim().toLowerCase() === p.placeName.toLowerCase();
            return (
              <button
                key={p.placeName}
                type="button"
                onClick={() => pickRecent(p)}
                title={p.visits > 1 ? t('new.recentPlaceVisits', { count: p.visits }) : p.placeName}
                className={`max-w-[14rem] truncate rounded-full px-2 py-0.5 text-xs transition-colors ${
                  active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {p.placeName.split(', ')[0]}
                {p.visits > 1 && <span className="opacity-70"> ·{p.visits}×</span>}
              </button>
            );
          })}
        </div>
      )}
      {filters && (
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={findNearby}>
          <Compass className="mr-2 h-4 w-4" />
          {busy ? t('new.nearbyLoading') : t('new.nearbyFind')}
        </Button>
      )}
      {nearby && nearby.length > 0 && (
        <ul className="divide-y rounded-md border bg-background text-sm shadow-sm">
          {nearby.map((p) => (
            <li key={`${p.name}-${p.lat}`}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted"
                onClick={() => pickNearby(p)}
              >
                <span className="truncate">{p.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {p.distance < 1000 ? `${Math.round(p.distance / 10) * 10} m` : `${(p.distance / 1000).toFixed(1)} km`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {searching && hits.length > 0 && (
        <ul className="divide-y rounded-md border bg-background text-sm shadow-sm">
          {hits.map((h, i) => (
            <li key={i}>
              <button type="button" className="w-full px-3 py-2 text-left hover:bg-muted" onClick={() => pick(h)}>
                {h.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {value.latitude !== null && value.longitude !== null && (
        <a
          href={osmLink(value.latitude, value.longitude)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <MapPin className="h-3 w-3" />
          {t('new.locationOnMap')}
        </a>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
