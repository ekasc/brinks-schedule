import { error } from '@sveltejs/kit';

type JobTarget = { tech_id: number; booked_by: number };

type UserTarget = { role: string; id: number } | null | undefined;
type JobArg = JobTarget | null | undefined;

export function isTechForbidden(user: UserTarget, job: { tech_id: number } | null | undefined): boolean {
  if (!user) return true;
  if (!job) return true;
  if (user.role === 'tech' && job.tech_id !== user.id) return true;
  return false;
}

export function assertJobLoadAccess(user: UserTarget, job: JobArg): asserts job is JobTarget {
  if (!job) throw error(404, 'Job not found');
  if (isTechForbidden(user, job)) throw error(403, 'Forbidden');
}

// Centralized job policies — preserve current effective behavior, do not infer
// intended product matrix. canViewJob = tech own else allow (admin blocked
// earlier via redirect). canChangeJobStatus = tech own or sales own-booked,
// admin never. These are the sole authorities for their actions.
export function canViewJob(user: UserTarget, job: JobArg): boolean {
  if (!user || !job) return false;
  return !isTechForbidden(user, job);
}
export function canChangeJobStatus(user: UserTarget, job: JobTarget | null | undefined): boolean {
  if (!user || !job) return false;
  if (user.role === 'tech') return job.tech_id === user.id;
  if (user.role === 'sales') return job.booked_by === user.id;
  // admin and others: currently blocked (effective behavior, not intended)
  return false;
}
