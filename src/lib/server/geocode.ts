// very small in-process geocoder cache. NO external API. just zeros for v1
// (jobs still save + display fine; "drive X min" shows only once we have lat/lng).
// a real geocoder can be slotted in here later without changing call sites.
const cache = new Map<string, { lat: number; lng: number } | null>();

export function geocode(address: string): { lat: number; lng: number } | null {
  const key = address.trim().toLowerCase();
  if (!key) return null;
  if (cache.has(key)) return cache.get(key)!;
  // TODO: wire to a real geocoder (nominatim, google, etc.)
  cache.set(key, null);
  return null;
}
