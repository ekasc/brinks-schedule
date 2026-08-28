<script lang="ts">
  import type { PageData } from './$types';
  export let data: PageData;

  function fmtTime(ts: number): string {
    return new Date(ts * 1000).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  function fmtDay(ts: number): string {
    const d = new Date(ts * 1000);
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }
  function isToday(ts: number): boolean {
    const d = new Date(ts * 1000);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  }
</script>

<svelte:head><title>Today</title></svelte:head>

<div class="large-title inline">
  <h1>Today</h1>
  <span class="role-pill">{data.user?.display_name}</span>
</div>

{#if data.upcoming.length === 0}
  <div class="empty">
    <h3>No jobs scheduled</h3>
    <div>Booked jobs will show here as the day unfolds.</div>
    {#if data.user?.role === 'sales' || data.user?.role === 'admin'}
      <div class="hint">Tap Book in the top bar to add one.</div>
    {/if}
  </div>
{:else}
  <div class="group">
    <div class="group-title">Upcoming</div>
    <div class="group-rows">
      {#each data.upcoming as j (j.id)}
        <a class="job-row" href={`/jobs/${j.id}`}>
          <div class="top">
            <span class="name">{j.client_name}</span>
            <span class="pill {j.status}">{j.status}</span>
          </div>
          <div class="when">
            {#if isToday(j.starts_at)}Today{:else}{fmtDay(j.starts_at)}{/if}
            · {fmtTime(j.starts_at)}–{fmtTime(j.ends_at)} · {j.tech_name}
          </div>
          {#if j.address}
            <div class="addr">{j.address}</div>
          {/if}
        </a>
      {/each}
    </div>
  </div>
{/if}
