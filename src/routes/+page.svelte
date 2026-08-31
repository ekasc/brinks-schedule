<script lang="ts">
  import type { PageData } from './$types';
  export let data: PageData;
  let query = '';
  function fmtTime(ts: number) { return new Date(ts * 1000).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }
  function fmtDay(ts: number) { return new Date(ts * 1000).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }); }
  function isToday(ts: number) { const d = new Date(ts * 1000), n = new Date(); return d.toDateString() === n.toDateString(); }
  import { getTodayHeading } from '$lib/dashboardView';
  $: visible = data.upcoming.filter(j => !query || `${j.client_name} ${j.address ?? ''} ${j.tech_name}`.toLowerCase().includes(query.toLowerCase()));
  $: grouped = data.techs.map(t => ({ tech: t, jobs: visible.filter(j => j.tech_id === t.id) })).filter(g => g.jobs.length);
</script>
<svelte:head><title>Today</title></svelte:head>
<div class="large-title inline"><h1>Today</h1><span class="role-pill">{data.user?.display_name}</span></div>
{#if data.isTech}
  <div class="today-meta"><span>{getTodayHeading(true, visible.length)}</span></div>
{:else}
  <div class="today-meta"><span>Today · {data.upcoming.length} total</span><span>{grouped.length}/{data.techs.length} techs busy</span></div>
  <div class="tech-cards">{#each data.techs as tech}<div class="tech-card"><span>{tech.display_name}</span><strong>{visible.filter(j => j.tech_id === tech.id).length}</strong><span>{visible.filter(j => j.tech_id === tech.id).length === 1 ? 'job' : 'jobs'}</span></div>{/each}</div>
{/if}
<div class="mx-4 mt-6 mb-8 flex gap-2">
  <div class="flex-1">
    <input class="w-full rounded-[10px] border border-[var(--line)] bg-[var(--row)] px-3 py-2.5 text-[15px] text-[var(--ink)] outline-none placeholder:text-[var(--dim)]" bind:value={query} placeholder="Search client or address" aria-label="Search client or address" />
  </div>
  <a href="/calendar" class="inline-flex shrink-0 items-center justify-center rounded-[10px] border border-[var(--line)] bg-[var(--row)] px-4 text-[15px] font-medium text-[var(--ink)] hover:bg-[var(--row2)]">Past 7 days</a>
</div>
{#if visible.length === 0}
  <div class="empty"><h3>{query ? 'No matching jobs' : 'No jobs scheduled'}</h3><div>{query ? 'Try another search.' : 'Booked jobs will show here as the day unfolds.'}</div>{#if data.isSales}<div class="hint"><a href="/book">Book a job →</a></div>{/if}</div>
{:else if data.isTech}
  <div class="group"><div class="group-rows">
    {#each visible as j (j.id)}<a class="job-row" href={`/jobs/${j.id}`}><div class="top"><span class="name">{j.client_name}</span><span class="pill {j.status}">{j.status}</span></div><div class="when">{isToday(j.starts_at) ? 'Today' : fmtDay(j.starts_at)} · {fmtTime(j.starts_at)}–{fmtTime(j.ends_at)}</div>{#if j.address}<div class="addr">{j.address}</div>{/if}</a>{/each}
  </div></div>
{:else}
  {#each grouped as group}
    <div class="group"><div class="group-title">{group.tech.display_name}</div><div class="group-rows">
      {#each group.jobs as j (j.id)}<a class="job-row" href={`/jobs/${j.id}`}><div class="top"><span class="name">{j.client_name}</span><span class="pill {j.status}">{j.status}</span></div><div class="when">{isToday(j.starts_at) ? 'Today' : fmtDay(j.starts_at)} · {fmtTime(j.starts_at)}–{fmtTime(j.ends_at)}</div>{#if j.address}<div class="addr">{j.address}</div>{/if}</a>{/each}
    </div></div>
  {/each}
{/if}
