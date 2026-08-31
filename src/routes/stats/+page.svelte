<script lang="ts">
  import type { PageData } from './$types';
  export let data: PageData;

  const fmtCents = (c: number) => `$${(c / 100).toFixed(2)}`;
  const periodLabel = data.period === 'w' ? 'this week' : data.period === 'm' ? 'this month' : 'all time';
</script>

<svelte:head><title>Stats</title></svelte:head>

<div class="mt-8 mb-8 px-4">
  <h1 class="text-[28px] font-bold tracking-tight">Stats</h1>
</div>

<div class="form-section">
  <div class="flex gap-2">
    <a href="/stats?p=w" class="slot-btn flex-1 text-center {data.period === 'w' ? 'selected' : ''}">This week</a>
    <a href="/stats?p=m" class="slot-btn flex-1 text-center {data.period === 'm' ? 'selected' : ''}">This month</a>
    <a href="/stats?p=all" class="slot-btn flex-1 text-center {data.period === 'all' ? 'selected' : ''}">All time</a>
  </div>
</div>

<div class="group group--loose">
  <div class="group-title">Shop totals · {periodLabel}</div>
  <div class="group-rows">
    <div class="row-line"><span class="label">Total jobs</span><span class="value ink">{data.system.total}</span></div>
    <div class="row-line"><span class="label">Signed</span><span class="value">{data.system.signed} <span class="muted small">{data.system.conversion}% conversion</span></span></div>
    <div class="row-line"><span class="label">Sent</span><span class="value">{data.system.sent}</span></div>
    <div class="row-line"><span class="label">Completed</span><span class="value">{data.system.completed} <span class="muted small">{data.system.completion}% of signed</span></span></div>
    <div class="row-line"><span class="label">Payout</span><span class="value ink">{fmtCents(data.system.earned_cents)}</span></div>
    <div class="row-line"><span class="label">Total value</span><span class="value">{fmtCents(data.system.total_cents)}</span></div>
  </div>
</div>

<div class="group">
  <div class="group-title">You · {data.user.display_name}</div>
  <div class="group-rows">
    <div class="row-line"><span class="label">Your jobs</span><span class="value">{data.me.total} total · {data.me.signed} signed · {data.me.sent} sent · {data.me.cancelled} cancelled</span></div>
    <div class="row-line"><span class="label">Completed</span><span class="value">{data.me.completed} · {fmtCents(data.me.completed_cents)}</span></div>
    <div class="row-line"><span class="label">Earned (signed)</span><span class="value ink">{fmtCents(data.me.earned_cents)}</span></div>
    <div class="row-line"><span class="label">Pending (sent)</span><span class="value">{fmtCents(data.me.pending_cents)}</span></div>
  </div>
</div>

<div class="group">
  <div class="group-title">Per user · {data.team.length} active</div>
  {#if data.team.length === 0}
    <div class="empty">No users yet.</div>
  {:else}
    <div class="group-rows">
      {#each data.team as u (u.user_id)}
        <div class="row-line">
          <span class="label">{u.display_name}<br /><span class="muted small">{u.role}</span></span>
          <span class="value">{u.total} jobs · {u.signed} signed · {fmtCents(u.earned_cents)}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<div class="form-section">
  <a href="/calendar" class="muted small">Week →</a>
</div>
