import { env } from '$env/dynamic/private';

export type Coords = { lat: number; lng: number };

export interface Suggestion {
  label: string;
  lat: number;
  lng: number;
  postal_code?: string | null;
  street?: string | null;
  city?: string | null;
  province?: string | null;
}

const PROVINCE_ABBR: Record<string, string> = {
  'alberta': 'AB', 'british columbia': 'BC', 'manitoba': 'MB', 'new brunswick': 'NB', 'newfoundland and labrador': 'NL',
  'nova scotia': 'NS', 'ontario': 'ON', 'prince edward island': 'PE', 'quebec': 'QC', 'saskatchewan': 'SK',
  'northwest territories': 'NT', 'nunavut': 'NU', 'yukon': 'YT', 'colombie-britannique': 'BC', 'alberta ': 'AB'
};
function provinceToAbbr(s: string): string {
  const t = s.trim().toLowerCase();
  if (t.length === 2) return t.toUpperCase();
  return PROVINCE_ABBR[t] || s.slice(0, 2).toUpperCase();
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
  // Postcode from OSM/Photon is interpolated and often wrong in Vancouver (V6A vs V6A 2S7 etc).
  // Hide it in suggestions - lat/lng is still correct for the map, user can type postcode manually if needed.
  const parts = [hn && street ? `${hn} ${street}` : street || name, city, state, country].filter(Boolean);
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
      // Bias to BC - all Brinks jobs are in BC. Lat/lon + bbox keeps Photon from returning
      // Ontario / Alberta hits for generic street names.
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(address)}&limit=1&lang=en&lat=53.7267&lon=-127.6476&bbox=-139,48,-114,60`;
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
        '&viewbox=-139,60,-114,48&bounded=0' +
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
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=${Math.min(limit, 10)}&lang=en&lat=53.7267&lon=-127.6476&bbox=-139,48,-114,60`;
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
        const p = f.properties as Record<string, string>;
        const pc = (p.postcode as string) || null;
        const hn = (p.housenumber as string) || '';
        const st = (p.street as string) || (p.name as string) || '';
        const street = hn && st ? `${hn} ${st}` : st;
        const city = (p.city as string) || (p.locality as string) || null;
        const prov = (p.state as string) ? provinceToAbbr(p.state as string) : null;
        return { label: photonLabel(f.properties), lat, lng, postal_code: pc ? String(pc).toUpperCase().trim() : null, street: street || null, city: city || null, province: prov };
      }).filter((s) => s.label);
    } catch {
      return [];
    }
  }
  // nominatim fallback - bias to Vancouver viewbox (bounded=0 = prefer, not strictly filter)
  try {
    await throttleNominatim();
    const url =
      'https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=' +
      Math.min(limit, 10) +
      '&countrycodes=' + encodeURIComponent(countrycodes) +
      '&viewbox=-139,60,-114,48&bounded=0' +
      '&q=' + encodeURIComponent(q);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, {
      headers: { 'User-Agent': userAgent, Accept: 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const arr = (await res.json()) as Array<{ display_name: string; lat: string; lon: string; address?: { road?: string; house_number?: string; city?: string; town?: string; village?: string; state?: string; postcode?: string } }>;
    return arr
      .slice(0, limit)
      .map((r) => {
        const a: any = r.address || {};
        const street = a.house_number && a.road ? `${a.house_number} ${a.road}` : a.road || null;
        const city = a.city || a.town || a.village || null;
        const prov = a.state ? provinceToAbbr(a.state) : null;
        return { label: r.display_name, lat: parseFloat(r.lat), lng: parseFloat(r.lon), postal_code: a.postcode ? String(a.postcode).toUpperCase().trim() : null, street, city, province: prov };
      });
  } catch {
    return [];
  }
}
