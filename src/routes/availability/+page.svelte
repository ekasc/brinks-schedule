<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { invalidateAll } from '$app/navigation';
  import { Button, Select } from 'bits-ui';
  export let data: PageData;
  export let form: ActionData;

  let selectedTech = data.techs[0]?.id ?? 0;
  let date = '';
  let start = '09:00';
  let end = '17:00';
  let note = '';
  let busy = false;

  $: availTechItems = data.techs.map((t) => ({ value: String(t.id), label: t.display_name }));
  $: availCounts = (() => {
    const c: Record<string, number> = {};
    for (const t of data.techs) c[String(t.id)] = (data.blocksByTech[t.id] || []).length;
    return c;
  })();

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

<div class="mb-6">
  <h1>Hours</h1>
  <div class="mt-1 text-gray-400">Add blocks when you can take jobs. Sales can only book inside these.</div>
</div>

{#if data.techs.length > 1}
  <div class="mb-6">
    <div class="flex flex-col gap-3">
      <div class="flex flex-col gap-1">
        <span class="text-sm font-medium text-gray-400">Technician</span>
        <Select.Root type="single" value={String(selectedTech)} onValueChange={(v) => { if (v != null) selectedTech = Number(v); }} items={availTechItems}>
          <Select.Trigger class="flex w-full items-center justify-between gap-2 rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none cursor-pointer text-left data-[placeholder]:!text-gray-400"><Select.Value placeholder="Technician" /><svg width="12" height="8" viewBox="0 0 12 8" fill="none" aria-hidden="true" class="ml-1 shrink-0 text-gray-400"><path d="M1 1.5L6 6.5L11 1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></Select.Trigger>
          <Select.Portal>
            <Select.Content class="z-[1000] min-w-[220px] w-[var(--bits-floating-anchor-width)] max-w-[92vw] rounded-md border border-gray-700 bg-gray-900 p-1 text-white shadow-xl" sideOffset={6}>
              <Select.Viewport>
                {#each data.techs as t}
                  <Select.Item value={String(t.id)} label={t.display_name} class="flex cursor-pointer items-center justify-between rounded px-3 py-2 data-[state=checked]:bg-gray-800 data-[highlighted]:bg-gray-800"><span>{t.display_name}</span><span class="ml-3 rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-400">{availCounts[String(t.id)] ?? 0} blocks</span></Select.Item>
                {/each}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>
      </div>
    </div>
  </div>
{/if}

<form on:submit={add}>
  <div class="mb-6">
    <div class="flex flex-col gap-3">
      <div class="flex flex-col gap-1">
        <input type="date" bind:value={date} min={today} required aria-label="Date" />
      </div>
      <div class="flex flex-col gap-1">
        <div class="flex flex-wrap items-center gap-3">
          <input type="time" bind:value={start} required aria-label="Start" />
          <span>to</span>
          <input type="time" bind:value={end} required aria-label="End" />
        </div>
      </div>
      <div class="flex flex-col gap-1">
        <input type="text" bind:value={note} placeholder="Note (optional)" />
      </div>
    </div>
    <Button.Root type="submit" class="appearance-none rounded-md border-0 bg-blue-600 px-4 py-2 text-white hover:bg-blue-500 disabled:cursor-default disabled:opacity-30" disabled={busy}>
      {busy ? 'Adding…' : 'Add block'}
    </Button.Root>
    {#if form?.error}
      <div class="text-red-400" role="alert">{form.error}</div>
    {/if}
  </div>
</form>

<div class="mb-6 overflow-hidden rounded-xl bg-gray-900">
  <div class="border-b border-gray-700 px-4 py-3 font-semibold">Current blocks</div>
  {#if blocks.length === 0}
    <div class="rounded-xl bg-gray-900 p-8 text-center text-gray-400">
      <h3>No blocks set</h3>
      <div>Add one above to make yourself bookable.</div>
    </div>
  {:else}
    <div class="divide-y divide-gray-800">
      {#each blocks as b (b.id)}
        <div class="flex items-center justify-between gap-4 px-4 py-3">
          <div>
            <div>{fmt(b.starts_at)}</div>
            <div class="text-gray-400 text-sm">ends {fmt(b.ends_at)}{b.note ? ' · ' + b.note : ''}</div>
          </div>
          <Button.Root class="appearance-none rounded-md border-0 bg-red-500/15 px-3 py-1 text-sm text-red-400 hover:bg-red-500/25 text-sm" onclick={() => remove(b.id, selectedTech)} aria-label="Remove block">Remove</Button.Root>
        </div>
      {/each}
    </div>
  {/if}
</div>

<div class="mb-6 overflow-hidden rounded-xl bg-gray-900">
  <div class="border-b border-gray-700 px-4 py-3 font-semibold">Your jobs this week</div>
  {#if jobs.length === 0}
    <div class="rounded-xl bg-gray-900 p-8 text-center text-gray-400">None.</div>
  {:else}
    <div class="divide-y divide-gray-800">
      {#each jobs as j (j.id)}
        <a class="block px-4 py-3 hover:bg-gray-800" href={`/jobs/${j.id}`}>
          <div class="flex items-center justify-between gap-4">
            <span class="font-medium">{j.client_name}</span>
            <span class="inline-flex rounded-full bg-gray-800 px-2 py-1 text-sm">{j.status}</span>
          </div>
          <div class="mt-1 text-sm text-gray-400">{fmt(j.starts_at)}</div>
          {#if j.address}
            <div class="mt-1 text-sm text-gray-400">{j.address}</div>
          {/if}
        </a>
      {/each}
    </div>
  {/if}
</div>
