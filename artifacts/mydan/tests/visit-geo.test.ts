import test from 'node:test';
import assert from 'node:assert/strict';
import { distanceKm, geofence, isVisitOutcome, mapsDirectionsUrl, nearestCustomers, VISIT_OUTCOMES } from '../src/lib/visit-geo.ts';

// Alexandria reference points.
const here = { latitude: 31.2156, longitude: 29.9450 };
const rows = [
  { id: 'far', latitude: 31.1979, longitude: 29.8945 },
  { id: 'near', latitude: 31.2160, longitude: 29.9455 },
  { id: 'mid', latitude: 31.2447, longitude: 29.9672 },
  { id: 'nocoords', latitude: null, longitude: null },
];

test('nearest customers are sorted ascending and customers without coordinates are skipped', () => {
  const r = nearestCustomers(rows, here.latitude, here.longitude, 'all');
  assert.deepEqual(r.map((c) => c.id), ['near', 'mid', 'far']);
  for (let i = 1; i < r.length; i++) assert.ok(r[i - 1].distance_km <= r[i].distance_km);
});
test('limit cuts the ranked list; all keeps every located customer', () => {
  assert.equal(nearestCustomers(rows, here.latitude, here.longitude, 5).length, 3);
  assert.deepEqual(nearestCustomers(rows, here.latitude, here.longitude, 5).slice(0, 1).map((c) => c.id), ['near']);
  const many = Array.from({ length: 30 }, (_, i) => ({ id: String(i), latitude: 31 + i / 1000, longitude: 29.9 }));
  assert.equal(nearestCustomers(many, 31, 29.9, 15).length, 15);
  assert.equal(nearestCustomers(many, 31, 29.9, 'all').length, 30);
});
test('distance is Haversine km rounded to 2 decimals', () => {
  assert.equal(distanceKm(0, 0, 0, 0), 0);
  const d = distanceKm(here.latitude, here.longitude, 31.1979, 29.8945);
  assert.equal(d, Math.round(d * 100) / 100);
  assert.ok(d > 5 && d < 6, `expected ~5.1 km, got ${d}`);
});
test('geofence flags on_beat by radius and refuses to guess without outlet coordinates', () => {
  assert.equal(geofence(here, { latitude: 31.2160, longitude: 29.9455 }, 100).on_beat, true);
  assert.equal(geofence(here, { latitude: 31.2447, longitude: 29.9672 }, 500).on_beat, false);
  assert.deepEqual(geofence(here, { latitude: null, longitude: null }, 500), { distance_m: null, on_beat: false });
});
test('visit outcomes match the database CHECK constraint exactly', () => {
  assert.deepEqual(VISIT_OUTCOMES.map((o) => o.value), ['متعامل', 'غير متعامل', 'غير موجود']);
  assert.equal(isVisitOutcome('متعامل'), true);
  assert.equal(isVisitOutcome('cancelled'), false);
});
test('maps link opens Google Maps directions to the outlet', () => {
  assert.equal(mapsDirectionsUrl(31.2, 29.9), 'https://www.google.com/maps/dir/?api=1&destination=31.2,29.9');
});
