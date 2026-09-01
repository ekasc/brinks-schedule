<script lang="ts">
  import type { PageData } from './$types';
  import { invalidateAll } from '$app/navigation';
  import { Button } from 'bits-ui';
  import { fly, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  export let data: PageData;

  let busy = false;
  let confirmStatus: string | null = null;
  let confirmCompleted = false;
  $: if (busy) { confirmStatus = null; confirmCompleted = false; }

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
    busy = true;
    confirmStatus = null;
    try {
      const fd = new FormData();
      fd.set('status', s);
      await fetch('?/status', { method: 'POST', body: fd });
      await invalidateAll();
    } finally {
      busy = false;
    }
  }
  function requestStatus(s: string) {
    if (confirmStatus === s) setStatus(s);
    else confirmStatus = s;
  }

  // Map pin-drop UI removed — location is set at booking time (auto-geocoded) and shown read-only.

  $: j = data.job as any;
  $: idLabel = (j as any).id_type === 'dl' ? "Driver's licence" : (j as any).id_type === 'passport' ? 'Passport' : (j as any).id_type === 'bcid' ? 'BCID' : (j as any).id_type === 'other' ? 'Other' : '—';
  $: services = [
    j.svc_internet ? { label: 'Internet', detail: j.svc_internet_detail } : null,
    j.svc_home_phone ? { label: 'Home phone', detail: j.svc_home_phone_detail } : null,
    j.svc_tv ? { label: 'TV', detail: j.svc_tv_detail } : null
  ].filter(Boolean) as { label: string; detail: string | null }[];
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
    confirmCompleted = false;
    try {
      const fd = new FormData();
      fd.set('completed', done ? '1' : '0');
      await fetch('?/complete', { method: 'POST', body: fd });
      await invalidateAll();
    } finally {
      busy = false;
    }
  }
  function requestCompleted() {
    confirmCompleted = true;
  }

  function fmtFull(ts: number) {
    return new Date(ts * 1000).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function bookingSummary(): string {
    const lines: string[] = [];
    const L = (k: string, v: unknown) => lines.push(`${k}: ${v == null || v === '' ? '—' : v}`);
    const blank = () => lines.push('');
    L('Full name', j.client_name);
    if (j.street || j.city || j.province) {
      L('Street / Ave', j.street);
      L('City', j.city);
      L('Province', j.province);
      L('Postal code', j.postal_code);
      L('Full address', j.address);
    } else {
      L('Address', j.address);
      L('Postal code', j.postal_code);
    }
    L('Phone number', j.phone);
    L('Email', j.email);
    L('Date of Birth', j.dob);
    L('DL last 4', j.id_last4 ? `${j.id_type ? j.id_type + ' ' : ''}••${j.id_last4}` : '');
    blank();
    if (j.telus_pin && String(j.telus_pin).includes(',')) {
      String(j.telus_pin).split(',').map(s=>s.trim()).filter(Boolean).forEach((p, idx) => L(`Telus PIN ${idx+1}`, p));
    } else {
      L('Telus PIN', j.telus_pin);
    }
    L('Services', services.length ? services.map(s => s.detail ? `${s.label} (${s.detail})` : s.label).join(', ') : '—');
    L('Price', j.price_cents ? '$' + (j.price_cents / 100).toFixed(2) : '—');
    blank();
    L('Install date and time', `${fmtFull(j.starts_at)} – ${fmtFull(j.ends_at)}`);
    L('Any extra equipment', j.themes);
    blank();
    L('Emergency contact name', j.emergency_name);
    L('Contact ph number', j.emergency_number);
    L('Contact relation', j.emergency_relation);
    L('Verbal password', j.verbal_password);
    blank();
    L('Notes', j.notes);
    return lines.join('\n');
  }

  let copied = false;
  let copyBusy = false;
  async function copyBooking() {
    if (copyBusy) return;
    copyBusy = true;
    const text = bookingSummary();
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      window.prompt('Copy booking details:', text);
    } finally {
      copyBusy = false;
    }
  }
  function downloadBooking() {
    const text = bookingSummary();
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `booking-${j.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<svelte:head><title>{j.client_name}</title></svelte:head>

<Button.Root onclick={goBack} class="mt-6 flex items-center gap-1.5 px-4 text-[14px] font-medium text-[var(--dim)] hover:text-[var(--ink)] transition-colors" aria-label="Go back">
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
  Back
</Button.Root>
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
    {#if j.street || j.city || j.province}
    <div class="row-line !p-0 flex flex-col divide-y divide-[var(--line-thin)] overflow-hidden">
      <div class="px-4 py-3 bg-[var(--row)]">
        <div class="text-[11px] uppercase tracking-wide text-[var(--dim)]">Address line</div>
        <div class="text-[15px] font-medium leading-snug text-[var(--ink)]">{j.street ?? j.address ?? '—'}</div>
      </div>
      <div class="flex divide-x divide-[var(--line-thin)] overflow-hidden">
        <div class="flex-1 min-w-0 px-4 py-3 bg-[var(--row)] overflow-hidden">
          <div class="text-[11px] uppercase tracking-wide text-[var(--dim)]">City</div>
          <div class="text-[15px] font-medium leading-snug text-[var(--ink)] truncate">{j.city ?? '—'}</div>
        </div>
        <div class="w-[84px] shrink px-4 py-3 bg-[var(--row)] text-center overflow-hidden">
          <div class="text-[11px] uppercase tracking-wide text-[var(--dim)]">Province</div>
          <div class="text-[15px] font-medium leading-snug text-[var(--ink)] truncate">{j.province ?? '—'}</div>
        </div>
        <div class="w-[148px] shrink px-4 py-3 bg-[var(--row)] overflow-hidden">
          <div class="text-[11px] uppercase tracking-wide text-[var(--dim)]">Postal code</div>
          <div class="text-[15px] font-medium leading-snug text-[var(--ink)] truncate">{j.postal_code ?? '—'}</div>
        </div>
      </div>
    </div>
    {:else}
    <div class="row-line">
      <span class="label">Address</span>
      <span class="value ink">{j.address}</span>
    </div>
    <div class="row-line row-line--compact">
      <span class="label">Postal code</span>
      <span class="value ink">{j.postal_code ?? '—'}</span>
    </div>
    {/if}
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
    {#if j.price_cents}
      <div class="row-line row-line--compact">
        <span class="label">Price</span>
        <span class="value ink font-mono">${(j.price_cents / 100).toFixed(2)}</span>
      </div>
    {/if}
  </div>
</div>

{#if data.canSeePii}
  <div class="group">
    <div class="group-title">Customer — private</div>
    {#if j._decryptFailed?.length}
      <div class="mx-4 mt-3 rounded-[10px] border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] leading-snug text-amber-900" role="alert">
        ⚠ Decryption failed for: {j._decryptFailed.join(', ')} — re-enter. Ciphertext is never shown.
      </div>
    {/if}
    <div class="group-rows">
      {#if j.dob}
        <div class="row-line">
          <span class="label">Date of birth</span>
          <span class="value ink">{fmtDate(j.dob)}{age(j.dob) >= 0 ? ' (' + age(j.dob) + ')' : ''}</span>
        </div>
      {/if}
      {#if j.phone}
        <div class="row-line row-line--compact">
          <span class="label">Phone</span>
          <span class="value ink">{j.phone}</span>
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
        {#each services as s}<span class="pill signed !py-1">{s.label}{s.detail ? ` — ${s.detail}` : ''}</span>{/each}
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

{#if data.job.lat == null || data.job.lng == null}
  <div class="mx-4 mb-4 rounded-[10px] border border-[var(--line)] bg-[var(--row2)] px-4 py-3 text-[13px] leading-snug text-[var(--ink)]">
    <span class="font-medium">No map location.</span> This job won’t appear on the route map. Enter a full street address (e.g. “123 Main St, Vancouver, BC”) when booking so it can be plotted.
  </div>
  {/if}
<!-- Actions: generous separation before, tight internal grouping -->
{#if data.canEdit}
  <div class="mt-8 flex flex-col gap-3 px-4">
    <div class="flex flex-wrap gap-2">
      <!-- set-location pin-drop button removed -->
      {#if j.status === 'cancelled'}
        <Button.Root class="rounded-full bg-[var(--row)] px-4 py-2 text-[15px] font-medium text-[var(--blue)] border border-[var(--line)]" onclick={reopen} disabled={busy}>Restore</Button.Root>
      {/if}
    </div>
    {#if nextStatus}
      <div class="flex flex-wrap items-center gap-3">
        <div class="flex items-center gap-3">
          <Button.Root class="flex-1 sm:flex-none rounded-[10px] bg-[var(--blue)] px-5 py-3 text-[17px] font-semibold text-white hover:bg-[var(--blue-press)] disabled:opacity-30 min-h-[50px] transition-all duration-200 {confirmStatus ? '!ring-2 !ring-white/60 !ring-offset-2 !ring-offset-[var(--bg)]' : ''}" onclick={() => requestStatus(nextStatus!)} disabled={busy || (!!confirmStatus && confirmStatus !== nextStatus)}>{#if confirmStatus === nextStatus}Are you sure?{:else}Mark {statusLabel[nextStatus]}{/if}</Button.Root>
          {#if confirmStatus === nextStatus}
            <div in:fly={{ x: 12, duration: 220, easing: cubicOut }} out:scale={{ start: 0.96, duration: 140 }} class="shrink-0">
              <Button.Root type="button" class="h-[50px] rounded-[10px] border border-[var(--line)] bg-[var(--row)] px-5 text-[15px] font-medium text-[var(--ink)] hover:bg-[var(--row2)]" onclick={() => confirmStatus = null} disabled={busy}>No</Button.Root>
            </div>
            <div in:fly={{ x: 12, duration: 240, easing: cubicOut, delay: 40 }} out:scale={{ start: 0.96, duration: 140 }} class="shrink-0">
              <Button.Root type="button" class="h-[50px] rounded-[10px] bg-[var(--blue)] px-6 text-[15px] font-semibold text-white hover:bg-[var(--blue-press)] shadow-md shadow-[color-mix(in_srgb,var(--blue)_20%,transparent)] shrink-0" onclick={() => setStatus(nextStatus!)} disabled={busy}>Yes</Button.Root>
            </div>
          {/if}
        </div>
        {#if j.status !== 'cancelled'}
          {#if confirmStatus === 'cancelled'}
            <div class="flex items-center gap-3">
              <span class="text-[14px] text-[var(--ink)]">Cancel job?</span>
              <div in:fly={{ x: 12, duration: 220, easing: cubicOut }} out:scale={{ start: 0.96, duration: 140 }} class="shrink-0">
                <Button.Root type="button" class="rounded-[10px] border border-[var(--line)] bg-[var(--row)] px-4 py-2 text-[14px] font-medium text-[var(--ink)] hover:bg-[var(--row2)]" onclick={() => confirmStatus = null} disabled={busy}>No</Button.Root>
              </div>
              <div in:fly={{ x: 12, duration: 240, easing: cubicOut, delay: 40 }} out:scale={{ start: 0.96, duration: 140 }} class="shrink-0">
                <Button.Root type="button" class="rounded-[10px] bg-red-500 px-4 py-2 text-[14px] font-semibold text-white hover:bg-red-600 shadow-md" onclick={() => setStatus('cancelled')} disabled={busy}>Yes</Button.Root>
              </div>
            </div>
          {:else}
            <Button.Root class="rounded-[10px] border border-red-500/20 bg-red-500/10 px-5 py-3 text-[15px] font-medium text-red-500 hover:bg-red-500/15 disabled:opacity-30" onclick={() => requestStatus('cancelled')} disabled={busy}>Cancel</Button.Root>
          {/if}
        {/if}
      </div>
    {/if}
    {#if j.status === 'signed'}
      <div class="flex flex-wrap items-center gap-4 pt-6 border-t border-[var(--line-thin)] mt-6">
        {#if canComplete}
          <div class="flex flex-wrap items-center gap-3">
            <Button.Root class="rounded-[10px] bg-emerald-600 px-5 py-3 text-[15px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-30 min-h-[50px] transition-all duration-200 {confirmCompleted ? '!ring-2 !ring-white/60 !ring-offset-2 !ring-offset-[var(--bg)]' : ''}" onclick={requestCompleted} disabled={busy}>{#if confirmCompleted}Are you sure?{:else}Mark install completed{/if}</Button.Root>
            {#if confirmCompleted}
              <div in:fly={{ x: 12, duration: 220, easing: cubicOut }} out:scale={{ start: 0.96, duration: 140 }} class="shrink-0">
                <Button.Root type="button" class="h-[50px] rounded-[10px] border border-[var(--line)] bg-[var(--row)] px-5 text-[15px] font-medium text-[var(--ink)] hover:bg-[var(--row2)]" onclick={() => confirmCompleted = false} disabled={busy}>No</Button.Root>
              </div>
              <div in:fly={{ x: 12, duration: 240, easing: cubicOut, delay: 40 }} out:scale={{ start: 0.96, duration: 140 }} class="shrink-0">
                <Button.Root type="button" class="h-[50px] rounded-[10px] bg-emerald-600 px-6 text-[15px] font-semibold text-white hover:bg-emerald-700 shadow-md shrink-0" onclick={() => setCompleted(true)} disabled={busy}>Yes</Button.Root>
              </div>
            {/if}
          </div>
        {:else if canUncomplete && j.completed_at != null}
          <Button.Root class="text-[15px] text-[var(--blue)] hover:opacity-70" onclick={() => setCompleted(false)} disabled={busy}>Reopen install</Button.Root>
          <span class="text-sm text-[var(--dim)]">Done {fmt(j.completed_at)}</span>
        {/if}
      </div>
    {/if}
  </div>
{/if}

{#if data.canSeePii}
  <div class="mt-8 flex flex-wrap gap-2 px-4">
    <Button.Root class="rounded-full border border-[var(--line)] bg-[var(--row)] px-4 py-2 text-[15px] font-medium text-[var(--blue)] hover:bg-[var(--row2)] disabled:opacity-40" onclick={copyBooking} disabled={copyBusy}>{copied ? 'Copied!' : 'Copy booking'}</Button.Root>
    <Button.Root class="rounded-full border border-[var(--line)] bg-[var(--row)] px-4 py-2 text-[15px] font-medium text-[var(--blue)] hover:bg-[var(--row2)]" onclick={downloadBooking}>Export .txt</Button.Root>
  </div>
{/if}

  <!-- map pin-drop UI removed -->

<div class="mt-10 flex justify-between px-4 text-sm">
  <a class="text-[var(--dim)] hover:text-[var(--ink)] transition-colors" href="/calendar">← Week</a>
  <a class="text-[var(--dim)] hover:text-[var(--ink)] transition-colors" href="/map">Map →</a>
</div>
