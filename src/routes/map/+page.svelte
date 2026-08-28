<svelte:head><title>Map</title></svelte:head>

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { PageData } from './$types';
  export let data: PageData;

  let mapEl: HTMLDivElement;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let map: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let markers: any[] = [];

  onMount(async () => {
    const L = (await import('leaflet')).default;
    // inject the leaflet CSS once
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    const center: [number, number] = data.jobs.length
      ? [data.jobs[0].lat, data.jobs[0].lng]
      : [49.2827, -123.1207]; // Vancouver

    map = L.map(mapEl, { zoomControl: true }).setView(center, 11);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap'
    }).addTo(map);

    for (const j of data.jobs) {
      const m = L.marker([j.lat, j.lng]).addTo(map);
      m.bindPopup(
        `<div style="font-family: -apple-system, system-ui, sans-serif; min-width: 180px;">
          <div style="font-weight: 600; margin-bottom: 4px;">${escape(j.client_name)}</div>
          <div style="font-size: 12px; color: #555;">${escape(j.address)}</div>
          <div style="font-size: 12px; color: #555; margin-top: 4px;">${escape(j.tech_name)}</div>
          <a href="/jobs/${j.id}" style="display: inline-block; margin-top: 8px; color: #0A84FF; font-size: 13px; text-decoration: none;">Open job →</a>
        </div>`
      );
      markers.push(m);
    }
  });

  function escape(s: string): string {
    return s.replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]!));
  }

  onDestroy(() => {
    if (map) map.remove();
  });
</script>

<div class="large-title">
  <h1>Map</h1>
  <div class="sub">
    {data.jobs.length} job{data.jobs.length === 1 ? '' : 's'} with a location set.
    {#if data.jobs.length === 0}
      Open a job and tap "Set location" to drop a pin.
    {/if}
  </div>
</div>

<div class="map-wrap">
  <div bind:this={mapEl} class="map"></div>
</div>

<style>
  .map-wrap {
    margin: 0 var(--s-4);
    border-radius: var(--r-2);
    overflow: hidden;
    border: 1px solid var(--line);
    height: calc(100vh - 200px);
    min-height: 360px;
  }
  .map { width: 100%; height: 100%; }
  :global(.leaflet-popup-content) { margin: var(--s-3) var(--s-3); }
</style>
