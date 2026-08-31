// Availability / scheduling policy — single source of truth for buffer.
//
// Current invariant (proven from code): getAvailableSlots expands existing jobs
// by BUFFER_MIN when generating candidate slots. The atomic DB predicates
// (createJob / hasNonCancelledOverlap / __setJobStatusConditional) currently
// check strict overlap without buffer — divergence is proven. Whether the DB
// should also enforce BUFFER_MIN atomically is a product decision pending
// verification with actual step-aligned generation and a concurrency test
// (see R2 audit). BUFFER_MIN lives here so the policy and constant have one
// owner, not in a generic constants drawer.
export const BUFFER_MIN = 30;
export const BUFFER_SEC = BUFFER_MIN * 60;
