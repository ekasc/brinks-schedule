// Travel estimation vs feasibility — separate concerns, shared only where intentional.
//
// TravelModel: deterministic drive-time from distance. Feasibility: whether a gap
// is enough given drive time + margin. Differences are allowed but must be
// explicit imports, not silent defaults.
//
// Invariants:
// - Drive time is deterministic for (distance, speedKmh, roadFactor).
// - Leg feasible iff gapMin >= driveMin(travelModel) + FEASIBILITY.marginMin.

export const TRAVEL_MODEL = {
  // Straight-line speed and road factor. Used by both server tight-check and
  // route planner. Change here affects both — intentional.
  speedKmh: 45,
  roadFactor: 1.3
} as const;

// Route planner uses the same TravelModel as server tight-check — travel estimation
// is unified. Feasibility margins remain separate (server 0, route 15).
export const ROUTE_TRAVEL_MODEL = TRAVEL_MODEL;

export const FEASIBILITY = {
  // Server tight-check uses 0 (strict overlap), route planner uses 15.
  // Keep separate and named.
  serverMarginMin: 0,
  routeMarginMin: 15
} as const;
