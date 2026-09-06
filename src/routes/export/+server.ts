import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { decryptField, listJobsSummary } from '$lib/server/db';
import { addWallDays, vancouverDayRange } from '$lib/server/weekOffset';
import { csvCell } from '$lib/server/csv';

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user) return new Response('unauthorized', { status: 401 });
  if (locals.user.role !== 'admin') throw redirect(302, '/');
  const fromStr = url.searchParams.get('from');
  const toStr = url.searchParams.get('to');
  const parseDay = (s: string) => {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw error(400,'Invalid date');
    const [y, m, d] = s.split('-').map(Number);
    const check = new Date(Date.UTC(y, m - 1, d));
    if(check.getUTCFullYear()!==y || check.getUTCMonth()!==m-1 || check.getUTCDate()!==d) throw error(400,'Invalid date');
    return { year: y, month: m, day: d };
  };
  // Vancouver wall days — server-local midnight is off by 7-8h on UTC hosts.
  const fromTs = fromStr ? vancouverDayRange(parseDay(fromStr)).start : Math.floor(Date.now()/1000) - 7*86400;
  let toTs: number;
  if (toStr) {
    // End-exclusive: start of the wall day after `to`.
    toTs = vancouverDayRange(addWallDays(parseDay(toStr), 1)).start;
  } else {
    toTs = Math.floor(Date.now()/1000) + 30*86400;
  }
  if(!Number.isFinite(fromTs) || !Number.isFinite(toTs) || toTs<=fromTs || toTs-fromTs>366*86400) throw error(400,'Date range must be between 1 and 366 days');
  const rows = await listJobsSummary(fromTs, toTs);
  const header = ['id','client_name','address','tech_name','booker_name','status','starts_at','ends_at','completed_at','notes'].join(',');
  const esc = csvCell;
  // Summary rows don't decrypt: decode only the ciphertext-capable CSV fields.
  const lines = rows.map(r => [
    r.id, esc(decryptField(r.client_name) ?? ''), esc(decryptField(r.address) ?? ''), esc(r.tech_name), esc(r.booker_name), r.status,
    new Date(r.starts_at*1000).toISOString(), new Date(r.ends_at*1000).toISOString(),
    r.completed_at ? new Date(r.completed_at*1000).toISOString() : '',
    esc(decryptField(r.notes) ?? '')
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
