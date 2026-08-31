// Pure geo helpers shared by client (route planner) and server.

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// Straight-line distance underestimates real driving distance; the road factor
// (default 1.3) nudges it closer to on-the-ground travel.
// Defaults are intentionally not inlined — see lib/geo/travelModel.ts for the
// single source of TravelModel vs Feasibility.
import { TRAVEL_MODEL } from './geo/travelModel';
export function travelMinutes(distKm: number, speedKmh: number = TRAVEL_MODEL.speedKmh, roadFactor: number = TRAVEL_MODEL.roadFactor): number {
  if (!speedKmh || speedKmh <= 0) return 0;
  return Math.max(1, Math.round((distKm * roadFactor) / speedKmh * 60));
}

export function fmtDist(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

export function fmtMin(min: number): string {
  min = Math.round(min);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
