<script lang="ts">
  import type { PageData } from './$types';
  export let data: PageData;

  let query = '';
  // Contract stage from job status + completion:
  //   sent (not yet signed) → pending, signed + done → installed, signed → signed, cancelled → cancelled
  const stage = (j: { status: string; completed_at: number | null }) => {
    if (j.status === 'cancelled') return 'cancelled';
    if (j.status === 'sent') return 'pending';
    return j.completed_at ? 'installed' : 'signed';
  };

  $: filtered = data.contracts.filter((c) =>
    c.client_name.toLowerCase().includes(query.trim().toLowerCase())
  );
</script>

<svelte:head><title>Clients</title></svelte:head>

<div class="mt-8 mb-8 px-4 flex items-center justify-between gap-3">
  <h1 class="text-[28px] font-bold tracking-tight">Clients</h1>
  {#if data.isAdmin}<a href="/export" class="export-link rounded-md border border-[var(--line)] bg-[var(--row)] px-3 py-2 text-sm font-medium">Export CSV</a>{/if}
</div>

<div class="px-4 pb-3">
  <input
    class="w-full rounded-[10px] border border-[var(--line)] bg-[var(--row)] px-3 py-2 text-[15px] text-[var(--ink)] outline-none placeholder:text-[var(--dim)]"
    placeholder="Search clients"
    bind:value={query}
    aria-label="Search clients"
  />
</div>

<div class="group group--loose">
  <div class="group-title">All clients · {data.contracts.length}</div>
  {#if data.contracts.length === 0}
    <div class="empty">No clients yet.<div class="hint">Book a job to add a client.</div></div>
  {:else if filtered.length === 0}
    <div class="empty">No clients match “{query}”.</div>
  {:else}
    <div class="group-rows">
      {#each filtered as j (j.id)}
        <a class="job-row" href={`/jobs/${j.id}`}>
          <div class="top">
            <span class="name">{j.client_name}</span>
            <span class="pill {stage(j)}">{stage(j)}</span>
          </div>
          <div class="when">{j.address}</div>
        </a>
      {/each}
    </div>
  {/if}
</div>
