import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { listTemplatesForTechs, setPatternsForTech, addUnavailable, removeUnavailable, listAllUnavailableForTechs, listJobsForTechsSummary, listJobsSummary, listActiveUsers, findUserById } from '$lib/server/db';
import { notifyUser } from '$lib/server/notifications';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) throw redirect(302, '/login');
  const techs = (locals.user.role === 'tech') ? [locals.user] : await listActiveUsers('tech');
  const templatesByTech: Record<number, any[]> = {};
  const unavailableByTech: Record<number, any[]> = {};
  const jobsByTech: Record<number, any[]> = {};
  const now = Math.floor(Date.now()/1000);
  const horizon = now + 60*86400;
  if (techs.length) {
    const techIds = techs.map(t=> t.id);
    const [allTemplates, allUnavailable, allJobs] = await Promise.all([
      listTemplatesForTechs(techIds),
      listAllUnavailableForTechs(techIds),
      listJobsForTechsSummary(now, horizon, techIds)
    ]);
    for (const t of techs) {
      templatesByTech[t.id] = allTemplates.filter((r:any)=> r.tech_id === t.id);
      unavailableByTech[t.id] = allUnavailable.filter((r:any)=> r.tech_id === t.id && r.ends_at > now).slice(0,50);
      jobsByTech[t.id] = allJobs.filter((j:any)=> j.tech_id === t.id && j.status!=='cancelled').slice(0,20);
    }
  }
  return {
    techs: techs.map(t => ({ id: t.id, display_name: t.display_name })),
    templatesByTech,
    unavailableByTech,
    jobsByTech
  };
};

export const actions: Actions = {
  savePatterns: async ({ request, locals }) => {
    if (!locals.user || locals.user.role === 'sales') return fail(403, { error: 'forbidden' });
    const data = await request.formData();
    const techId = Number(data.get('tech_id') || (locals.user.role==='tech'?locals.user.id:0));
    if (!techId) return fail(400, { error: 'missing tech' });
    if (locals.user.role==='tech' && techId!==locals.user.id) return fail(403, { error: 'forbidden' });
    const target = await findUserById(techId);
    if (!target || target.role!=='tech') return fail(400, { error: 'target not found' });
    let raw = String(data.get('patterns')||'[]');
    let patterns: any[];
    try { patterns = JSON.parse(raw); } catch { return fail(400, { error: 'invalid patterns' }); }
    // validate
    for (const p of patterns) {
      if (typeof p.dow!=='number' || p.dow<0 || p.dow>6) return fail(400, { error: 'invalid dow' });
      if (typeof p.start_min!=='number' || typeof p.end_min!=='number') return fail(400, { error: 'invalid minutes' });
      if (p.start_min<0 || p.end_min>1440 || p.end_min<=p.start_min) return fail(400, { error: 'invalid time range' });
      if (p.kind!=null && p.kind!=='available' && p.kind!=='unavailable') return fail(400, { error: 'invalid kind' });
    }
    // Opposite kinds may overlap: an unavailable interval is a recurring break
    // inside a wider available interval. Only same-kind overlaps are ambiguous.
    const byDowAndKind: Record<string, {start:number; end:number}[]> = {};
    for (const p of patterns) {
      const key = `${p.dow}:${p.kind === 'unavailable' ? 'unavailable' : 'available'}`;
      (byDowAndKind[key] ??= []).push({start:p.start_min,end:p.end_min});
    }
    for (const key in byDowAndKind) {
      const arr = byDowAndKind[key].sort((a,b)=>a.start-b.start);
      const dow = Number(key.split(':')[0]);
      for (let i=1;i<arr.length;i++) if (arr[i].start < arr[i-1].end) return fail(400, { error: `Overlapping intervals on ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][Number(dow)]}` });
    }
    await setPatternsForTech(techId, patterns.map(p=>({dow:p.dow, start_min:p.start_min, end_min:p.end_min, kind: p.kind==='unavailable'?'unavailable':'available', note:null})));
    return { ok:true };
  },
  addUnavailable: async ({ request, locals }) => {
    if (!locals.user || locals.user.role==='sales') return fail(403, { error: 'forbidden' });
    const data = await request.formData();
    const techId = Number(data.get('tech_id') || (locals.user.role==='tech'?locals.user.id:0));
    const date = String(data.get('date')||'');
    const start = String(data.get('start')||'');
    const end = String(data.get('end')||'');
    const reason = String(data.get('reason')||'').trim()||null;
    const force = data.get('force') === 'true';
    if (!techId || !date || !start || !end) return fail(400, { error: 'missing fields' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) return fail(400, { error: 'invalid date or time format' });
    const startsAt = Math.floor(new Date(`${date}T${start}`).getTime()/1000);
    const endsAt = Math.floor(new Date(`${date}T${end}`).getTime()/1000);
    if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt<=startsAt) return fail(400, { error: 'end must be after start' });
    if (locals.user.role==='tech' && techId!==locals.user.id) return fail(403, { error: 'forbidden' });
    const target = await findUserById(techId);
    if (!target || target.role!=='tech') return fail(400, { error: 'target not found' });
    const conflictingJobs = (await listJobsSummary(startsAt, endsAt, techId)).filter((job:any) => job.status !== 'cancelled');
    if (conflictingJobs.length && !force) {
      return fail(409, {
        warning: 'This blocked time overlaps an existing booking.',
        conflicts: conflictingJobs.slice(0, 5).map((job:any) => ({
          id: job.id,
          client_name: job.client_name,
          starts_at: job.starts_at,
          ends_at: job.ends_at
        }))
      });
    }
    const unavailableId=await addUnavailable(techId, startsAt, endsAt, reason);
    if(conflictingJobs.length){
      await Promise.all(conflictingJobs.map((job:any)=>notifyUser(job.booked_by,'Availability conflict',`${target.display_name} blocked time that overlaps ${job.client_name}. The booking remains scheduled.`,`/jobs/${job.id}`,`unavailable:${unavailableId}:job:${job.id}`)));
    }
    return { ok:true };
  },
  removeUnavailable: async ({ request, locals }) => {
    if (!locals.user) return fail(403, { error: 'forbidden' });
    if (locals.user.role==='sales') return fail(403, { error: 'forbidden' });
    const data = await request.formData();
    const id = Number(data.get('id')||0);
    const techId = Number(data.get('tech_id')||0);
    if (locals.user.role==='tech' && techId!==locals.user.id) return fail(403, { error: 'forbidden' });
    await removeUnavailable(id, techId);
    return { ok:true };
  }
};
