import { useEffect, useRef } from 'react';
import type { BeatRow } from '@/lib/data';
import { t } from '@/i18n';

type Props = { plan: BeatRow[]; visited: Map<string, string> };

function statusColor(s?: string) {
  if (s === 'completed')  return '#22c55e';
  if (s === 'in_progress') return '#f97316';
  if (s === 'skipped')    return '#ef4444';
  return '#3b82f6';
}

function markerHtml(n: number, color: string) {
  return `<div style="width:32px;height:32px;border-radius:50%;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.4);font-family:inherit">${n}</div>`;
}

const LEGEND = [
  { color: '#22c55e', label: 'completed' as const },
  { color: '#f97316', label: 'in_progress' as const },
  { color: '#ef4444', label: 'skipped' as const },
  { color: '#3b82f6', label: 'pending' as const },
] as const;

const LEGEND_LABELS: Record<string, string> = {
  completed: 'مكتملة',
  in_progress: 'جارية',
  skipped: 'ملغاة',
  pending: 'قادمة',
};

export default function BeatMap({ plan, visited }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    let cancelled = false;

    // inject Leaflet CSS once
    if (!document.getElementById('lf-css')) {
      const lnk = document.createElement('link');
      lnk.id = 'lf-css';
      lnk.rel = 'stylesheet';
      lnk.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(lnk);
    }

    import('leaflet').then((mod) => {
      if (cancelled || !ref.current) return;
      const L = (mod as unknown as { default?: typeof import('leaflet') }).default ?? mod;

      const map = (L as typeof import('leaflet')).map(ref.current!);
      (L as typeof import('leaflet')).tileLayer(
        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        { attribution: '© OpenStreetMap', maxZoom: 19 },
      ).addTo(map);

      const points: [number, number][] = [];

      plan.forEach((b, i) => {
        const c = b.customers;
        if (!c?.latitude || !c?.longitude) return;
        const ll: [number, number] = [c.latitude, c.longitude];
        points.push(ll);

        const color = statusColor(visited.get(b.customer_id));
        const icon = (L as typeof import('leaflet')).divIcon({
          html: markerHtml(i + 1, color),
          className: '',
          iconSize: [32, 32],
          iconAnchor: [16, 16],
          popupAnchor: [0, -20],
        });

        (L as typeof import('leaflet'))
          .marker(ll, { icon })
          .addTo(map)
          .bindPopup(
            `<div style="font-family:inherit;min-width:140px"><b>${c.name}</b><br><span style="color:#888;font-size:12px">${c.address ?? ''}</span></div>`,
          );
      });

      if (points.length > 1) {
        (L as typeof import('leaflet'))
          .polyline(points, { color: '#6366f1', weight: 3, dashArray: '10 7', opacity: 0.8 })
          .addTo(map);
      }

      if (points.length > 0) {
        map.fitBounds(
          (L as typeof import('leaflet')).latLngBounds(points),
          { padding: [44, 44] },
        );
      } else {
        map.setView([30.0444, 31.2357], 10);
      }

      // cleanup
      (ref.current as HTMLDivElement & { _lmap?: typeof map })._lmap = map;
    });

    return () => {
      cancelled = true;
      const el = ref.current as (HTMLDivElement & { _lmap?: { remove(): void } }) | null;
      el?._lmap?.remove();
    };
  }, [plan, visited]);

  return (
    <div style={{ position: 'relative' }}>
      <div ref={ref} style={{ height: 'calc(100dvh - 180px)', borderRadius: 12, overflow: 'hidden' }} />
      {/* legend */}
      <div style={{
        position: 'absolute', bottom: 12, left: 12, zIndex: 1000,
        background: 'rgba(255,255,255,.92)', borderRadius: 10, padding: '8px 12px',
        display: 'flex', flexDirection: 'column', gap: 4, backdropFilter: 'blur(4px)',
        boxShadow: '0 2px 8px rgba(0,0,0,.15)',
      }}>
        {LEGEND.map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: color, flexShrink: 0 }} />
            <span>{t(LEGEND_LABELS[label])}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
