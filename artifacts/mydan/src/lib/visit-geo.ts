import { distanceMeters } from './policy.ts';

/** Exactly the values allowed by visits_visit_outcome_check (and read by the Power BI views). */
export const VISIT_OUTCOMES = [
  { value: 'متعامل', label: 'متعامل', dot: '🟢', badge: 'b-green' },
  { value: 'غير متعامل', label: 'غير متعامل', dot: '🔴', badge: 'b-red' },
  { value: 'غير موجود', label: 'غير موجود', dot: '⚫', badge: 'b-gray' },
] as const;
export type VisitOutcome = typeof VISIT_OUTCOMES[number]['value'];
export const isVisitOutcome = (v: unknown): v is VisitOutcome => VISIT_OUTCOMES.some((o) => o.value === v);

export const NEAREST_LIMITS = [5, 10, 15, 20, 'all'] as const;
export type NearestLimit = typeof NEAREST_LIMITS[number];

type Located = { latitude: number | null; longitude: number | null };

/** Haversine distance in km, rounded to 2 decimals. */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return Math.round(distanceMeters(lat1, lon1, lat2, lon2) / 10) / 100;
}

/**
 * Customers with coordinates, nearest first, cut to `limit`.
 * Customers without coordinates cannot be ranked and are left out.
 */
export function nearestCustomers<T extends Located>(rows: T[], lat: number, lon: number, limit: NearestLimit): (T & { distance_km: number })[] {
  const ranked = rows
    .filter((c): c is T & { latitude: number; longitude: number } => Number.isFinite(c.latitude) && Number.isFinite(c.longitude))
    .map((c) => ({ ...c, distance_km: distanceKm(lat, lon, c.latitude, c.longitude) }))
    .sort((a, b) => a.distance_km - b.distance_km);
  return limit === 'all' ? ranked : ranked.slice(0, limit);
}

/** Geofence check for a check-in; distance is null when the outlet has no coordinates. */
export function geofence(gps: { latitude: number; longitude: number }, outlet: Located, radiusM: number) {
  if (!Number.isFinite(outlet.latitude) || !Number.isFinite(outlet.longitude)) return { distance_m: null, on_beat: false };
  const distance_m = Math.round(distanceMeters(gps.latitude, gps.longitude, outlet.latitude!, outlet.longitude!));
  return { distance_m, on_beat: distance_m <= radiusM };
}

export const mapsDirectionsUrl = (lat: number, lon: number) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
