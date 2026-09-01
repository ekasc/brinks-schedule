import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { listTemplatesForTechs, setPatternsForTech, listJobsForTechsSummary, listActiveUsers, findUserById } from '$lib/server/db';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) throw redirect(302, '/login');
  const techs = (locals.user.role === 'tech') ? [locals.user] : await listActiveUsers('tech');
  const templatesByTech: Record<number, any[]> = {};
  const jobsByTech: Record<number, any[]> = {};
  const now = Math.floor(Date.now()/1000);
  const horizon = now + 60*86400;
  if (techs.length) {
    const techIds = techs.map(t=> t.id);
    const [allTemplates, allJobs] = await Promise.all([
      listTemplatesForTechs(techIds),
      listJobsForTechsSummary(now, horizon, techIds)
    ]);
    for (const t of techs) {
      templatesByTech[t.id] = allTemplates.filter((r:any)=> r.tech_id === t.id);
      jobsByTech[t.id] = allJobs.filter((j:any)=> j.tech_id === t.id && j.status!=='cancelled').slice(0,20);
    }
  }
  return {
    techs: techs.map(t => ({ id: t.id, display_name: t.display_name })),
    templatesByTech,
    unavailableByTech: {} as Record<number, any[]>,
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
    // New model: one available slot per enabled weekday. Only 'available' is accepted;
    // 'unavailable' kind is retired. Empty array means all days off (explicit).
    for (const p of patterns) {
      if (typeof p.dow!=='number' || p.dow<0 || p.dow>6) return fail(400, { error: 'invalid dow' });
      if (typeof p.start_min!=='number' || typeof p.end_min!=='number') return fail(400, { error: 'invalid minutes' });
      if (p.start_min<0 || p.end_min>1440 || p.end_min<=p.start_min) return fail(400, { error: 'invalid time range' });
      if (p.kind!=null && p.kind!=='available') return fail(400, { error: 'invalid kind: only available is allowed' });
    }
    // One slot per dow - dedupe by dow, last wins.
    const byDow: Record<number, {start:number; end:number}> = {};
    for (const p of patterns) byDow[p.dow] = {start:p.start_min, end:p.end_min};
    const deduped = Object.entries(byDow).map(([dowStr, v]) => ({dow:Number(dowStr), start_min:v.start, end_min:v.end}));
    await setPatternsForTech(techId, deduped.map(p=>({dow:p.dow, start_min:p.start_min, end_min:p.end_min, kind:'available', note:null})));
    return { ok:true };
  }
};
