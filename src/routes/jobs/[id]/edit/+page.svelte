<script lang="ts">
  import { enhance } from '$app/forms';
  import { Button } from 'bits-ui';
  import AddressAutocomplete from '$lib/components/AddressAutocomplete.svelte';
  import type { PageData, ActionData } from './$types';
  export let data: PageData;
  export let form: ActionData;

  const inpc = 'w-full bg-transparent py-0 text-[var(--t-17)] text-[var(--ink)] outline-none placeholder:text-[var(--dim)]';

  let street: string = data.job.street ?? '';
  let city: string = data.job.city ?? '';
  let province: string = data.job.province ?? '';

  $: canDelete = data.user?.role === 'sales' && data.job.booked_by === data.user?.id;
  let confirmDelete = false;
  let saving = false;
  let deleting = false;

  const idTypes = [
    { value: '', label: 'ID type' },
    { value: 'dl', label: "Driver's licence" },
    { value: 'passport', label: 'Passport' },
    { value: 'bcid', label: 'BCID' },
    { value: 'other', label: 'Other' }
  ];
  const durations = [60, 90, 120];
  $: customDuration = !durations.includes(data.durationMin);
</script>

<svelte:head><title>Edit · {data.job.client_name}</title></svelte:head>

<div class="mt-8 mb-2 px-4">
  <h1 class="text-[28px] font-bold tracking-tight">Edit job</h1>
</div>
<p class="mb-6 px-4 text-[13px] text-[var(--dim)]">{data.job.client_name}</p>

{#if form?.error}
  <div class="form-section">
    <div class="err" role="alert">{form.error}</div>
  </div>
{/if}

<form method="POST" action="?/save" use:enhance={() => {
  saving = true;
  return async ({ update }) => {
    saving = false;
    await update();
  };
}} novalidate class="pb-4">
  <div class="group">
    <div class="group-title">Customer</div>
    <div class="input-group">
      <label class="field"><input class={inpc} name="client_name" value={data.job.client_name} required autocomplete="name" placeholder="Full name *" aria-label="Full name (required)" /></label>
      <div class="field !p-0 !flex bg-[var(--row)]">
        <div class="flex-1 min-w-0 px-3 py-3 flex items-center">
          <AddressAutocomplete bare name="street" bind:value={street} bind:city={city} bind:province={province} bind:street={street} placeholder="Address line *" ariaLabel="Address line (required)" required />
        </div>
      </div>
      <div class="field !p-0 !flex divide-x divide-[var(--line-thin)] overflow-hidden">
        <div class="flex-[1.2] min-w-0 px-3 py-3 flex items-center bg-[var(--row)] overflow-hidden">
          <input class="w-full min-w-0 bg-transparent py-0 text-[var(--t-17)] text-[var(--ink)] outline-none placeholder:text-[var(--dim)] truncate" name="city" bind:value={city} placeholder="City *" aria-label="City *" autocomplete="address-level2" />
        </div>
        <div class="w-[84px] shrink px-3 py-3 flex items-center justify-center bg-[var(--row)] overflow-hidden">
          <input class="w-full min-w-0 bg-transparent py-0 text-[var(--t-17)] text-[var(--ink)] outline-none placeholder:text-[var(--dim)] uppercase text-center truncate" name="province" bind:value={province} placeholder="BC *" aria-label="Province *" autocomplete="address-level1" maxlength="2" style:text-transform="uppercase" />
        </div>
        <div class="w-[148px] shrink px-3 py-3 flex items-center bg-[var(--row)] overflow-hidden">
          <input class="w-full min-w-0 bg-transparent py-0 text-[var(--t-17)] text-[var(--ink)] outline-none placeholder:text-[var(--dim)] uppercase truncate" name="postal_code" value={data.job.postal_code ?? ''} placeholder="Postal code *" aria-label="Postal code *" autocomplete="postal-code" style:text-transform="uppercase" />
        </div>
      </div>
      <label class="field"><input class={inpc} name="email" type="email" value={data.job.email ?? ''} autocomplete="email" placeholder="Email" aria-label="Email" /></label>
      <label class="field"><input class={inpc} name="phone" type="tel" value={data.job.phone ?? ''} autocomplete="tel" placeholder="Phone" aria-label="Phone number" /></label>
      <label class="field"><span class="key">Date of birth</span><input class={inpc} name="dob" type="date" value={data.job.dob ?? ''} aria-label="Date of birth" /></label>
    </div>
  </div>

  <div class="group">
    <div class="group-title">TELUS account</div>
    <div class="input-group">
      <label class="field"><input class={inpc} name="telus_pin" value={data.job.telus_pin ?? ''} placeholder="TELUS PIN (4 digits, comma-separated)" aria-label="TELUS PIN" /></label>
      <label class="field">
        <select class={inpc} name="id_type" aria-label="ID type">
          {#each idTypes as t}<option value={t.value} selected={t.value === (data.job.id_type ?? '')}>{t.label}</option>{/each}
        </select>
      </label>
      <label class="field"><input class={inpc} name="id_last4" value={data.job.id_last4 ?? ''} maxlength="4" placeholder="Last 4 of ID" aria-label="Last 4 of ID" /></label>
    </div>
  </div>

  <div class="group">
    <div class="group-title">Services</div>
    <div class="input-group">
      <label class="field !flex !items-center gap-3 cursor-pointer">
        <input type="checkbox" name="svc_internet" value="1" checked={!!data.job.svc_internet} class="h-5 w-5 accent-[var(--blue)]" />
        <span class="flex-1">Internet</span>
        <input class="w-1/2 bg-transparent text-right text-[var(--t-17)] text-[var(--ink)] outline-none placeholder:text-[var(--dim)]" name="svc_internet_detail" value={data.job.svc_internet_detail ?? ''} placeholder="Details" aria-label="Internet details" maxlength="120" />
      </label>
      <label class="field !flex !items-center gap-3 cursor-pointer">
        <input type="checkbox" name="svc_home_phone" value="1" checked={!!data.job.svc_home_phone} class="h-5 w-5 accent-[var(--blue)]" />
        <span class="flex-1">Home phone</span>
        <input class="w-1/2 bg-transparent text-right text-[var(--t-17)] text-[var(--ink)] outline-none placeholder:text-[var(--dim)]" name="svc_home_phone_detail" value={data.job.svc_home_phone_detail ?? ''} placeholder="Details" aria-label="Home phone details" maxlength="120" />
      </label>
      <label class="field !flex !items-center gap-3 cursor-pointer">
        <input type="checkbox" name="svc_tv" value="1" checked={!!data.job.svc_tv} class="h-5 w-5 accent-[var(--blue)]" />
        <span class="flex-1">TV</span>
        <input class="w-1/2 bg-transparent text-right text-[var(--t-17)] text-[var(--ink)] outline-none placeholder:text-[var(--dim)]" name="svc_tv_detail" value={data.job.svc_tv_detail ?? ''} placeholder="Details" aria-label="TV details" maxlength="120" />
      </label>
    </div>
  </div>

  <div class="group">
    <div class="group-title">Emergency contact</div>
    <div class="input-group">
      <label class="field"><input class={inpc} name="emergency_name" value={data.job.emergency_name ?? ''} placeholder="Emergency contact name" aria-label="Emergency contact name" /></label>
      <label class="field"><input class={inpc} name="emergency_number" type="tel" value={data.job.emergency_number ?? ''} placeholder="Phone number" aria-label="Emergency phone number" /></label>
      <label class="field"><input class={inpc} name="emergency_relation" value={data.job.emergency_relation ?? ''} placeholder="Relation" aria-label="Relation" /></label>
    </div>
  </div>

  <div class="group">
    <div class="group-title">More</div>
    <div class="input-group">
      <label class="field"><input class={inpc} name="verbal_password" value={data.job.verbal_password ?? ''} placeholder="Verbal password" aria-label="Verbal password" /></label>
      <label class="field"><textarea class={inpc} name="security_offered" rows="2" placeholder="Home security being offered" aria-label="Home security">{data.job.security_offered ?? ''}</textarea></label>
      <label class="field"><textarea class={inpc} name="notes" rows="2" placeholder="Notes" aria-label="Notes">{data.job.notes ?? ''}</textarea></label>
      <label class="field"><input class={inpc} name="price" type="text" inputmode="decimal" value={data.job.price_cents ? (data.job.price_cents / 100).toFixed(2) : ''} placeholder="Price ($)" aria-label="Price in dollars" /></label>
    </div>
  </div>

  <div class="group">
    <div class="group-title">Schedule</div>
    <div class="input-group">
      {#if data.isTech}
        <div class="field"><span class="key">Technician</span><span class="val">{data.techs[0]?.display_name}</span></div>
      {:else}
        <label class="field"><span class="key">Technician</span>
          <select class={inpc} name="tech_id" aria-label="Technician">
            {#each data.techs as t}<option value={t.id} selected={t.id === data.job.tech_id}>{t.display_name}</option>{/each}
          </select>
        </label>
      {/if}
      <label class="field"><span class="key">Date</span><input class={inpc} name="date" type="date" value={data.dateIso} required aria-label="Job date (required)" /></label>
      <label class="field"><span class="key">Starts</span><input class={inpc} name="start" type="time" value={data.startTime} required aria-label="Start time (required)" /></label>
      <label class="field"><span class="key">Length</span>
        <select class={inpc} name="duration" aria-label="Install length">
          {#if customDuration}<option value={data.durationMin} selected>{Math.floor(data.durationMin / 60)}h{data.durationMin % 60 ? ` ${data.durationMin % 60}m` : ''} (current)</option>{/if}
          <option value="60" selected={data.durationMin === 60}>1 hr</option>
          <option value="90" selected={data.durationMin === 90}>1.5 hr</option>
          <option value="120" selected={data.durationMin === 120}>2 hr</option>
        </select>
      </label>
    </div>
  </div>

  <div class="form-section">
    <div class="flex items-center gap-3">
      <Button.Root type="submit" class="filled flex-1" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button.Root>
      <a href={`/jobs/${data.job.id}`} class="inline-flex min-h-[50px] items-center justify-center rounded-[10px] border border-[var(--line)] bg-[var(--row)] px-5 text-[15px] font-medium text-[var(--ink)] hover:bg-[var(--row2)]">Cancel</a>
    </div>
  </div>
</form>

{#if canDelete}
  <div class="group">
    <div class="group-title">Danger zone</div>
    <div class="group-rows">
      <div class="px-4 py-4">
        {#if !confirmDelete}
          <Button.Root class="w-full rounded-[10px] border border-red-500/20 bg-red-500/10 px-5 py-3 text-[15px] font-medium text-red-500 hover:bg-red-500/15" onclick={() => (confirmDelete = true)}>Delete job…</Button.Root>
        {:else}
          <p class="mb-3 text-[14px] text-[var(--ink)]">Permanently delete this job? This can’t be undone. Use Cancel on the job page instead to keep a record.</p>
          <form method="POST" action="?/delete" use:enhance={() => {
            deleting = true;
            return async ({ update }) => {
              deleting = false;
              await update();
            };
          }} class="flex gap-2">
            <Button.Root type="button" class="flex-1 rounded-[10px] border border-[var(--line)] bg-[var(--row)] px-5 py-3 text-[15px] font-medium text-[var(--ink)] hover:bg-[var(--row2)]" onclick={() => (confirmDelete = false)} disabled={deleting}>Keep</Button.Root>
            <Button.Root type="submit" class="flex-1 rounded-[10px] bg-red-500 px-5 py-3 text-[15px] font-semibold text-white hover:bg-red-600 disabled:opacity-40" disabled={deleting}>{deleting ? 'Deleting…' : 'Delete'}</Button.Root>
          </form>
        {/if}
      </div>
    </div>
  </div>
{/if}
