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
  function fmtDayHeader(date: Date) {
    return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
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
  function statusClasses(status: string) {
    if (status === 'signed') return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';
    if (status === 'sent') return 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
    if (status === 'cancelled') return 'bg-red-500/15 text-red-600 dark:text-red-400';
    return 'bg-gray-500/15 text-gray-600 dark:text-gray-400';
  }
</script>

<svelte:head><title>Week · {weekLabel(data.weekStartIso, weekEnd)}</title></svelte:head>

<div class="relative left-1/2 w-[calc(100vw-48px)] max-w-[1100px] -translate-x-1/2">
<header class="mb-4 pt-2 sm:mb-5">
  <div class="flex flex-wrap items-end justify-between gap-3">
    <div>
      <p class="mb-1 text-[13px] font-medium uppercase tracking-[0.04em] text-[#6C6C70] dark:text-[#98989F]">
        {data.offsetWeeks === 0 ? 'This week' : data.offsetWeeks > 0 ? `${data.offsetWeeks} week${data.offsetWeeks === 1 ? '' : 's'} ahead` : `${Math.abs(data.offsetWeeks)} week${data.offsetWeeks === -1 ? '' : 's'} ago`}
      </p>
      <h1 class="text-[28px] font-bold leading-none tracking-[-0.02em] text-black dark:text-white">
        {weekLabel(data.weekStartIso, weekEnd)}
      </h1>
    </div>
    <span class="rounded-full bg-black/5 px-2.5 py-1 text-[13px] font-medium text-[#6C6C70] dark:bg-white/10 dark:text-[#98989F]">
      {totalJobs} {totalJobs === 1 ? 'job' : 'jobs'}
    </span>
  </div>

  <nav class="mt-4 grid grid-cols-3 overflow-hidden rounded-[10px] bg-black/5 p-1 dark:bg-white/10" aria-label="Week navigation">
    <a class="flex min-h-10 items-center justify-center rounded-lg px-3 text-[15px] font-medium text-[#007AFF] hover:bg-white/70 dark:text-[#0A84FF] dark:hover:bg-white/10" href={`/calendar?w=${data.offsetWeeks - 1}`} aria-label="Previous week">‹ Previous</a>
    <a class="flex min-h-10 items-center justify-center rounded-lg px-3 text-[15px] font-semibold text-[#007AFF] hover:bg-white/70 dark:text-[#0A84FF] dark:hover:bg-white/10" href="/calendar?w=0" aria-current={data.offsetWeeks === 0 ? 'date' : undefined}>Today</a>
    <a class="flex min-h-10 items-center justify-center rounded-lg px-3 text-[15px] font-medium text-[#007AFF] hover:bg-white/70 dark:text-[#0A84FF] dark:hover:bg-white/10" href={`/calendar?w=${data.offsetWeeks + 1}`} aria-label="Next week">Next ›</a>
  </nav>
</header>

<!-- Wide weekly grid -->
<div class="hidden overflow-hidden rounded-[10px] bg-white shadow-sm ring-1 ring-black/5 dark:bg-[#1C1C1E] dark:ring-white/10 md:block">
    <table class="w-full table-fixed border-collapse text-left">
      <thead>
        <tr class="border-b border-black/10 dark:border-white/10">
          <th class="w-28 px-3 py-3 text-[13px] font-medium uppercase tracking-[0.04em] text-[#6C6C70] dark:text-[#98989F]">Tech</th>
          {#each data.days as day}
            <th class="px-1.5 py-2 text-center">
              <span class={day.iso === todayIso ? 'inline-flex min-w-14 flex-col rounded-lg bg-[#007AFF] px-2 py-1 text-white' : 'inline-flex min-w-14 flex-col rounded-lg px-2 py-1 text-[#6C6C70] dark:text-[#98989F]'}>
                <span class="text-[11px] font-semibold uppercase tracking-wide">{day.date.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                <span class="text-[17px] font-bold leading-tight">{day.date.getDate()}</span>
              </span>
            </th>
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each data.techs as tech}
          <tr class="border-b border-black/10 last:border-0 dark:border-white/10">
            <th scope="row" class="sticky left-0 z-[1] bg-white px-3 py-3 align-top text-[15px] font-semibold text-black dark:bg-[#1C1C1E] dark:text-white">
              {tech.display_name}
            </th>
            {#each data.days as day}
              {@const jobs = day.techs.find((entry) => entry.techId === tech.id)?.jobs || []}
              <td class={day.iso === todayIso ? 'min-w-24 bg-[#007AFF]/[0.04] p-1.5 align-top' : 'min-w-24 p-1.5 align-top'}>
                {#if jobs.length === 0}
                  <span class="block py-2 text-center text-[13px] text-[#8E8E93]">—</span>
                {:else}
                  <div class="space-y-1.5">
                    {#each jobs as job (job.id)}
                      <a class="block rounded-md bg-[#007AFF]/10 px-2 py-1.5 text-[#007AFF] transition-colors hover:bg-[#007AFF]/20 dark:bg-[#0A84FF]/15 dark:text-[#0A84FF] dark:hover:bg-[#0A84FF]/25" href={`/jobs/${job.id}`}>
                        <span class="block text-[12px] font-semibold">{fmtTime(job.starts_at)}</span>
                        <span class="block truncate text-[13px] font-medium text-black dark:text-white" title={job.client_name}>{job.client_name}</span>
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
        <h2 id={`day-${day.iso}`} class={day.iso === todayIso ? 'text-[15px] font-semibold text-[#007AFF] dark:text-[#0A84FF]' : 'text-[15px] font-semibold text-black dark:text-white'}>
          {fmtDayLong(day.date)}{day.iso === todayIso ? ' · Today' : ''}
        </h2>
        <span class="text-[13px] text-[#6C6C70] dark:text-[#98989F]">{dayJobs.length || 'No'} {dayJobs.length === 1 ? 'job' : 'jobs'}</span>
      </div>
      <div class="overflow-hidden rounded-[10px] bg-white shadow-sm ring-1 ring-black/5 dark:bg-[#1C1C1E] dark:ring-white/10">
        {#if dayJobs.length === 0}
          <div class="px-4 py-5 text-center text-[15px] text-[#6C6C70] dark:text-[#98989F]">Nothing scheduled</div>
        {:else}
          {#each dayJobs as job (job.id)}
            <a class="flex min-h-16 items-center gap-3 border-b border-black/10 px-4 py-3 last:border-0 active:bg-black/5 dark:border-white/10 dark:active:bg-white/5" href={`/jobs/${job.id}`}>
              <time class="w-[72px] shrink-0 text-[15px] font-semibold text-[#007AFF] dark:text-[#0A84FF]">{fmtTime(job.starts_at)}</time>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[17px] font-semibold text-black dark:text-white">{job.client_name}</span>
                <span class="block truncate text-[13px] text-[#6C6C70] dark:text-[#98989F]">{job.techName}{job.address ? ` · ${job.address}` : ''}</span>
              </span>
              <span class={`rounded-md px-2 py-1 text-[11px] font-semibold capitalize ${statusClasses(job.status)}`}>{job.status}</span>
              <span class="text-[#8E8E93]" aria-hidden="true">›</span>
            </a>
          {/each}
        {/if}
      </div>
    </section>
  {/each}
</div>

<p class="mt-5 text-center text-[13px] text-[#6C6C70] dark:text-[#98989F]">
  Select a job to view its details and location.
</p>
</div>
