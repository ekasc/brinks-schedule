<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import type { PageData } from './$types';
  import { Button, Select } from 'bits-ui';
  import 'leaflet/dist/leaflet.css';
  export let data: PageData;

  let mapEl: HTMLDivElement;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let L: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let map: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let markersLayer: any = null;

  let techFilter = 'all';
  let statusFilter = 'all';
  let busy = false;
  let geoMsg: string | null = null;

  $: techItems = [{ value: 'all', label: 'All techs' }, ...data.techs.map((t) => ({ value: String(t.id), label: t.display_name }))];
  $: techCounts = (() => {
    const c: Record<string, number> = { all: data.jobs.length };
    for (const t of data.techs) c[String(t.id)] = data.jobs.filter((j: any) => String(j.tech_id) === String(t.id)).length;
    return c;
  })();

  const statusColor: Record<string, string> = {
    sent: '#0A84FF',
    signed: '#22C55E',
    cancelled: '#EF4444',
    declined: '#EF4444'
  };

  $: visible = data.jobs.filter(
    (j: any) =>
      (techFilter === 'all' || String(j.tech_id) === techFilter) &&
      (statusFilter === 'all' || j.status === statusFilter)
  );

  function escape(s: string): string {
    return s.replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function popupHtml(j: any): string {
    const color = statusColor[j.status] || '#8E8E93';
    return `
      <div style="min-width:180px">
        <div style="font-weight:600;font-size:15px;color:#18181B">${escape(j.client_name)}</div>
        <div style="font-size:13px;color:#6B6B70;margin:2px 0 6px">${escape(j.address)}</div>
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
          <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${color}"></span>
          <span style="font-size:13px;color:#3A3A3C">${escape(j.tech_name)}</span>
        </div>
        <a href="/jobs/${j.id}" style="font-size:14px;color:#0A84FF;text-decoration:none;font-weight:600">Open job →</a>
      </div>`;
  }

  function renderMarkers() {
    if (!map || !markersLayer || !L) return;
    markersLayer.clearLayers();
    for (const j of visible) {
      const color = statusColor[j.status] || '#8E8E93';
      const m = L.circleMarker([j.lat, j.lng], {
        radius: 8,
        color: '#fff',
        weight: 2,
        fillColor: color,
        fillOpacity: 0.95
      });
      m.bindPopup(popupHtml(j));
      markersLayer.addLayer(m);
    }
    if (visible.length > 0) {
      map.fitBounds(markersLayer.getBounds(), { padding: [40, 40], maxZoom: 15 });
    } else {
      map.setView([49.2827, -123.1207], 11);
    }
  }

  onMount(async () => {
    L = (await import('leaflet')).default;
    const center: [number, number] = data.jobs.length
      ? [data.jobs[0].lat, data.jobs[0].lng]
      : [49.2827, -123.1207];
    map = L.map(mapEl, { zoomControl: true }).setView(center, 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap'
    }).addTo(map);
    markersLayer = L.featureGroup().addTo(map);
    renderMarkers();
  });

  // re-render whenever filters or the loaded jobs change
  $: if (map && markersLayer && visible) renderMarkers();

  onDestroy(() => {
    if (map) map.remove();
  });

  async function geocodeAll() {
    if (!data.canGeocode || busy) return;
    busy = true;
    geoMsg = null;
    try {
      const fd = new FormData();
      const res = await fetch('?/geocodeAll', { method: 'POST', body: fd });
      const out = await res.json().catch(() => null);
      if (res.ok && out?.ok) {
        geoMsg = `Found ${out.ok} location${out.ok === 1 ? '' : 's'}${out.failed ? ` · ${out.failed} not found` : ''}.`;
        await invalidateAll();
      } else {
        geoMsg = 'Could not geocode right now.';
      }
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Map</title></svelte:head>

<div class="mt-8 mb-8 px-4">
    <h1 class="text-[28px] font-bold tracking-tight">Map</h1>
    <p class="mt-2 text-[15px] leading-relaxed text-[var(--dim)]">
      {data.jobs.length} pinned{data.unmapped ? ` · ${data.unmapped} need a location` : ''}
    </p>
</div>

<div class="form-section">
    <div class="flex flex-wrap items-center gap-3">
      <label class="flex items-center gap-2 text-[14px] text-[var(--ink)]">
        <span class="text-[var(--dim)]">Tech</span>
        <Select.Root type="single" bind:value={techFilter} items={techItems}>
          <Select.Trigger class="flex items-center justify-between gap-2 rounded-[10px] border border-[var(--line)] bg-[var(--row)] px-3 py-2 text-[15px] text-[var(--ink)] cursor-pointer outline-none text-left data-[placeholder]:!text-[var(--dim)]"><Select.Value placeholder="All techs" /><svg width="12" height="8" viewBox="0 0 12 8" fill="none" aria-hidden="true" class="ml-1 shrink-0 text-[var(--dim)]"><path d="M1 1.5L6 6.5L11 1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></Select.Trigger>
          <Select.Portal>
            <Select.Content class="z-[1000] min-w-[220px] w-[var(--bits-floating-anchor-width)] max-w-[92vw] rounded-[10px] border border-[var(--line)] bg-[var(--row)] p-1 text-[var(--ink)] shadow-xl" sideOffset={6}>
              <Select.Viewport>
                <Select.Item value="all" label="All techs" class="flex cursor-pointer items-center justify-between rounded-[8px] px-3 py-2 text-[15px] data-[state=checked]:bg-[var(--row2)] data-[highlighted]:bg-[var(--row2)]"><span>All techs</span><span class="ml-3 rounded-full bg-[var(--row2)] px-2 py-0.5 text-[12px] text-[var(--dim)]">{techCounts['all']}</span></Select.Item>
                {#each data.techs as t}<Select.Item value={String(t.id)} label={t.display_name} class="flex cursor-pointer items-center justify-between rounded-[8px] px-3 py-2 text-[15px] data-[state=checked]:bg-[var(--row2)] data-[highlighted]:bg-[var(--row2)]"><span>{t.display_name}</span><span class="ml-3 rounded-full bg-[var(--row2)] px-2 py-0.5 text-[12px] text-[var(--dim)]">{techCounts[String(t.id)] ?? 0}</span></Select.Item>{/each}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>
      </label>
      <div class="flex gap-2">
        {#each [['all', 'All'], ['sent', 'Sent'], ['signed', 'Signed'], ['cancelled', 'Cancelled'], ['declined', 'Declined']] as [val, label]}
          <Button.Root type="button" class="slot-btn {statusFilter === val ? 'selected' : ''}" onclick={() => (statusFilter = val)}>{label}</Button.Root>
        {/each}
      </div>
      {#if data.canGeocode && data.unmapped > 0}
        <Button.Root type="button" class="rounded-[10px] bg-[var(--blue)] px-4 py-2 text-[14px] font-semibold text-white hover:bg-[var(--blue-press)] disabled:opacity-40" onclick={geocodeAll} disabled={busy}>
          {busy ? 'Finding…' : `Find ${data.unmapped} location${data.unmapped === 1 ? '' : 's'}`}
        </Button.Root>
      {/if}
    </div>
    {#if geoMsg}<p class="mt-2 text-[14px] text-[var(--dim)]">{geoMsg}</p>{/if}
  </div>

<div class="mx-4 mb-4 flex items-center gap-4 text-[13px] text-[var(--dim)]">
    <span class="flex items-center gap-1.5"><span class="inline-block h-2.5 w-2.5 rounded-full" style="background:var(--blue)"></span>Sent</span>
    <span class="flex items-center gap-1.5"><span class="inline-block h-2.5 w-2.5 rounded-full" style="background:var(--green)"></span>Signed</span>
    <span class="flex items-center gap-1.5"><span class="inline-block h-2.5 w-2.5 rounded-full" style="background:var(--red)"></span>Cancelled</span>
    <span class="flex items-center gap-1.5"><span class="inline-block h-2.5 w-2.5 rounded-full" style="background:var(--red)"></span>Declined</span>
</div>

<div class="relative z-0 isolate mx-4 mb-8 overflow-hidden rounded-[14px] border border-[var(--line)]" style="height: calc(100vh - 320px); min-height: 380px;">
  <div bind:this={mapEl} class="h-full w-full"></div>
</div>

{#if visible.length === 0}
  <div class="empty mx-4 !mb-12">
    {data.jobs.length === 0 ? 'No jobs have a location yet.' : 'No jobs match this filter.'}
    <div class="hint">Only jobs with a map location are shown here.</div>
  </div>
{/if}
