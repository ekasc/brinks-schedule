<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { invalidateAll } from '$app/navigation';
  export let data: PageData;
  export let form: ActionData;

  let selectedTech = data.techs[0]?.id ?? 0;
  let date = '';
  let start = '09:00';
  let end = '17:00';
  let note = '';
  let busy = false;

  $: today = new Date().toISOString().slice(0, 10);
  $: blocks = (data.blocksByTech[selectedTech] || []);
  $: jobs = (data.jobsByTech[selectedTech] || []);

  function fmt(ts: number) {
    return new Date(ts * 1000).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  async function add(e: Event) {
    e.preventDefault();
    if (busy) return;
    busy = true;
    try {
      const fd = new FormData();
      fd.set('tech_id', String(selectedTech));
      fd.set('date', date);
      fd.set('start', start);
      fd.set('end', end);
      fd.set('note', note);
      const res = await fetch('?/add', { method: 'POST', body: fd });
      if (res.ok) { date = ''; note = ''; await invalidateAll(); }
    } finally {
      busy = false;
    }
  }
  async function remove(id: number, techId: number) {
    if (!confirm('Remove this availability block?')) return;
    const fd = new FormData();
    fd.set('id', String(id));
    fd.set('tech_id', String(techId));
    await fetch('?/remove', { method: 'POST', body: fd });
    invalidateAll();
  }
</script>

<svelte:head><title>Availability</title></svelte:head>

<div class="large-title">
  <h1>Hours</h1>
  <div class="sub">Add blocks when you can take jobs. Sales can only book inside these.</div>
</div>

{#if data.techs.length > 1}
  <div class="form-section">
    <div class="input-group">
      <div class="field" style="display: flex; align-items: center;">
        <span class="label" style="flex:1; color: var(--dim);">Technician</span>
        <select bind:value={selectedTech} style="flex: 2; text-align: right;">
          {#each data.techs as t}
            <option value={t.id}>{t.display_name}</option>
          {/each}
        </select>
      </div>
    </div>
  </div>
{/if}

<form on:submit={add}>
  <div class="form-section">
    <div class="input-group">
      <div class="field">
        <input type="date" bind:value={date} min={today} required aria-label="Date" />
      </div>
      <div class="field">
        <div class="row" style="gap: 0;">
          <input type="time" bind:value={start} required aria-label="Start" style="flex:1;" />
          <span style="color: var(--dim); padding: 0 var(--s-3);">to</span>
          <input type="time" bind:value={end} required aria-label="End" style="flex:1;" />
        </div>
      </div>
      <div class="field">
        <input type="text" bind:value={note} placeholder="Note (optional)" />
      </div>
    </div>
    <button type="submit" class="filled" style="margin-top: var(--s-3);" disabled={busy}>
      {busy ? 'Adding…' : 'Add block'}
    </button>
    {#if form?.error}
      <div class="err" style="margin-top: var(--s-3);" role="alert">{form.error}</div>
    {/if}
  </div>
</form>

<div class="group">
  <div class="group-title">Current blocks</div>
  {#if blocks.length === 0}
    <div class="empty" style="padding: var(--s-5) var(--s-4);">
      <h3 style="font-size: var(--t-17);">No blocks set</h3>
      <div>Add one above to make yourself bookable.</div>
    </div>
  {:else}
    <div class="group-rows">
      {#each blocks as b (b.id)}
        <div class="row-line" style="padding: var(--s-3) var(--s-4);">
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 500;">{fmt(b.starts_at)}</div>
            <div class="muted small">ends {fmt(b.ends_at)}{b.note ? ' · ' + b.note : ''}</div>
          </div>
          <button class="tinted-danger small" on:click={() => remove(b.id, selectedTech)} aria-label="Remove block">Remove</button>
        </div>
      {/each}
    </div>
  {/if}
</div>

<div class="group">
  <div class="group-title">Your jobs this week</div>
  {#if jobs.length === 0}
    <div class="empty" style="padding: var(--s-5) var(--s-4);">None.</div>
  {:else}
    <div class="group-rows">
      {#each jobs as j (j.id)}
        <a class="job-row" href={`/jobs/${j.id}`}>
          <div class="top">
            <span class="name">{j.client_name}</span>
            <span class="pill {j.status}">{j.status}</span>
          </div>
          <div class="when">{fmt(j.starts_at)}</div>
          {#if j.address}
            <div class="addr">{j.address}</div>
          {/if}
        </a>
      {/each}
    </div>
  {/if}
</div>
