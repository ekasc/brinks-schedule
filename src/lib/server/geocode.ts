import { env } from '$env/dynamic/private';

export type Coords = { lat: number; lng: number };

export interface Suggestion {
  label: string;
  lat: number;
  lng: number;
}

// In-process cache so we never geocode the same address twice per server lifetime.
const cache = new Map<string, Coords | null>();

// Provider is chosen at runtime. Default is photon (free, no key, typo-tolerant).
// Set GEOCODER=nominatim to use Nominatim, or GEOCODER=none to disable.
const provider = (env.GEOCODER || 'photon').toLowerCase();
const userAgent = env.GEOCODER_UA || 'schedule/1.0 (scheduling app)';
const countrycodes = env.GEOCODER_COUNTRY || 'ca'; // used only by nominatim

// Throttling is per upstream provider, not per operation — photon and nominatim
// have independent rate limits. Within a provider, geocode and autocomplete share
// the same bucket (the provider does not distinguish them). This is still
// per-isolate, not global across isolates, so it is best-effort.
let lastCallPhoton = 0;
let lastCallNominatim = 0;
async function throttlePhoton(minGapMs = 200) {
  const wait = lastCallPhoton + minGapMs - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallPhoton = Date.now();
}
async function throttleNominatim(minGapMs = 1100) {
  const wait = lastCallNominatim + minGapMs - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallNominatim = Date.now();
}

function photonLabel(p: Record<string, unknown>): string {
  const name = (p.name as string) || '';
  const street = (p.street as string) || '';
  const hn = (p.housenumber as string) || '';
  const city = (p.city as string) || (p.locality as string) || '';
  const state = (p.state as string) || '';
  const country = (p.country as string) || '';
  const postcode = (p.postcode as string) || '';
  const parts = [
    hn && street ? `${hn} ${street}` : street || name,
    city,
    state,
    [postcode, country].filter(Boolean).join(' ')
  ].filter(Boolean);
  return parts.join(', ') || name || (p.osm_value as string) || '';
}

/**
 * Resolve an address to coordinates. Never throws — returns null on any failure
 * (offline, rate-limited, unknown address) so callers stay best-effort.
 */
export async function geocode(address: string): Promise<Coords | null> {
  if ((globalThis as any).navigator?.userAgent === 'Miniflare') return null;
  const key = address.trim().toLowerCase();
  if (!key) return null;
  if (cache.has(key)) return cache.get(key)!;

  let result: Coords | null = null;
  if (provider === 'photon') {
    try {
      await throttlePhoton(200);
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(address)}&limit=1&lang=en`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const data = (await res.json()) as { features: Array<{ geometry: { coordinates: [number, number] } }> };
        if (data.features?.length) {
          const [lng, lat] = data.features[0].geometry.coordinates;
          result = { lat, lng };
        }
      }
    } catch {
      result = null;
    }
  } else if (provider === 'nominatim') {
    try {
      await throttleNominatim();
      const url =
        'https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=0' +
        '&countrycodes=' + encodeURIComponent(countrycodes) +
        '&q=' + encodeURIComponent(address);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(url, {
        headers: { 'User-Agent': userAgent, Accept: 'application/json' },
        signal: controller.signal
      });
      clearTimeout(timer);
      if (res.ok) {
        const arr = (await res.json()) as Array<{ lat: string; lon: string }>;
        if (arr.length) result = { lat: parseFloat(arr[0].lat), lng: parseFloat(arr[0].lon) };
      }
    } catch {
      result = null;
    }
  }
  // Only cache successful lookups. Caching a miss would let a transient geocoder
  // outage permanently deny a valid address (and defeat the book-action retry).
  if (result) cache.set(key, result);
  return result;
}

/**
 * Address autocomplete — returns up to `limit` candidate matches for a partial
 * query. Same provider gating as geocode(): only Nominatim is supported, and it
 * is a no-op (empty list) unless GEOCODER=nominatim.
 */
export async function autocomplete(query: string, limit = 5): Promise<Suggestion[]> {
  const q = query.trim();
  if (!q || provider === 'none') return [];
  if (provider === 'photon') {
    try {
      await throttlePhoton(200);
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=${Math.min(limit, 10)}&lang=en`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return [];
      const data = (await res.json()) as {
        features: Array<{ geometry: { coordinates: [number, number] }; properties: Record<string, unknown> }>;
      };
      return (data.features || []).slice(0, limit).map((f) => {
        const [lng, lat] = f.geometry.coordinates;
        return { label: photonLabel(f.properties), lat, lng };
      }).filter((s) => s.label);
    } catch {
      return [];
    }
  }
  // nominatim fallback
  try {
    await throttleNominatim();
    const url =
      'https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=' +
      Math.min(limit, 10) +
      '&countrycodes=' + encodeURIComponent(countrycodes) +
      '&q=' + encodeURIComponent(q);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, {
      headers: { 'User-Agent': userAgent, Accept: 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const arr = (await res.json()) as Array<{ display_name: string; lat: string; lon: string }>;
    return arr
      .slice(0, limit)
      .map((r) => ({ label: r.display_name, lat: parseFloat(r.lat), lng: parseFloat(r.lon) }));
  } catch {
    return [];
  }
}
