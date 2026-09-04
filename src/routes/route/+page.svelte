<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { goto } from '$app/navigation';
  import type { PageData } from './$types';
  import 'leaflet/dist/leaflet.css';
  import { haversineKm, travelMinutes, fmtDist, fmtMin } from '$lib/geo';
  import { ROUTE_TRAVEL_MODEL, FEASIBILITY } from '$lib/geo/travelModel';
  import { Select, Calendar, Popover, Button, Dialog } from 'bits-ui';
  import { CalendarDate, parseDate, today, getLocalTimeZone } from '@internationalized/date';
  import { swipeSheet } from '$lib/actions/swipeSheet';
  export let data: PageData;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let L: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let map: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let markerLayer: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let routeLayer: any = null;
  let mapEl: HTMLDivElement;

  let selTech = data.techId;
  let selDate = data.date;

  $: routeTechItems = data.techs.map((t) => ({ value: String(t.id), label: t.display_name }));

  // --- Route date bits calendar ---
  let routeDateOpen = false;
  let filterOpen = false;
  let sheetOpen = false;
  let reduceMotion = false;
  onMount(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reduceMotion = mq.matches;
    mq.addEventListener('change', (e) => (reduceMotion = e.matches));
  });
  $: routeCal = selDate ? (() => { try { return parseDate(selDate); } catch { return undefined; } })() : undefined;
  $: routeDisplay = selDate ? (() => { try { const d = new Date(selDate + 'T00:00:00'); return isNaN(d.getTime()) ? selDate : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }); } catch { return selDate; } })() : '';
  function onRouteDateChange(v: CalendarDate | undefined) {
    const iso = v ? v.toString() : '';
    if (!iso) return;
    selDate = iso;
    routeDateOpen = false;
    sheetOpen = false;
    goto(`/route?tech=${selTech}&date=${iso}`);
  }
  let routePlaceholder: CalendarDate | undefined = undefined;
  $: if (!routePlaceholder) routePlaceholder = routeCal ?? today(getLocalTimeZone());
  $: routeWeeks = (() => {
    if (!routePlaceholder) return [];
    const y = routePlaceholder.year, m = routePlaceholder.month;
    const firstWeekday = new Date(y, m - 1, 1).getDay();
    const daysInMonth = new Date(y, m, 0).getDate();
    const daysInPrevMonth = new Date(y, m - 1, 0).getDate();
    const weeks: CalendarDate[][] = [];
    let dc = 1 - firstWeekday;
    for (let w = 0; w < 6; w++) {
      const week: CalendarDate[] = [];
      for (let d = 0; d < 7; d++) {
        let yy = y, mm = m, dd = dc;
        if (dd < 1) { mm = m - 1 === 0 ? 12 : m - 1; yy = m - 1 === 0 ? y - 1 : y; dd = daysInPrevMonth + dd; week.push(new CalendarDate(yy, mm, dd)); }
        else if (dd > daysInMonth) { mm = m + 1 === 13 ? 1 : m + 1; yy = m + 1 === 13 ? y + 1 : y; week.push(new CalendarDate(yy, mm, dd - daysInMonth)); }
        else week.push(new CalendarDate(y, m, dd));
        dc++;
      }
      weeks.push(week);
    }
    return weeks;
  })();
  $: techName = data.techs.find(t => String(t.id) === String(selTech))?.display_name ?? 'Technician';
  $: dateLabel = routeDisplay || selDate || 'Today';
  // While a filter panel/sheet is open it adds/removes flow height; disable scroll
  // anchoring so the page doesn't auto-jump to keep a far element in view.
  $: if (typeof document !== 'undefined') {
    document.documentElement.style.overflowAnchor = (filterOpen || sheetOpen) ? 'none' : '';
  }

  // Feasibility margin and travel speed are explicit policy — not silent defaults.
  // See lib/geo/travelModel.ts for single sources.
  let marginMin = FEASIBILITY.routeMarginMin;
  let speed = ROUTE_TRAVEL_MODEL.speedKmh;

  const statusColor: Record<string, string> = {
    sent: '#0A84FF',
    signed: '#22C55E',
    cancelled: '#EF4444',
    declined: '#EF4444'
  };

  $: located = [...data.jobs]
    .filter((j) => j.lat != null && j.lng != null)
    .sort((a, b) => a.starts_at - b.starts_at);
  $: unlocated = data.jobs.length - located.length;

  $: legs = located.map((j, i) => {
    if (i === 0) return { job: j, leg: null as null | object };
    const prev = located[i - 1];
    const distKm = haversineKm(prev.lat as number, prev.lng as number, j.lat as number, j.lng as number);
    const driveMin = travelMinutes(distKm, speed);
    const gapMin = Math.round((j.starts_at - prev.ends_at) / 60);
    const requiredMin = driveMin + marginMin;
    const ok = gapMin >= requiredMin;
    const idleMin = ok ? gapMin - requiredMin : 0;
    const deficit = ok ? 0 : requiredMin - gapMin;
    return {
      job: j,
      leg: { distKm, driveMin, gapMin, requiredMin, ok, idleMin, deficit }
    };
  });

  $: totalDist = legs.reduce((s, l) => s + (l.leg ? (l.leg as any).distKm : 0), 0);
  $: totalDrive = legs.reduce((s, l) => s + (l.leg ? (l.leg as any).driveMin : 0), 0);
  $: conflicts = legs.filter((l) => l.leg && !(l.leg as any).ok).length;

  function fmtTime(ts: number) {
    return new Date(ts * 1000).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  }

  function drawRoute(jobs: typeof located) {
    if (!map || !markerLayer || !routeLayer) return;
    markerLayer.clearLayers();
    routeLayer.clearLayers();
    if (jobs.length === 0) {
      map.setView([49.2827, -123.1207], 11);
      return;
    }
    const coords: [number, number][] = [];
    jobs.forEach((j, i) => {
      const color = statusColor[j.status] || '#8E8E93';
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:26px;height:26px;border-radius:50%;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)">${i + 1}</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13]
      });
      const m = L.marker([j.lat as number, j.lng as number], { icon });
      m.bindPopup(
        `<div style="min-width:170px"><div style="font-weight:600;font-size:15px;color:#18181B">#${i + 1} ${escapeHtml(j.client_name)}</div>` +
        `<div style="font-size:13px;color:#6B6B70;margin:2px 0 4px">${escapeHtml(j.address)}</div>` +
        `<div style="font-size:13px;color:#3A3A3C">${fmtTime(j.starts_at)} – ${fmtTime(j.ends_at)}</div></div>`
      );
      markerLayer.addLayer(m);
      coords.push([j.lat as number, j.lng as number]);
    });
    if (coords.length > 1) {
      routeLayer.addLayer(L.polyline(coords, { color: '#0A84FF', weight: 3, opacity: 0.8 }));
    }
    map.fitBounds(markerLayer.getBounds(), { padding: [40, 40], maxZoom: 15 });
  }

  onMount(async () => {
    L = (await import('leaflet')).default;
    map = L.map(mapEl, { zoomControl: true }).setView([49.2827, -123.1207], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap'
    }).addTo(map);
    markerLayer = L.featureGroup().addTo(map);
    routeLayer = L.layerGroup().addTo(map);
    drawRoute(located);
  });

  $: if (map && markerLayer && routeLayer) drawRoute(located);

  onDestroy(() => {
    if (map) map.remove();
  });
</script>

<svelte:head><title>Route</title></svelte:head>

{#snippet filterPlan()}
  <div class="group !mx-0">
    <div class="group-title">Plan</div>
    <div class="input-group">
      <label class="field">
        <span class="key">Technician</span>
        <Select.Root type="single" value={String(selTech)} onValueChange={(v) => { if (v) { selTech = Number(v); goto(`/route?tech=${v}&date=${selDate}`); } }} items={routeTechItems}>
          <Select.Trigger class="w-full bg-transparent py-0 text-[var(--t-17)] text-[var(--ink)] outline-none placeholder:text-[var(--dim)] flex cursor-pointer items-center justify-between text-left data-[placeholder]:!text-[var(--dim)]" aria-label="Technician"><Select.Value placeholder="Technician" /><svg width="12" height="8" viewBox="0 0 12 8" fill="none" aria-hidden="true" class="ml-2 shrink-0 text-[var(--dim)]"><path d="M1 1.5L6 6.5L11 1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></Select.Trigger>
          <Select.Portal>
            <Select.Content class="z-[1002] min-w-[220px] w-[var(--bits-floating-anchor-width)] max-w-[92vw] rounded-[10px] border border-[var(--line)] bg-[var(--row)] p-1 text-[var(--ink)] shadow-xl" sideOffset={6}>
              <Select.Viewport>
                {#each data.techs as t}<Select.Item value={String(t.id)} label={t.display_name} class="cursor-pointer rounded-[8px] px-3 py-2 text-[15px] data-[state=checked]:bg-[var(--row2)] data-[highlighted]:bg-[var(--row2)]">{t.display_name}</Select.Item>{/each}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>
      </label>
      <label class="field">
        <span class="key">Date</span>
        <Popover.Root bind:open={routeDateOpen}>
          <Popover.Trigger>
            {#snippet child({ props })}
              <button {...props} type="button" class="w-full bg-transparent py-0 text-[var(--t-17)] text-[var(--ink)] outline-none placeholder:text-[var(--dim)] flex cursor-pointer items-center justify-between text-left data-[placeholder]:!text-[var(--dim)] active:!scale-100" aria-label="Date" data-placeholder={!routeDisplay ? '' : undefined}>
                <span class={!routeDisplay ? 'text-[var(--dim)]' : ''}>{routeDisplay || 'Date'}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="ml-2 shrink-0 text-[var(--dim)]"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
              </button>
            {/snippet}
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content class="z-[1002] w-[320px] rounded-[14px] border border-[var(--line)] bg-[var(--row)] p-3 shadow-xl" sideOffset={8} side="bottom" align="start">
              <Calendar.Root type="single" value={routeCal as any} bind:placeholder={routePlaceholder as any} onValueChange={onRouteDateChange as any} locale="en-CA" weekdayFormat="short" fixedWeeks={true} class="w-full">
                <Calendar.Header class="flex items-center justify-between pb-3 gap-2">
                  <Calendar.PrevButton class="grid h-8 w-8 place-items-center rounded-full hover:bg-[var(--row2)] text-[var(--ink)]"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></Calendar.PrevButton>
                  <div class="flex items-center gap-2">
                    <Calendar.MonthSelect class="rounded-[8px] border border-[var(--line)] bg-[var(--row)] px-2.5 py-1.5 text-[14px] font-medium text-[var(--ink)] outline-none" aria-label="Select month" />
                    <Calendar.YearSelect class="rounded-[8px] border border-[var(--line)] bg-[var(--row)] px-2.5 py-1.5 text-[14px] font-medium text-[var(--ink)] outline-none" aria-label="Select year" />
                  </div>
                  <Calendar.NextButton class="grid h-8 w-8 place-items-center rounded-full hover:bg-[var(--row2)] text-[var(--ink)]"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg></Calendar.NextButton>
                </Calendar.Header>
                <Calendar.Grid class="w-full">
                  <Calendar.GridHead>
                    <Calendar.GridRow class="flex justify-between">
                      <Calendar.HeadCell class="grid h-8 w-8 place-items-center text-[12px] font-medium text-[var(--dim)]">Su</Calendar.HeadCell>
                      <Calendar.HeadCell class="grid h-8 w-8 place-items-center text-[12px] font-medium text-[var(--dim)]">Mo</Calendar.HeadCell>
                      <Calendar.HeadCell class="grid h-8 w-8 place-items-center text-[12px] font-medium text-[var(--dim)]">Tu</Calendar.HeadCell>
                      <Calendar.HeadCell class="grid h-8 w-8 place-items-center text-[12px] font-medium text-[var(--dim)]">We</Calendar.HeadCell>
                      <Calendar.HeadCell class="grid h-8 w-8 place-items-center text-[12px] font-medium text-[var(--dim)]">Th</Calendar.HeadCell>
                      <Calendar.HeadCell class="grid h-8 w-8 place-items-center text-[12px] font-medium text-[var(--dim)]">Fr</Calendar.HeadCell>
                      <Calendar.HeadCell class="grid h-8 w-8 place-items-center text-[12px] font-medium text-[var(--dim)]">Sa</Calendar.HeadCell>
                    </Calendar.GridRow>
                  </Calendar.GridHead>
                  <Calendar.GridBody>
                    {#each routeWeeks as week}
                      <Calendar.GridRow class="flex justify-between">
                        {#each week as date}
                          <Calendar.Cell date={date} month={routePlaceholder as any} class="p-0">
                            <Calendar.Day class="grid h-8 w-8 place-items-center rounded-full text-[14px] hover:bg-[var(--row2)] data-[selected]:!bg-[var(--blue)] data-[selected]:!text-white data-[disabled]:opacity-30 data-[outside-month]:opacity-30 data-[today]:ring-1 data-[today]:ring-[var(--blue)]" />
                          </Calendar.Cell>
                        {/each}
                      </Calendar.GridRow>
                    {/each}
                  </Calendar.GridBody>
                </Calendar.Grid>
                <div class="mt-3 flex justify-end gap-2 border-t border-[var(--line-thin)] pt-3">
                  <Button.Root type="button" class="rounded-[8px] bg-[var(--blue)] px-3 py-1.5 text-[13px] font-medium text-white hover:bg-[var(--blue-press)]" onclick={() => routeDateOpen = false}>Done</Button.Root>
                </div>
              </Calendar.Root>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </label>
      <label class="field">
        <span class="key">Buffer (min)</span>
        <input type="number" min="0" max="120" bind:value={marginMin} inputmode="numeric" aria-label="Buffer minutes" placeholder="15" class="w-full bg-transparent py-0 text-[var(--t-17)] text-[var(--ink)] outline-none placeholder:text-[var(--dim)]" />
      </label>
      <label class="field">
        <span class="key">Avg speed (km/h)</span>
        <input type="number" min="10" max="120" bind:value={speed} inputmode="numeric" aria-label="Average speed" placeholder="40" class="w-full bg-transparent py-0 text-[var(--t-17)] text-[var(--ink)] outline-none placeholder:text-[var(--dim)]" />
      </label>
    </div>
  </div>
{/snippet}

<div class="mt-8 mb-8 px-4">
  <h1 class="text-[28px] font-bold tracking-tight">Route planner</h1>
</div>

<!-- Filters: mobile opens a bottom sheet; desktop expands inline -->
<div class="mb-4 border-y border-[var(--line-thin)] bg-[var(--row)]">
  <button type="button" class="flex w-full min-w-0 cursor-pointer items-center justify-between gap-2 overflow-hidden px-4 py-3 text-left transition-opacity active:!opacity-90" onclick={() => { if (typeof window !== 'undefined' && window.matchMedia('(min-width: 541px)').matches) filterOpen = !filterOpen; else sheetOpen = true; }} aria-expanded={filterOpen || sheetOpen} aria-label="Toggle filters">
    <span class="flex min-w-0 items-center gap-2 text-[14px] font-medium text-[var(--ink)]">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="shrink-0 text-[var(--dim)]"><path d="M3 6h18M7 12h10M10 18h4"/></svg>
      <span class="truncate">{techName} · {dateLabel}</span>
    </span>
    <span class="flex shrink-0 items-center gap-2">
      <span class="whitespace-nowrap rounded-full bg-[var(--row2)] px-2 py-0.5 text-[11px] font-medium text-[var(--dim)]">{located.length} stops</span>
      <svg width="16" height="16" viewBox="0 0 12 8" fill="none" aria-hidden="true" class="text-[var(--dim)] transition-transform" style="transform: rotate({filterOpen ? 180 : 0}deg)"><path d="M1 1.5L6 6.5L11 1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </span>
  </button>
</div>

{#if filterOpen}
  <div class="form-section desktop-filter-panel" transition:slide={{ duration: reduceMotion ? 0 : 340, easing: cubicOut }}>
    {@render filterPlan()}
    <div class="mt-4 flex gap-2">
      <Button.Root class="rounded-full border border-[var(--line)] bg-[var(--row)] px-4 py-3 text-[15px] font-medium text-[var(--ink)] hover:bg-[var(--row2)]" onclick={() => (filterOpen = false)}>Close</Button.Root>
    </div>
  </div>
{/if}

<!-- Mobile: bottom-sheet dialog (desktop uses the inline panel above) -->
<Dialog.Root bind:open={sheetOpen}>
  <Dialog.Portal>
    <Dialog.Overlay class="route-sheet-overlay fixed inset-0 z-[1000] bg-black/40 backdrop-blur-sm" />
    <Dialog.Content class="route-sheet-content fixed inset-x-0 bottom-0 z-[1001] max-h-[85vh] overflow-hidden rounded-t-[20px] border-t border-[var(--line)] bg-[var(--bg)] shadow-2xl">
      <div use:swipeSheet={{ onClose: () => sheetOpen = false }} class="flex flex-col">
      <div data-sheet-handle class="mx-auto flex justify-center py-3 -my-1" aria-hidden="true" style="touch-action:none;"><div class="h-1.5 w-10 rounded-full bg-[var(--line)]"></div></div>
      <div class="flex items-center justify-between px-4 pb-2 pt-4">
        <h2 class="text-[17px] font-semibold">Filters</h2>
        <Button.Root class="rounded-full bg-[var(--row)] px-3 py-1.5 text-[14px] font-medium text-[var(--ink)] border border-[var(--line)]" onclick={() => (sheetOpen = false)}>Done</Button.Root>
      </div>
      <div class="overflow-y-auto px-4 pb-8 pt-2" style="max-height: calc(85vh - 60px);">
        {@render filterPlan()}
        <div class="mt-4 flex gap-2">
          <Button.Root class="rounded-full border border-[var(--line)] bg-[var(--row)] px-4 py-3 text-[15px] font-medium text-[var(--ink)] hover:bg-[var(--row2)]" onclick={() => (sheetOpen = false)}>Close</Button.Root>
        </div>
      </div>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

{#if data.jobs.length === 0}
  <div class="empty mx-4 !mb-10">Nothing booked for this tech on {selDate}.</div>
{:else}
  <div class="mx-4 mb-4 flex flex-wrap items-center gap-3 text-[14px]">
    <span class="rounded-full bg-[var(--row)] px-3 py-1.5 text-[var(--ink)] border border-[var(--line-thin)]">{located.length} stops</span>
    <span class="rounded-full bg-[var(--row)] px-3 py-1.5 text-[var(--ink)] border border-[var(--line-thin)]">{fmtDist(totalDist)} · {fmtMin(totalDrive)} driving</span>
    {#if conflicts > 0}
      <span class="rounded-full bg-[var(--red)]/10 px-3 py-1.5 text-[var(--red)] border border-[var(--red)]/20">{conflicts} conflict{conflicts === 1 ? '' : 's'}</span>
    {:else if located.length > 1}
      <span class="rounded-full bg-[var(--green)]/10 px-3 py-1.5 text-[var(--green)] border border-[var(--green)]/20">All reachable</span>
    {/if}
    {#if unlocated > 0}
      <span class="rounded-full bg-[var(--row)] px-3 py-1.5 text-[var(--dim)] border border-[var(--line-thin)]">{unlocated} without a location</span>
    {/if}
  </div>

  <div class="relative z-0 isolate mx-4 mb-8 overflow-hidden rounded-[14px] border border-[var(--line)]" style="height: calc(100vh - 420px); min-height: 320px;">
    <div bind:this={mapEl} class="h-full w-full"></div>
  </div>

  <!-- Mobile-first navigation list — large, high-contrast, thumb-reachable -->
  <div class="mx-4 mb-12 flex flex-col">
    {#each legs as item, i}
      {#if item.leg}
        {@const leg = item.leg as any}
        <div class="relative ml-5 flex items-center gap-3 border-l-2 border-dashed py-3 pl-6 {leg.ok ? 'border-[var(--line-thin)]' : 'border-[var(--red)]/40'}">
          <span class="absolute -left-[9px] top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 bg-[var(--bg)] {leg.ok ? 'border-[var(--dim2)]' : 'border-[var(--red)] bg-[var(--red)]'}" aria-hidden="true"></span>
          <span class="text-[14px] font-medium {leg.ok ? 'text-[var(--ink)]' : 'text-[var(--red)]'}">{fmtDist(leg.distKm)} · {fmtMin(leg.driveMin)}</span>
          {#if leg.ok}
            <span class="rounded-full bg-[var(--green)]/15 px-2.5 py-1 text-[12px] font-semibold text-[var(--green)] border border-[var(--green)]/20">{leg.idleMin > 0 ? `${leg.idleMin} min buffer` : 'buffer ok'}</span>
          {:else}
            <span class="rounded-full bg-[var(--red)]/15 px-2.5 py-1 text-[12px] font-bold text-[var(--red)] border border-[var(--red)]/25">⚠ {leg.deficit} min short{leg.gapMin < 0 ? ' • overlaps' : ''}</span>
          {/if}
        </div>
      {/if}
      {@const j = item.job}
      <div class="group group--tight !mb-3">
        <div class="group-rows !overflow-visible !rounded-[16px]">
          <div class="p-4 sm:p-5">
            <div class="flex items-start gap-4">
              <span class="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[16px] font-bold text-white shadow-sm" style="background:{statusColor[j.status] || '#8E8E93'}; box-shadow: 0 2px 8px rgba(0,0,0,0.25)">{i + 1}</span>
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="text-[18px] font-bold leading-tight text-[var(--ink)]">{j.client_name}</span>
                  <span class="pill {j.status} !text-[12px] !px-2.5 !py-1">{j.status}</span>
                </div>
                <div class="mt-1 text-[15px] font-medium leading-snug text-[var(--ink)]">{j.address}</div>
                <div class="mt-1.5 inline-flex items-center gap-2 rounded-full bg-[var(--row2)] px-3 py-1.5 text-[14px] font-medium text-[var(--ink)] border border-[var(--line-thin)]">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="shrink-0 text-[var(--dim)]"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l2 2"/></svg>
                  {fmtTime(j.starts_at)} — {fmtTime(j.ends_at)}
                </div>
              </div>
            </div>
            <div class="mt-4 grid grid-cols-2 gap-2">
              <a href="https://www.google.com/maps/dir/?api=1&destination={j.lat},{j.lng}&travelmode=driving" target="_blank" rel="noopener" class="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-[var(--blue)] px-4 text-[15px] font-semibold text-white shadow-sm hover:bg-[var(--blue-press)] active:opacity-90">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s7-6 7-12a7 7 0 1 0-14 0c0 6 7 12 7 12z"/><circle cx="12" cy="10" r="3"/></svg>
                Navigate
              </a>
              <a href="/jobs/{j.id}" class="inline-flex min-h-[44px] items-center justify-center rounded-full border border-[var(--line)] bg-[var(--row)] px-4 text-[15px] font-medium text-[var(--ink)] hover:bg-[var(--row2)]">Details</a>
            </div>
          </div>
        </div>
      </div>
    {/each}
  </div>
{/if}
