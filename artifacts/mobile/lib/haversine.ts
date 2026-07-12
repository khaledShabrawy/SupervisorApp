/**
 * Calculate distance in kilometers between two GPS coordinates.
 * Haversine formula.
 */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Format distance for display (meters if < 1km, else km) */
export function formatDistance(distanceKilometers: number): string {
  const meters = distanceKilometers * 1000;
  if (meters < 1000) {
    return `${Math.round(meters)} م`;
  }
  return `${distanceKilometers.toFixed(1)} كم`;
}
