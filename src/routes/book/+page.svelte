<script lang="ts">
  import { goto } from '$app/navigation';
  import { enhance } from '$app/forms';
  import type { PageData, ActionData } from './$types';
  export let data: PageData;
  export let form: ActionData;

  let techId = data.preselectTech;
  let durationMin = data.durationMin;
  $: if (data.durationMin && data.durationMin !== durationMin) durationMin = data.durationMin;
  $: if (data.preselectTech && data.preselectTech !== techId) techId = data.preselectTech;
  let startSlotTs = 0;
  // pre-fill from form on fail, then let the user keep editing
  let clientName = form?.client_name ?? '';
  let address = form?.address ?? '';
  let email = form?.email ?? '';
  let dob = form?.dob ?? '';
  let telusPin = form?.telus_pin ?? '';
  let idType = (form?.id_type ?? '') as '' | 'dl' | 'passport' | 'bcid' | 'other';
  let idLast4 = form?.id_last4 ?? '';
  let emergencyName = form?.emergency_name ?? '';
  let emergencyNumber = form?.emergency_number ?? '';
  let emergencyRelation = form?.emergency_relation ?? '';
  let verbalPassword = form?.verbal_password ?? '';
  let svcInternet = form?.svc_internet ?? false;
  let svcHomePhone = form?.svc_home_phone ?? false;
  let svcTv = form?.svc_tv ?? false;
  let themes = form?.themes ?? '';
  let securityOffered = form?.security_offered ?? '';
  let notes = form?.notes ?? '';
  let busy = false;

  // re-select the same slot the user tried if it still exists, so they don't lose it on a fail
  $: if (form?.starts_at && startSlotTs === 0) {
    const t = new Date(form.starts_at).getTime() / 1000;
    if (slots.some(s => s.starts_at === t)) startSlotTs = t;
  }

  // when the duration or tech changes, the page re-navigates with new querystring
  // so the server's getAvailableSlots runs again with the right duration
  function setDuration(min: number) {
    if (min === durationMin) return;
    const u = new URL(window.location.href);
    u.searchParams.set('dur', String(min));
    goto(u.pathname + '?' + u.searchParams.toString(), { replaceState: true, keepFocus: true, noScroll: true });
  }
  function setTech(id: number) {
    techId = id;
    startSlotTs = 0;
    const u = new URL(window.location.href);
    u.searchParams.set('tech', String(id));
    u.searchParams.set('dur', String(durationMin));
    goto(u.pathname + '?' + u.searchParams.toString(), { replaceState: true, keepFocus: true, noScroll: true });
  }

  $: slots = (data.slotsByTech[techId] || []);

  $: slotsByDay = (() => {
    const map = new Map<string, { starts_at: number; ends_at: number }[]>();
    for (const s of slots) {
      const key = new Date(s.starts_at * 1000).toISOString().slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return Array.from(map.entries()).sort();
  })();

  // group days into "next 7 days" and "after that" so sales sees what they need first
  $: todayIso = new Date().toISOString().slice(0, 10);
  $: nextWeekCutoff = (() => {
    const d = new Date(); d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  })();
  $: daysNear = slotsByDay.filter(([iso]) => iso <= nextWeekCutoff);
  $: daysLater = slotsByDay.filter(([iso]) => iso > nextWeekCutoff);

  function fmtDay(iso: string) {
    return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }
  function fmtDayShort(iso: string) {
    return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' });
  }
  function isToday(iso: string) {
    return iso === todayIso;
  }
  function fmtTime(ts: number) {
    return new Date(ts * 1000).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  $: selectedSlot = slots.find(s => s.starts_at === startSlotTs);
  $: startsAtLocal = selectedSlot ? new Date(selectedSlot.starts_at * 1000).toISOString().slice(0, 16) : '';
  $: endsAtLocal = selectedSlot ? new Date(selectedSlot.ends_at * 1000).toISOString().slice(0, 16) : '';
  $: canSubmit = !!selectedSlot && !!clientName.trim() && !!address.trim() && !busy;

  const idTypes: { value: 'dl'|'passport'|'bcid'|'other'; label: string }[] = [
    { value: 'dl',       label: "Driver's licence" },
    { value: 'passport', label: 'Passport' },
    { value: 'bcid',     label: 'BCID' },
    { value: 'other',    label: 'Other' }
  ];

  const durationOptions = [
    { value: 60,  label: '1 hr' },
    { value: 90,  label: '1.5 hr' },
    { value: 120, label: '2 hr' }
  ];
</script>

<svelte:head><title>New job</title></svelte:head>

<div class="large-title">
  <h1>New job</h1>
  <div class="sub">Customer details, then pick a slot inside a tech's open hours.</div>
</div>

{#if form?.error}
  <div class="form-section">
    <div class="err" role="alert">{form.error}</div>
  </div>
{/if}

<form method="POST" use:enhance={() => {
  busy = true;
  return async ({ update }) => {
    await update({ reset: false });
    busy = false;
  };
}}>
  <div class="form-section">
    <div class="group-title" style="padding-left: 0; padding-bottom: var(--s-2);">Customer</div>
    <div class="input-group">
      <div class="field">
        <input name="client_name" bind:value={clientName} required autocomplete="off" placeholder="Full name" aria-label="Client name" />
      </div>
      <div class="field">
        <input name="address" bind:value={address} required autocomplete="off" placeholder="Address" aria-label="Address" />
      </div>
      <div class="field">
        <input name="email" type="email" bind:value={email} autocomplete="off" placeholder="Email (optional)" aria-label="Email" />
      </div>
      <div class="field">
        <input name="dob" type="date" bind:value={dob} placeholder="Date of birth" aria-label="Date of birth" />
      </div>
    </div>
  </div>

  <div class="form-section">
    <div class="group-title" style="padding-left: 0; padding-bottom: var(--s-2);">TELUS account</div>
    <div class="input-group">
      <div class="field">
        <input name="telus_pin" bind:value={telusPin} inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="4-digit PIN" aria-label="TELUS 4-digit PIN" />
      </div>
      <div class="field" style="display: flex; align-items: center; gap: var(--s-3);">
        <span style="flex:1; color: var(--dim);">ID type</span>
        <select name="id_type" bind:value={idType} style="flex: 2; text-align: right;">
          <option value="" disabled>Select…</option>
          {#each idTypes as t}
            <option value={t.value}>{t.label}</option>
          {/each}
        </select>
      </div>
      <div class="field">
        <input name="id_last4" bind:value={idLast4} inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="Last 4 of ID" aria-label="Last 4 digits of ID" />
      </div>
    </div>
  </div>

  <div class="form-section">
    <div class="group-title" style="padding-left: 0; padding-bottom: var(--s-2);">Services the customer has</div>
    <div class="input-group">
      <label class="row" style="padding: var(--s-3) var(--s-4); gap: var(--s-3); cursor: pointer; min-height: 44px; align-items: center;">
        <input type="checkbox" name="svc_internet" bind:checked={svcInternet} style="width: auto; flex: 0;" />
        <span style="flex: 1;">Internet</span>
      </label>
      <label class="row" style="padding: var(--s-3) var(--s-4); gap: var(--s-3); cursor: pointer; min-height: 44px; align-items: center; border-top: 1px solid var(--line-thin);">
        <input type="checkbox" name="svc_home_phone" bind:checked={svcHomePhone} style="width: auto; flex: 0;" />
        <span style="flex: 1;">Home phone</span>
      </label>
      <label class="row" style="padding: var(--s-3) var(--s-4); gap: var(--s-3); cursor: pointer; min-height: 44px; align-items: center; border-top: 1px solid var(--line-thin);">
        <input type="checkbox" name="svc_tv" bind:checked={svcTv} style="width: auto; flex: 0;" />
        <span style="flex: 1;">TV</span>
      </label>
    </div>
  </div>

  <div class="form-section">
    <div class="group-title" style="padding-left: 0; padding-bottom: var(--s-2);">Emergency contact</div>
    <div class="input-group">
      <div class="field">
        <input name="emergency_name" bind:value={emergencyName} placeholder="Full name" aria-label="Emergency contact name" />
      </div>
      <div class="field">
        <input name="emergency_number" bind:value={emergencyNumber} type="tel" placeholder="Phone number" aria-label="Emergency contact number" />
      </div>
      <div class="field">
        <input name="emergency_relation" bind:value={emergencyRelation} placeholder="Relation (e.g. spouse, parent)" aria-label="Relation" />
      </div>
    </div>
  </div>

  <div class="form-section">
    <div class="group-title" style="padding-left: 0; padding-bottom: var(--s-2);">Verbal password</div>
    <div class="input-group">
      <div class="field">
        <input name="verbal_password" bind:value={verbalPassword} placeholder="One word the tech asks for at the door" aria-label="Verbal password" />
      </div>
    </div>
  </div>

  <div class="form-section">
    <div class="group-title" style="padding-left: 0; padding-bottom: var(--s-2);">Existing themes / package details</div>
    <div class="input-group">
      <div class="field" style="padding: var(--s-3) var(--s-4);">
        <textarea name="themes" bind:value={themes} rows="3" placeholder="Anything else they currently subscribe to, package names, add-ons, etc."></textarea>
      </div>
    </div>
  </div>

  <div class="form-section">
    <div class="group-title" style="padding-left: 0; padding-bottom: var(--s-2);">Home security being offered</div>
    <div class="input-group">
      <div class="field" style="padding: var(--s-3) var(--s-4);">
        <textarea name="security_offered" bind:value={securityOffered} rows="3" placeholder="What we're switching them to (cameras, sensors, monitoring, etc.)"></textarea>
      </div>
    </div>
  </div>

  <div class="form-section">
    <div class="input-group">
      <div class="field" style="display: flex; align-items: center;">
        <span style="flex:1; color: var(--dim);">Technician</span>
        <select on:change={(e) => setTech(Number(e.currentTarget.value))} value={techId} style="flex: 2; text-align: right;">
          {#each data.techs as t}
            <option value={t.id}>{t.display_name}</option>
          {/each}
        </select>
      </div>
    </div>
  </div>

  <div class="form-section">
    <div class="group-title" style="padding-left: 0; padding-bottom: var(--s-2);">Install length</div>
    <div class="row" style="gap: var(--s-2); padding: 0 var(--s-1);">
      {#each durationOptions as opt}
        <button
          type="button"
          class="slot-btn"
          class:selected={durationMin === opt.value}
          on:click={() => setDuration(opt.value)}
          style="flex: 1; padding: 10px;"
        >
          {opt.label}
        </button>
      {/each}
    </div>
  </div>

  <input type="hidden" name="tech_id" value={techId} />

  <div class="form-section">
    <div class="group-title" style="padding-left: 0; padding-bottom: var(--s-2); display: flex; justify-content: space-between; align-items: baseline;">
      <span>Time</span>
      <span class="muted small">{slots.length} open</span>
    </div>
    <div class="input-group" style="padding: var(--s-3) 0;">
      {#if slotsByDay.length === 0}
        <div class="empty" style="padding: var(--s-5) var(--s-4);">
          <h3 style="font-size: var(--t-17);">No open hours</h3>
          <div>Ask the tech to add a block in Hours.</div>
        </div>
      {:else}
        {#if daysNear.length > 0}
          <div class="group-title" style="padding: 0 var(--s-4) var(--s-2);">Next 7 days</div>
          {#each daysNear as [day, daySlots]}
            <div style="padding: var(--s-2) var(--s-4) var(--s-1); display: flex; align-items: baseline; gap: var(--s-2);">
              <span style="color: var(--ink); font-weight: 600; font-size: var(--t-15);">{isToday(day) ? 'Today' : fmtDayShort(day)}</span>
              <span class="muted small">{fmtDay(day)}</span>
            </div>
            <div class="slot-grid">
              {#each daySlots as s, i}
                <button
                  type="button"
                  class="slot-btn"
                  class:selected={s.starts_at === startSlotTs}
                  on:click={() => startSlotTs = s.starts_at}
                >
                  {fmtTime(s.starts_at)}
                </button>
              {/each}
            </div>
          {/each}
        {/if}
        {#if daysLater.length > 0}
          <div class="group-title" style="padding: var(--s-3) var(--s-4) var(--s-2);">Later</div>
          {#each daysLater as [day, daySlots]}
            <div style="padding: var(--s-2) var(--s-4) var(--s-1); display: flex; align-items: baseline; gap: var(--s-2);">
              <span style="color: var(--ink); font-weight: 600; font-size: var(--t-15);">{fmtDayShort(day)}</span>
              <span class="muted small">{fmtDay(day)}</span>
            </div>
            <div class="slot-grid">
              {#each daySlots as s}
                <button type="button" class="slot-btn" class:selected={s.starts_at === startSlotTs} on:click={() => startSlotTs = s.starts_at}>
                  {fmtTime(s.starts_at)}
                </button>
              {/each}
            </div>
          {/each}
        {/if}
      {/if}
    </div>
  </div>

  <div class="form-section">
    <div class="group-title" style="padding-left: 0; padding-bottom: var(--s-2);">Notes</div>
    <div class="input-group">
      <div class="field" style="padding: var(--s-3) var(--s-4);">
        <textarea name="notes" bind:value={notes} rows="2" placeholder="Anything else worth recording"></textarea>
      </div>
    </div>
  </div>

  <input type="hidden" name="starts_at" value={startsAtLocal} />
  <input type="hidden" name="ends_at" value={endsAtLocal} />

  <div class="form-section">
    <button type="submit" class="filled" disabled={!canSubmit}>
      {busy ? 'Booking…' : 'Book job'}
    </button>
    {#if !selectedSlot}
      <div class="hint" style="text-align: center; margin-top: var(--s-3); color: var(--dim); font-size: var(--t-13);">Pick a time slot above.</div>
    {/if}
  </div>
</form>
