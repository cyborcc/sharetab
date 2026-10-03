'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { LocateFixed, MapPin, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export type PlaceValue = { placeName: string; latitude: number | null; longitude: number | null };

type Hit = { display_name: string; lat: string; lon: string };

const NOMINATIM = 'https://nominatim.openstreetmap.org';

export function osmLink(lat: number, lon: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`;
}

function shortName(displayName: string): string {
  return displayName.split(', ').slice(0, 3).join(', ');
}

/** Place search via OpenStreetMap (Nominatim) plus "use my location" through the browser's GPS. */
export function LocationField({ value, onChange }: { value: PlaceValue; onChange: (value: PlaceValue) => void }) {
  const t = useTranslations('expenses');
  const locale = useLocale();
  const [query, setQuery] = useState(value.placeName);
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounced search while typing; skipped once a place with coordinates is chosen
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3 || (value.latitude !== null && q === value.placeName)) {
      setHits([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `${NOMINATIM}/search?format=jsonv2&limit=5&accept-language=${locale}&q=${encodeURIComponent(q)}`,
          { signal: controller.signal },
        );
        if (res.ok) setHits((await res.json()) as Hit[]);
      } catch {
        // aborted or offline: the typed text is still kept as the place name
      }
    }, 500);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, locale, value.latitude, value.placeName]);

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
        <Button type="button" variant="outline" size="icon" disabled={busy} onClick={useMyLocation} aria-label={t('new.locationUse')}>
          <LocateFixed className="h-4 w-4" />
        </Button>
        {(query || value.latitude !== null) && (
          <Button type="button" variant="ghost" size="icon" onClick={clear} aria-label={t('new.locationClear')}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      {hits.length > 0 && (
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
