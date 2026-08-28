<script lang="ts">
  import type { PageData } from './$types';
  export let data: PageData;

  $: todayIso = new Date().toISOString().slice(0, 10);

  function fmtTime(ts: number) {
    return new Date(ts * 1000).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  function fmtDayHeader(d: Date) {
    return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
  }
  function monthLabel(iso: string) {
    // iso is full ISO like "2026-08-23T07:00:00.000Z" — strip the time portion first
    const dateOnly = iso.slice(0, 10);
    return new Date(dateOnly + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
  }
</script>

<svelte:head><title>Week</title></svelte:head>

<div class="large-title inline">
  <h1>{monthLabel(data.weekStartIso)}</h1>
  <div class="row" style="gap: var(--s-3);">
    <a class="muted small" href={`/calendar?w=${data.offsetWeeks - 1}`} aria-label="Previous week">‹ Prev</a>
    <a class="muted small" href={`/calendar?w=0`}>This week</a>
    <a class="muted small" href={`/calendar?w=${data.offsetWeeks + 1}`} aria-label="Next week">Next ›</a>
  </div>
</div>

<div class="scroll-x">
  <div class="group" style="margin: 0;">
    <div class="group-rows" style="border-radius: var(--r-2);">
      <table class="cal">
        <thead>
          <tr>
            <th></th>
            {#each data.days as d}
              <th class:hl={d.iso === todayIso}>{fmtDayHeader(d.date)}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each data.techs as tech}
            <tr>
              <td>{tech.display_name}</td>
              {#each data.days as d}
                {@const dayJobs = d.techs.find(t => t.techId === tech.id)?.jobs || []}
                <td>
                  {#if dayJobs.length === 0}
                    <span class="cal-empty">—</span>
                  {:else}
                    {#each dayJobs as j (j.id)}
                      <a class="cal-job" href={`/jobs/${j.id}`}>
                        <span class="time">{fmtTime(j.starts_at)}</span><br/>{j.client_name}
                      </a>
                    {/each}
                  {/if}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
</div>

<div class="muted small" style="padding: var(--s-4) var(--s-4) 0;">
  Tap any block for details. Travel-time warnings appear once the geocoder is wired.
</div>
