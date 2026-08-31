<script lang="ts">
  import type { PageData } from './$types';
  export let data: PageData;

  $: todayIso = new Date().toISOString().slice(0, 10);
  $: weekEnd = data.days.at(-1)?.date;
  $: totalJobs = data.days.reduce(
    (total, day) => total + day.techs.reduce((dayTotal, tech) => dayTotal + tech.jobs.length, 0),
    0
  );

  function fmtTime(ts: number) {
    return new Date(ts * 1000).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  function fmtDayLong(date: Date) {
    return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  }
  function weekLabel(startIso: string, end: Date | undefined) {
    const start = new Date(startIso.slice(0, 10) + 'T00:00:00');
    if (!end) return start.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
    const startText = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const endText = end.toLocaleDateString(undefined, {
      month: start.getMonth() === end.getMonth() ? undefined : 'short',
      day: 'numeric',
      year: start.getFullYear() === end.getFullYear() ? undefined : 'numeric'
    });
    return `${startText}–${endText}`;
  }
</script>

<svelte:head><title>Week · {weekLabel(data.weekStartIso, weekEnd)}</title></svelte:head>

<div class="relative left-1/2 w-[calc(100vw-48px)] max-w-[1100px] -translate-x-1/2">
<header class="mb-4 pt-2 sm:mb-5">
  <div class="flex flex-wrap items-end justify-between gap-3">
    <div>
      <p class="mb-1 text-[13px] font-medium uppercase tracking-[0.04em] text-[var(--dim)]">
        {data.offsetWeeks === 0 ? 'This week' : data.offsetWeeks > 0 ? `${data.offsetWeeks} week${data.offsetWeeks === 1 ? '' : 's'} ahead` : `${Math.abs(data.offsetWeeks)} week${data.offsetWeeks === -1 ? '' : 's'} ago`}
      </p>
      <h1 class="text-[28px] font-bold leading-none tracking-[-0.02em] text-[var(--ink)]">
        {weekLabel(data.weekStartIso, weekEnd)}
      </h1>
    </div>
    <span class="rounded-full bg-[var(--row)] px-2.5 py-1 text-[13px] font-medium text-[var(--dim)] border border-[var(--line-thin)]">
      {totalJobs} {totalJobs === 1 ? 'job' : 'jobs'}
    </span>
  </div>

  <nav class="mt-4 grid grid-cols-3 overflow-hidden rounded-[10px] bg-[var(--row2)] p-1 border border-[var(--line-thin)]" aria-label="Week navigation">
    <a class="flex min-h-10 items-center justify-center rounded-[8px] px-3 text-[15px] font-medium text-[var(--blue)] hover:bg-[var(--row)]" href={`/calendar?w=${data.offsetWeeks - 1}`} aria-label="Previous week">‹ Previous</a>
    <a class="flex min-h-10 items-center justify-center rounded-[8px] px-3 text-[15px] font-semibold text-[var(--blue)] hover:bg-[var(--row)]" href="/calendar?w=0" aria-current={data.offsetWeeks === 0 ? 'date' : undefined}>Today</a>
    <a class="flex min-h-10 items-center justify-center rounded-[8px] px-3 text-[15px] font-medium text-[var(--blue)] hover:bg-[var(--row)]" href={`/calendar?w=${data.offsetWeeks + 1}`} aria-label="Next week">Next ›</a>
  </nav>
</header>

<!-- Wide weekly grid -->
<div class="hidden overflow-hidden rounded-[10px] bg-[var(--row)] border border-[var(--line)] md:block">
    <table class="w-full table-fixed border-collapse text-left">
      <thead>
        <tr class="border-b border-[var(--line-thin)]">
          <th class="w-28 px-3 py-3 text-[13px] font-medium uppercase tracking-[0.04em] text-[var(--dim)]">Tech</th>
          {#each data.days as day}
            <th class="px-1.5 py-2 text-center">
              <span class={day.iso === todayIso ? 'inline-flex min-w-14 flex-col rounded-[10px] bg-[var(--blue)] px-2 py-1 text-white' : 'inline-flex min-w-14 flex-col rounded-[10px] px-2 py-1 text-[var(--dim)] bg-[var(--row2)] border border-[var(--line-thin)]'}>
                <span class="text-[11px] font-semibold uppercase tracking-wide">{day.date.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                <span class="text-[17px] font-bold leading-tight">{day.date.getDate()}</span>
              </span>
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each data.techs as tech}
          <tr class="border-b border-[var(--line-thin)] last:border-0">
            <th scope="row" class="sticky left-0 z-[1] bg-[var(--row)] px-3 py-3 align-top text-[15px] font-semibold text-[var(--ink)] border-r border-[var(--line-thin)]">
              {tech.display_name}
            </th>
            {#each data.days as day}
              {@const jobs = day.techs.find((entry) => entry.techId === tech.id)?.jobs || []}
              <td class={day.iso === todayIso ? 'min-w-24 bg-[color-mix(in_srgb,var(--blue)_6%,transparent)] p-1.5 align-top' : 'min-w-24 p-1.5 align-top'}>
                {#if jobs.length === 0}
                  <span class="block py-2 text-center text-[13px] text-[var(--dim2)]">—</span>
                {:else}
                  <div class="space-y-1.5">
                    {#each jobs as job (job.id)}
                      <a class="block rounded-[8px] bg-[color-mix(in_srgb,var(--blue)_12%,transparent)] px-2 py-1.5 text-[var(--blue)] border border-[color-mix(in_srgb,var(--blue)_16%,transparent)] transition-colors hover:bg-[color-mix(in_srgb,var(--blue)_18%,transparent)]" href={`/jobs/${job.id}`}>
                        <span class="block text-[12px] font-semibold">{fmtTime(job.starts_at)}</span>
                        <span class="block truncate text-[13px] font-medium text-[var(--ink)]" title={job.client_name}>{job.client_name}</span>
                      </a>
                    {/each}
                  </div>
                {/if}
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
</div>

<!-- Mobile agenda -->
<div class="space-y-5 md:hidden">
  {#each data.days as day}
    {@const dayJobs = day.techs.flatMap((tech) => tech.jobs.map((job) => ({ ...job, techName: tech.techName })))}
    <section aria-labelledby={`day-${day.iso}`}>
      <div class="mb-2 flex items-center justify-between px-1">
        <h2 id={`day-${day.iso}`} class={day.iso === todayIso ? 'text-[15px] font-semibold text-[var(--blue)]' : 'text-[15px] font-semibold text-[var(--ink)]'}>
          {fmtDayLong(day.date)}{day.iso === todayIso ? ' · Today' : ''}
        </h2>
        <span class="text-[13px] text-[var(--dim)]">{dayJobs.length || 'No'} {dayJobs.length === 1 ? 'job' : 'jobs'}</span>
      </div>
      <div class="overflow-hidden rounded-[10px] bg-[var(--row)] border border-[var(--line)]">
        {#if dayJobs.length === 0}
          <div class="px-4 py-5 text-center text-[15px] text-[var(--dim)]">Nothing scheduled</div>
        {:else}
          {#each dayJobs as job (job.id)}
            <a class="flex min-h-16 items-center gap-3 border-b border-[var(--line-thin)] px-4 py-3 last:border-0 active:bg-[var(--row2)]" href={`/jobs/${job.id}`}>
              <time class="w-[72px] shrink-0 text-[15px] font-semibold text-[var(--blue)]">{fmtTime(job.starts_at)}</time>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[17px] font-semibold text-[var(--ink)]">{job.client_name}</span>
                <span class="block truncate text-[13px] text-[var(--dim)]">{job.techName}{job.address ? ` · ${job.address}` : ''}</span>
              </span>
              <span class="pill {job.status} !text-[11px] !px-2 !py-1 shrink-0">{job.status}</span>
              <span class="text-[var(--dim2)]" aria-hidden="true">›</span>
            </a>
          {/each}
        {/if}
      </div>
    </section>
  {/each}
</div>

<p class="mt-5 text-center text-[13px] text-[var(--dim)]">
  Select a job to view its details and location.
</p>
</div>
