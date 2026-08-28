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
    // wait a tick so the div is in the DOM
    await new Promise(r => setTimeout(r, 50));
    const L = (await import('leaflet')).default;
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    const start: [number, number] = (j.lat != null && j.lng != null)
      ? [j.lat, j.lng]
      : [49.2827, -123.1207];
    leafletMap = L.map(mapEl, { zoomControl: true }).setView(start, j.lat != null ? 14 : 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap'
    }).addTo(leafletMap);

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
  $: idLabel = j.id_type === 'dl' ? "Driver's licence" :
               j.id_type === 'passport' ? 'Passport' :
               j.id_type === 'bcid' ? 'BCID' :
               j.id_type === 'other' ? 'Other' :
               '—';
  $: services = [
    j.svc_internet ? 'Internet' : null,
    j.svc_home_phone ? 'Home phone' : null,
    j.svc_tv ? 'TV' : null
  ].filter(Boolean) as string[];

  $: nextStatus = j.status === 'sent' ? 'signed' : null;
  $: prevStatus = j.status === 'signed' ? 'sent'
                : j.status === 'cancelled' ? 'sent'
                : null;
  $: canComplete = j.status === 'signed' && !j.completed_at;
  $: canUncomplete = j.status === 'signed' && j.completed_at != null;

  function advance() {
    if (nextStatus) setStatus(nextStatus);
  }
  function reopen() {
    if (prevStatus) setStatus(prevStatus);
  }

  const statusLabel: Record<string, string> = {
    sent: 'Sent',
    signed: 'Signed',
    cancelled: 'Cancelled'
  };

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

<style>
  .map-modal {
    position: fixed; inset: 0; z-index: 100;
    background: var(--bg);
    display: flex; flex-direction: column;
  }
  .map-modal-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: var(--s-3) var(--s-4);
    border-bottom: 1px solid var(--line);
  }
  .map-modal-head > h2 { font-size: var(--t-17); font-weight: 600; margin: 0; }
  .map-modal .map { flex: 1; width: 100%; }
  .map-modal-foot {
    display: flex; align-items: center; justify-content: space-between;
    padding: var(--s-3) var(--s-4);
    border-top: 1px solid var(--line);
    gap: var(--s-3);
  }
</style>

<svelte:head><title>{j.client_name}</title></svelte:head>

<div class="large-title inline">
  <h1>{j.client_name}</h1>
  <div style="display: flex; gap: var(--s-2); align-items: center;">
    <span class="pill {j.status}">{statusLabel[j.status] ?? j.status}</span>
    {#if j.status === 'signed' && j.completed_at != null}
      <span class="pill completed">Completed</span>
    {/if}
  </div>
</div>

<div class="group">
  <div class="group-title">Job</div>
  <div class="group-rows">
    <div class="row-line">
      <span class="label">When</span>
      <span class="value ink">{fmt(j.starts_at)}</span>
    </div>
    <div class="row-line">
      <span class="label">Until</span>
      <span class="value ink">{fmt(j.ends_at)}</span>
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
      <div class="row-line">
        <span class="label">Location</span>
        <span class="value ink">{j.lat.toFixed(4)}, {j.lng.toFixed(4)}</span>
      </div>
    {/if}
    {#if j.email}
      <div class="row-line">
        <span class="label">Email</span>
        <span class="value ink">{j.email}</span>
      </div>
    {/if}
  </div>
</div>

{#if data.canSeePii}
  <div class="group">
    <div class="group-title">Customer PII</div>
    <div class="group-rows">
      {#if j.dob}
        <div class="row-line">
          <span class="label">Date of birth</span>
          <span class="value ink">{fmtDate(j.dob)}{age(j.dob) >= 0 ? ' (' + age(j.dob) + ')' : ''}</span>
        </div>
      {/if}
      {#if j.telus_pin}
        <div class="row-line">
          <span class="label">TELUS PIN</span>
          <span class="value ink">{j.telus_pin}</span>
        </div>
      {/if}
      {#if j.id_type || j.id_last4}
        <div class="row-line">
          <span class="label">ID</span>
          <span class="value ink">{idLabel}{j.id_last4 ? ' · ••' + j.id_last4 : ''}</span>
        </div>
      {/if}
      {#if j.emergency_name || j.emergency_number}
        <div class="row-line">
          <span class="label">Emergency</span>
          <span class="value ink">
            {j.emergency_name ?? ''}{j.emergency_relation ? ' (' + j.emergency_relation + ')' : ''}{#if j.emergency_name && j.emergency_number}<br/>{/if}{j.emergency_number ?? ''}
          </span>
        </div>
      {/if}
      {#if j.verbal_password}
        <div class="row-line">
          <span class="label">Verbal password</span>
          <span class="value ink">{j.verbal_password}</span>
        </div>
      {/if}
    </div>
  </div>
{/if}

<div class="group">
  <div class="group-title">TELUS services</div>
  {#if services.length === 0}
    <div class="empty" style="padding: var(--s-5) var(--s-4);">None recorded.</div>
  {:else}
    <div class="group-rows">
      {#each services as s}
        <div class="row-line">
          <span class="label">{s}</span>
          <span class="value ink">Yes</span>
        </div>
      {/each}
      {#if j.themes}
        <div class="row-line" style="flex-direction: column; align-items: stretch; gap: 4px; padding-top: var(--s-3); padding-bottom: var(--s-3);">
          <span class="label dim small">Themes / package details</span>
          <span style="color: var(--ink); font-size: var(--t-15); white-space: pre-wrap;">{j.themes}</span>
        </div>
      {/if}
    </div>
  {/if}
</div>

{#if j.security_offered}
  <div class="group">
    <div class="group-title">Home security being offered</div>
    <div class="group-rows">
      <div class="row-line" style="white-space: pre-wrap; padding-top: var(--s-3); padding-bottom: var(--s-3); color: var(--ink); font-size: var(--t-15);">
        {j.security_offered}
      </div>
    </div>
  </div>
{/if}

{#if j.notes}
  <div class="group">
    <div class="group-title">Notes</div>
    <div class="group-rows">
      <div class="row-line" style="white-space: pre-wrap; padding-top: var(--s-3); padding-bottom: var(--s-3); color: var(--ink); font-size: var(--t-15);">
        {j.notes}
      </div>
    </div>
  </div>
{/if}

{#if data.canEdit}
  <div class="row-actions">
    <button on:click={openMap}>{j.lat != null ? 'Move pin' : 'Set location'}</button>
    {#if nextStatus}
      <button class="filled" style="flex: 2;" on:click={advance} disabled={busy}>Mark {statusLabel[nextStatus]}</button>
    {/if}
    {#if j.status !== 'cancelled' && nextStatus}
      <button class="danger" on:click={() => setStatus('cancelled')} disabled={busy}>Cancel</button>
    {:else if j.status === 'cancelled'}
      <button on:click={reopen} disabled={busy}>Restore</button>
    {/if}
  </div>
  {#if j.status === 'signed'}
    <div class="row-actions">
      {#if canComplete}
        <button class="filled" style="flex: 1;" on:click={() => setCompleted(true)} disabled={busy}>Mark install completed</button>
      {:else if canUncomplete && j.completed_at != null}
        <button on:click={() => setCompleted(false)} disabled={busy}>Reopen install</button>
        <span class="muted small" style="align-self: center;">Done {fmt(j.completed_at)}</span>
      {/if}
    </div>
  {/if}
{/if}

{#if showMap}
  <div class="map-modal" role="dialog" aria-modal="true" aria-label="Drop pin on map">
    <div class="map-modal-head">
      <h2>Drop a pin</h2>
      <button class="bar-logout" on:click={closeMap} aria-label="Close">Cancel</button>
    </div>
    <div bind:this={mapEl} class="map"></div>
    <div class="map-modal-foot">
      {#if pendingLat != null}
        <span class="muted small">Pin: {pendingLat.toFixed(4)}, {pendingLng?.toFixed(4)}</span>
      {:else}
        <span class="muted small">Tap the map to drop a pin.</span>
      {/if}
      <button class="filled" style="width: auto; padding: 0 var(--s-4);" on:click={saveCoords} disabled={pendingLat == null || busy}>
        {busy ? 'Saving…' : 'Save location'}
      </button>
    </div>
  </div>
{/if}

<div style="padding: var(--s-5) var(--s-4); display: flex; gap: var(--s-4); flex-wrap: wrap;">
  <a class="muted small" href="/calendar">← Week</a>
  <a class="muted small" href="/map">Map →</a>
</div>
