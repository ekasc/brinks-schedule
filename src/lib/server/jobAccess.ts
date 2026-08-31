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
