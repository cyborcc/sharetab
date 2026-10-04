'use client';

import { useEffect, useRef, useState } from 'react';

export type MapPoint = { id: string; title: string; amount: string; lat: number; lon: number };

type LeafletLayer = { addTo: (map: LeafletMap) => LeafletLayer; bindPopup: (content: HTMLElement) => LeafletLayer };
type LeafletMap = { fitBounds: (bounds: [number, number][], opts?: object) => void; remove: () => void };
type LeafletLib = {
  map: (el: HTMLElement, opts?: object) => LeafletMap;
  tileLayer: (url: string, opts?: object) => LeafletLayer;
  marker: (latlng: [number, number]) => LeafletLayer;
};

const LEAFLET_JS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
const LEAFLET_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';

function loadLeaflet(): Promise<LeafletLib> {
  const w = window as unknown as { L?: LeafletLib };
  if (w.L) return Promise.resolve(w.L);
  return new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = LEAFLET_CSS;
      document.head.appendChild(css);
    }
    const script = document.createElement('script');
    script.src = LEAFLET_JS;
    script.onload = () => (w.L ? resolve(w.L) : reject(new Error('leaflet')));
    script.onerror = () => reject(new Error('leaflet'));
    document.head.appendChild(script);
  });
}

/** Map with one pin per expense that has coordinates (Leaflet from cdnjs, OpenStreetMap tiles). */
export function ExpenseMap({ points, errorText }: { points: MapPoint[]; errorText: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let map: LeafletMap | null = null;
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !ref.current) return;
        map = L.map(ref.current, { scrollWheelZoom: false });
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap',
        }).addTo(map);
        for (const p of points) {
          const el = document.createElement('div');
          const title = document.createElement('strong');
          title.textContent = p.title;
          const amount = document.createElement('div');
          amount.textContent = p.amount;
          el.append(title, amount);
          L.marker([p.lat, p.lon]).addTo(map).bindPopup(el);
        }
        map.fitBounds(
          points.map((p) => [p.lat, p.lon] as [number, number]),
          { padding: [30, 30], maxZoom: 15 },
        );
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [points]);

  if (failed) return <p className="text-sm text-muted-foreground">{errorText}</p>;
  return <div ref={ref} className="h-72 w-full overflow-hidden rounded-lg border" />;
}
