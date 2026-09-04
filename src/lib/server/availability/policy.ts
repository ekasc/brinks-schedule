// Availability / scheduling policy — single source of truth for buffer.
//
// Invariant: A booking is admissible iff it lies within an available interval
// and is at least BUFFER_MIN clear of every other active (non-cancelled, non-declined) job.
// Enforced both in slot generation (getAvailableSlots expands jobs by
// BUFFER_MIN) and atomically at the mutation boundary (createJob /
// hasNonCancelledOverlap / __setJobStatusConditional use BUFFER_SEC in their
// NOT EXISTS predicates). This closes the TOCTOU race where two concurrent
// validations before either insert could otherwise persist jobs less than
// BUFFER_MIN apart (e.g. 10:00–11:00 and 11:00–12:00 with BUFFER_MIN=30).
// BUFFER_MIN lives here so the policy and constant have one owner.

export const BUFFER_MIN = 30;
export const BUFFER_SEC = BUFFER_MIN * 60;
