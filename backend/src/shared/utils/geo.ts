/**
 * Haversine distance between two GPS coordinates.
 * Returns distance in metres.
 */
export function haversineMeters(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 6_371_000; // Earth radius in metres
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Returns true when the given point is within radiusMeters of the centre.
 */
export function isWithinRadius(
  centreLat: number, centreLon: number, radiusMeters: number,
  pointLat:  number, pointLon:  number,
): boolean {
  return haversineMeters(centreLat, centreLon, pointLat, pointLon) <= radiusMeters;
}
