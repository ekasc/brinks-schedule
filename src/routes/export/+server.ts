import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listJobs } from '$lib/server/db';
import { csvCell } from '$lib/server/csv';

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) return new Response('unauthorized', { status: 401 });
  if (locals.user.role !== 'admin') throw redirect(302, '/');
  const fromStr = url.searchParams.get('from');
  const toStr = url.searchParams.get('to');
  const parseDay = (s: string) => {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw error(400,'Invalid date');
    const [y, m, d] = s.split('-').map(Number);
    const date=new Date(y, m - 1, d, 0, 0, 0, 0);
    if(date.getFullYear()!==y || date.getMonth()!==m-1 || date.getDate()!==d) throw error(400,'Invalid date');
    return date;
  };
  const fromTs = fromStr ? Math.floor(parseDay(fromStr).getTime()/1000) : Math.floor(Date.now()/1000) - 7*86400;
  let toTs: number;
  if (toStr) {
    const base = parseDay(toStr); base.setDate(base.getDate()+1); toTs = Math.floor(base.getTime()/1000);
  } else {
    const future = new Date(); future.setDate(future.getDate()+30); future.setHours(0,0,0,0); toTs = Math.floor(future.getTime()/1000);
  }
  if(!Number.isFinite(fromTs) || !Number.isFinite(toTs) || toTs<=fromTs || toTs-fromTs>366*86400) throw error(400,'Date range must be between 1 and 366 days');
  const rows = await listJobs(fromTs, toTs);
  const header = ['id','client_name','address','tech_name','booker_name','status','starts_at','ends_at','completed_at','notes'].join(',');
  const esc = csvCell;
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
      'content-disposition': `attachment; filename="export-${fromStr ?? 'export'}.csv"`,
      'cache-control':'no-store',
      'x-content-type-options':'nosniff'
    }
  });
};
