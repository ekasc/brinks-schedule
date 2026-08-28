// haversine + 1.4 road factor. good enough for same-metro drives.
const R_KM = 6371;
const ROAD_FACTOR = 1.4;
const AVG_KMH = 35; // mixed urban + arterial

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.sqrt(s));
}

export function travelMinutes(a: { lat: number | null; lng: number | null }, b: { lat: number | null; lng: number | null }): number | null {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
  const km = haversineKm({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }) * ROAD_FACTOR;
  return Math.round((km / AVG_KMH) * 60);
}

export function isTight(prev: { ends_at: number; lat: number | null; lng: number | null }, next: { starts_at: number; lat: number | null; lng: number | null }): boolean {
  const t = travelMinutes(prev, next);
  if (t == null) return false;
  return t > (next.starts_at - prev.ends_at) / 60;
}
