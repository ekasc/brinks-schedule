<script lang="ts">
  import type { PageData } from './$types';
  export let data: PageData;

  const fmtCents = (c: number) => `$${(c / 100).toFixed(2)}`;
  const fmtDay = (ts: number) => new Date(ts * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const fmtTime = (ts: number) => new Date(ts * 1000).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const periodLabel = data.period === 'w' ? 'this week' : data.period === 'm' ? 'this month' : 'all time';
</script>

<svelte:head><title>Income</title></svelte:head>

<div class="mt-8 mb-8 px-4">
  <h1 class="text-[28px] font-bold tracking-tight">Income</h1>
</div>

<div class="form-section">
  <div class="flex gap-2">
    <a href="/income?p=w" class="slot-btn flex-1 text-center {data.period === 'w' ? 'selected' : ''}">This week</a>
    <a href="/income?p=m" class="slot-btn flex-1 text-center {data.period === 'm' ? 'selected' : ''}">This month</a>
    <a href="/income?p=all" class="slot-btn flex-1 text-center {data.period === 'all' ? 'selected' : ''}">All time</a>
  </div>
  <a href="/export" class="muted small mt-3 inline-block">Export CSV →</a>
</div>

<div class="group group--loose">
  <div class="group-title">Your totals · {periodLabel}</div>
  <div class="group-rows">
    <div class="row-line"><span class="label">Earned</span><span class="value ink">{fmtCents(data.me.earned_cents ?? 0)} <span class="muted small">({data.me.signed ?? 0} signed)</span></span></div>
    <div class="row-line"><span class="label">Pending</span><span class="value">{fmtCents(data.me.pending_cents ?? 0)} <span class="muted small">({data.me.sent ?? 0} sent)</span></span></div>
    <div class="row-line"><span class="label">Completed</span><span class="value">{fmtCents(data.me.completed_cents ?? 0)} <span class="muted small">({data.me.completed ?? 0} installs)</span></span></div>
    <div class="row-line"><span class="label">Total jobs</span><span class="value">{data.me.total ?? 0}</span></div>
  </div>
</div>

{#if data.allSummary}
  <div class="group">
    <div class="group-title">Team · {data.allSummary.length} active</div>
    {#if data.allSummary.length === 0}
      <div class="empty">No payouts yet.<div class="hint">Add a payout when booking to see the team here.</div></div>
    {:else}
      <div class="group-rows">
        {#each data.allSummary as u (u.user_id)}
          <div class="row-line">
            <span class="label">{u.display_name}<br /><span class="muted small">{u.role}</span></span>
            <span class="value">{u.jobs} jobs · {fmtCents(u.earned_cents ?? 0)}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<div class="group">
  <div class="group-title">Recent jobs · {data.recent.length}</div>
  {#if data.recent.length === 0}
    <div class="empty">No jobs in this period.<div class="hint">Book a job with a payout to see it here.</div></div>
  {:else}
    <div class="group-rows">
      {#each data.recent as j (j.id)}
        <a class="job-row" href={`/jobs/${j.id}`}>
          <div class="top">
            <span class="name">{j.client_name}</span>
            <span class="pill {j.status}">{j.status}</span>
          </div>
          <div class="when">{fmtTime(j.starts_at)} · {j.tech_name} · booked by {j.booker_name}</div>
          <div class="addr">{j.address}{j.payout_cents ? ` · ${fmtCents(j.payout_cents)}` : ''}</div>
          {#if j.completed_at}<div class="addr muted small">✓ completed {fmtDay(j.completed_at)}</div>{/if}
        </a>
      {/each}
    </div>
  {/if}
</div>
