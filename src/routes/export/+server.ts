import type { RequestHandler } from './$types';
import { listJobs } from '$lib/server/db';

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) return new Response('unauthorized', { status: 401 });
  const fromStr = url.searchParams.get('from');
  const toStr = url.searchParams.get('to');
  const fromTs = fromStr ? Math.floor(new Date(fromStr + 'T00:00:00').getTime()/1000) : Math.floor(Date.now()/1000) - 86400*7;
  const toTs = toStr ? Math.floor(new Date(toStr + 'T00:00:00').getTime()/1000) + 86400 : Math.floor(Date.now()/1000) + 86400*30;
  const rows = await listJobs(fromTs, toTs);
  const header = ['id','client_name','address','tech_name','booker_name','status','starts_at','ends_at','completed_at','notes'].join(',');
  const esc = (v: any) => `"${String(v ?? '').replace(/"/g,'""')}"`;
  const lines = rows.map(r => [
    r.id, esc(r.client_name), esc(r.address), esc(r.tech_name), esc(r.booker_name), r.status,
    new Date(r.starts_at*1000).toISOString(), new Date(r.ends_at*1000).toISOString(),
    r.completed_at ? new Date(r.completed_at*1000).toISOString() : '',
    esc(r.notes)
  ].join(','));
  const csv = [header, ...lines].join('\n');
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="export-${fromStr ?? 'export'}.csv"`
    }
  });
};
