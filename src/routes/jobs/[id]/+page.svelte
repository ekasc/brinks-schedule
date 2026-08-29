<script lang="ts">
  import type { PageData } from './$types';
  import { invalidateAll } from '$app/navigation';
  export let data: PageData;

  let showMap = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let leafletMap: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pinMarker: any = null;
  let mapEl: HTMLDivElement | undefined;
  let busy = false;
  let pendingLat: number | null = null;
  let pendingLng: number | null = null;

  function fmt(ts: number) {
    return new Date(ts * 1000).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  function fmtDate(s: string) {
    return new Date(s + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
  function age(dob: string) {
    const d = new Date(dob + 'T00:00:00');
    const now = new Date();
    let years = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) years--;
    return years;
  }

  async function setStatus(s: string) {
    if (!confirm(`Mark this job as ${s}?`)) return;
    busy = true;
    try {
      const fd = new FormData();
      fd.set('status', s);
      await fetch('?/status', { method: 'POST', body: fd });
      await invalidateAll();
    } finally {
      busy = false;
    }
  }

  async function openMap() {
    showMap = true;
    await new Promise(r => setTimeout(r, 50));
    const L = (await import('leaflet')).default;
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    const start: [number, number] = (j.lat != null && j.lng != null) ? [j.lat, j.lng] : [49.2827, -123.1207];
    leafletMap = L.map(mapEl, { zoomControl: true }).setView(start, j.lat != null ? 14 : 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(leafletMap);
    if (j.lat != null && j.lng != null) {
      pinMarker = L.marker([j.lat, j.lng]).addTo(leafletMap);
      pendingLat = j.lat; pendingLng = j.lng;
    }
    leafletMap.on('click', (e: { latlng: { lat: number; lng: number } }) => {
      if (pinMarker) pinMarker.remove();
      pinMarker = L.marker([e.latlng.lat, e.latlng.lng]).addTo(leafletMap);
      pendingLat = e.latlng.lat;
      pendingLng = e.latlng.lng;
    });
  }

  function closeMap() {
    if (leafletMap) { leafletMap.remove(); leafletMap = null; }
    pinMarker = null;
    showMap = false;
  }

  async function saveCoords() {
    if (pendingLat == null || pendingLng == null) return;
    busy = true;
    try {
      const fd = new FormData();
      fd.set('lat', String(pendingLat));
      fd.set('lng', String(pendingLng));
      await fetch('?/coords', { method: 'POST', body: fd });
      await invalidateAll();
      closeMap();
    } finally {
      busy = false;
    }
  }

  $: j = data.job;
  $: idLabel = j.id_type === 'dl' ? "Driver's licence" : j.id_type === 'passport' ? 'Passport' : j.id_type === 'bcid' ? 'BCID' : j.id_type === 'other' ? 'Other' : '—';
  $: services = [j.svc_internet ? 'Internet' : null, j.svc_home_phone ? 'Home phone' : null, j.svc_tv ? 'TV' : null].filter(Boolean) as string[];
  $: nextStatus = j.status === 'sent' ? 'signed' : null;
  $: prevStatus = j.status === 'signed' ? 'sent' : j.status === 'cancelled' ? 'sent' : null;
  $: canComplete = j.status === 'signed' && !j.completed_at;
  $: canUncomplete = j.status === 'signed' && j.completed_at != null;

  function advance() { if (nextStatus) setStatus(nextStatus); }
  function reopen() { if (prevStatus) setStatus(prevStatus); }

  const statusLabel: Record<string, string> = { sent: 'Sent', signed: 'Signed', cancelled: 'Cancelled' };

  function goBack() {
    if (typeof window !== 'undefined' && window.history.length > 1) history.back();
    else location.href = '/';
  }
  async function setCompleted(done: boolean) {
    busy = true;
    try {
      const fd = new FormData();
      fd.set('completed', done ? '1' : '0');
      await fetch('?/complete', { method: 'POST', body: fd });
      await invalidateAll();
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>{j.client_name}</title></svelte:head>

<button on:click={goBack} class="mt-6 flex items-center gap-1.5 px-4 text-[14px] font-medium text-[var(--dim)] hover:text-[var(--ink)] transition-colors" aria-label="Go back">
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
  Back
</button>
<!-- Title: generous top breathing room, tight internal grouping, clear hierarchy -->
<div class="mt-4 mb-8 px-4">
  <div class="flex flex-wrap items-baseline gap-3">
    <h1 class="text-[30px] font-bold tracking-[-0.02em] leading-none">{j.client_name}</h1>
    <span class="pill {j.status}">{statusLabel[j.status] ?? j.status}</span>
    {#if j.status === 'signed' && j.completed_at != null}<span class="pill completed">Completed</span>{/if}
  </div>
  <div class="mt-2 flex flex-wrap gap-2 text-[13px] text-[var(--dim)]">
    <span>{fmt(j.starts_at)} → {fmt(j.ends_at)}</span>
    <span class="opacity-40">·</span>
    <span>{j.address}</span>
  </div>
</div>

<!-- Primary card: Job — elevated via tighter internal rhythm -->
<div class="group group--loose">
  <div class="group-title">Job details</div>
  <div class="group-rows">
    <!-- 2-col grid for time — breaks card monotony, saves vertical space -->
    <div class="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-[var(--line-thin)]">
      <div class="row-line flex-col items-start gap-1 py-3">
        <span class="text-[11px] uppercase tracking-wide text-[var(--dim)]">Starts</span>
        <span class="text-[17px] font-semibold text-[var(--ink)]">{fmt(j.starts_at)}</span>
      </div>
      <div class="row-line flex-col items-start gap-1 py-3">
        <span class="text-[11px] uppercase tracking-wide text-[var(--dim)]">Ends</span>
        <span class="text-[17px] font-semibold text-[var(--ink)]">{fmt(j.ends_at)}</span>
      </div>
    </div>
    <div class="row-line">
      <span class="label">Tech</span>
      <span class="value ink">{data.tech?.display_name ?? '—'}</span>
    </div>
    <div class="row-line">
      <span class="label">Booked by</span>
      <span class="value ink">{data.booker?.display_name ?? '—'}</span>
    </div>
    <div class="row-line">
      <span class="label">Address</span>
      <span class="value ink">{j.address}</span>
    </div>
    {#if j.lat != null && j.lng != null}
      <div class="row-line row-line--compact">
        <span class="label">Location</span>
        <span class="value ink font-mono text-[14px]">{j.lat.toFixed(4)}, {j.lng.toFixed(4)}</span>
      </div>
    {/if}
    {#if j.email}
      <div class="row-line row-line--compact">
        <span class="label">Email</span>
        <span class="value ink break-all">{j.email}</span>
      </div>
    {/if}
  </div>
</div>

{#if data.canSeePii}
  <div class="group">
    <div class="group-title">Customer — private</div>
    <div class="group-rows">
      {#if j.dob}
        <div class="row-line">
          <span class="label">Date of birth</span>
          <span class="value ink">{fmtDate(j.dob)}{age(j.dob) >= 0 ? ' (' + age(j.dob) + ')' : ''}</span>
        </div>
      {/if}
      {#if j.telus_pin}
        <div class="row-line row-line--compact">
          <span class="label">TELUS PIN</span>
          <span class="value ink font-mono tracking-wide">{j.telus_pin}</span>
        </div>
      {/if}
      {#if j.id_type || j.id_last4}
        <div class="row-line row-line--compact">
          <span class="label">ID</span>
          <span class="value ink">{idLabel}{j.id_last4 ? ' · ••' + j.id_last4 : ''}</span>
        </div>
      {/if}
      {#if j.emergency_name || j.emergency_number}
        <div class="row-line">
          <span class="label">Emergency</span>
          <span class="value ink text-right leading-snug">
            {j.emergency_name ?? ''}{j.emergency_relation ? ' (' + j.emergency_relation + ')' : ''}{#if j.emergency_name && j.emergency_number}<br/>{/if}{j.emergency_number ?? ''}
          </span>
        </div>
      {/if}
      {#if j.verbal_password}
        <div class="row-line row-line--compact">
          <span class="label">Verbal password</span>
          <span class="value ink font-mono">{j.verbal_password}</span>
        </div>
      {/if}
    </div>
  </div>
{/if}

<!-- Services: break monotony — chips instead of rows -->
<div class="group group--tight">
  <div class="group-title">TELUS services</div>
  {#if services.length === 0}
    <div class="empty !py-6">None recorded.</div>
  {:else}
    <div class="group-rows">
      <div class="flex flex-wrap gap-2 p-4">
        {#each services as s}<span class="pill signed !py-1">{s}</span>{/each}
      </div>
      {#if j.themes}
        <div class="border-t border-[var(--line-thin)] px-4 py-3">
          <div class="text-[11px] uppercase tracking-wide text-[var(--dim)] mb-1">Themes / package details</div>
          <div class="text-[15px] leading-relaxed text-[var(--ink)] whitespace-pre-wrap">{j.themes}</div>
        </div>
      {/if}
    </div>
  {/if}
</div>

{#if j.security_offered}
  <div class="group">
    <div class="group-title">Home security</div>
    <div class="group-rows">
      <div class="px-4 py-4 text-[15px] leading-relaxed whitespace-pre-wrap text-[var(--ink)]">{j.security_offered}</div>
    </div>
  </div>
{/if}

{#if j.notes}
  <div class="group">
    <div class="group-title">Notes</div>
    <div class="group-rows">
      <div class="px-4 py-4 text-[15px] leading-relaxed whitespace-pre-wrap text-[var(--ink)]">{j.notes}</div>
    </div>
  </div>
{/if}

<!-- Actions: generous separation before, tight internal grouping -->
{#if data.canEdit}
  <div class="mt-8 flex flex-col gap-3 px-4">
    <div class="flex flex-wrap gap-2">
      <button class="rounded-full border border-[var(--line)] bg-[var(--row)] px-4 py-2 text-[15px] font-medium text-[var(--blue)] hover:bg-[var(--row2)]" on:click={openMap}>{j.lat != null ? 'Move pin' : 'Set location'}</button>
      {#if j.status === 'cancelled'}
        <button class="rounded-full bg-[var(--row)] px-4 py-2 text-[15px] font-medium text-[var(--blue)] border border-[var(--line)]" on:click={reopen} disabled={busy}>Restore</button>
      {/if}
    </div>
    {#if nextStatus}
      <div class="flex flex-wrap gap-2">
        <button class="flex-1 sm:flex-none rounded-[10px] bg-[var(--blue)] px-5 py-3 text-[17px] font-semibold text-white hover:bg-[var(--blue-press)] disabled:opacity-30 min-h-[50px]" on:click={advance} disabled={busy}>Mark {statusLabel[nextStatus]}</button>
        {#if j.status !== 'cancelled'}<button class="rounded-[10px] border border-red-500/20 bg-red-500/10 px-5 py-3 text-[15px] font-medium text-red-500 hover:bg-red-500/15 disabled:opacity-30" on:click={() => setStatus('cancelled')} disabled={busy}>Cancel</button>{/if}
      </div>
    {/if}
    {#if j.status === 'signed'}
      <div class="flex flex-wrap items-center gap-4 pt-6 border-t border-[var(--line-thin)] mt-6">
        {#if canComplete}
          <button class="rounded-[10px] bg-emerald-600 px-5 py-3 text-[15px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-30" on:click={() => setCompleted(true)} disabled={busy}>Mark install completed</button>
        {:else if canUncomplete && j.completed_at != null}
          <button class="text-[15px] text-[var(--blue)] hover:opacity-70" on:click={() => setCompleted(false)} disabled={busy}>Reopen install</button>
          <span class="text-sm text-[var(--dim)]">Done {fmt(j.completed_at)}</span>
        {/if}
      </div>
    {/if}
  </div>
{/if}

{#if showMap}
  <div class="fixed inset-0 z-50 flex flex-col bg-[var(--bg)]" role="dialog" aria-modal="true" aria-label="Drop pin on map">
    <div class="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
      <h2 class="text-[17px] font-semibold">Drop a pin</h2>
      <button class="text-[var(--blue)] hover:opacity-70" on:click={closeMap} aria-label="Close">Cancel</button>
    </div>
    <div bind:this={mapEl} class="h-full w-full"></div>
    <div class="flex items-center justify-between border-t border-[var(--line)] px-4 py-3 gap-3">
      {#if pendingLat != null}
        <span class="text-sm text-[var(--dim)] font-mono">Pin: {pendingLat.toFixed(4)}, {pendingLng?.toFixed(4)}</span>
      {:else}
        <span class="text-sm text-[var(--dim)]">Tap the map to drop a pin.</span>
      {/if}
      <button class="rounded-[10px] bg-[var(--blue)] px-5 py-2.5 text-[15px] font-semibold text-white hover:bg-[var(--blue-press)] disabled:opacity-30 shrink-0" on:click={saveCoords} disabled={pendingLat == null || busy}>
        {busy ? 'Saving…' : 'Save location'}
      </button>
    </div>
  </div>
{/if}

<div class="mt-10 flex justify-between px-4 text-sm">
  <a class="text-[var(--dim)] hover:text-[var(--ink)] transition-colors" href="/calendar">← Week</a>
  <a class="text-[var(--dim)] hover:text-[var(--ink)] transition-colors" href="/map">Map →</a>
</div>
