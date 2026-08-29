<script lang="ts">
  import { goto } from '$app/navigation';
  import { superForm } from 'sveltekit-superforms/client';
  import { fly, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import type { PageData, ActionData } from './$types';
  export let data: PageData;
  export let form: ActionData;
  const { form: bookForm, errors, enhance } = superForm(data.form, { dataType: 'form' });

  let techId = data.preselectTech;
  let durationMin = data.durationMin;
  $: if (data.durationMin && data.durationMin !== durationMin) durationMin = data.durationMin;
  $: if (data.preselectTech && data.preselectTech !== techId) techId = data.preselectTech;
  let startSlotTs = 0;
  $: clientName = $bookForm.client_name;
  $: address = $bookForm.address;
  $: email = $bookForm.email;
  $: dob = $bookForm.dob;
  $: telusPin = $bookForm.telus_pin;
  $: idType = $bookForm.id_type;
  $: idLast4 = $bookForm.id_last4;
  $: emergencyName = $bookForm.emergency_name;
  $: emergencyNumber = $bookForm.emergency_number;
  $: emergencyRelation = $bookForm.emergency_relation;
  $: verbalPassword = $bookForm.verbal_password;
  $: svcInternet = $bookForm.svc_internet;
  $: svcHomePhone = $bookForm.svc_home_phone;
  $: svcTv = $bookForm.svc_tv;
  $: themes = $bookForm.themes;
  $: securityOffered = $bookForm.security_offered;
  $: notes = $bookForm.notes;
  let busy = false;
  let confirmBook = false;
  $: if (!canSubmit) confirmBook = false;

  $: if (form?.starts_at && startSlotTs === 0) {
    const t = new Date(form.starts_at).getTime() / 1000;
    if (slots.some(s => s.starts_at === t)) startSlotTs = t;
  }

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

  $: todayIso = new Date().toISOString().slice(0, 10);
  $: tomorrowIso = (() => { const d=new Date(); d.setDate(d.getDate()+1); return d.toISOString().slice(0,10); })();
  function isTomorrow(iso:string){ return iso===tomorrowIso; }
  let timeView: 'list' | 'calendar' = 'calendar';
  let calCursor = new Date();
  $: calYear = calCursor.getFullYear();
  $: calMonth = calCursor.getMonth();
  $: calMonthLabel = calCursor.toLocaleDateString(undefined,{month:'long',year:'numeric'});
  $: calFirstWeekday = new Date(calYear, calMonth, 1).getDay();
  $: calDaysInMonth = new Date(calYear, calMonth+1, 0).getDate();
  $: calSlotsMap = new Map(slotsByDay);
  let calSelectedDay: string | null = null;
  $: if (!calSelectedDay && slotsByDay.length) calSelectedDay = slotsByDay[0][0];
  function calPrev(){ calCursor = new Date(calYear, calMonth-1, 1); }
  function calNext(){ calCursor = new Date(calYear, calMonth+1, 1); }
  function calDateToIso(day:number){
    const m=String(calMonth+1).padStart(2,'0'); const d=String(day).padStart(2,'0'); return `${calYear}-${m}-${d}`;
  }
  function relativeDayLabel(iso:string){
    if(iso===todayIso) return 'Today';
    if(iso===tomorrowIso) return 'Tomorrow';
    return fmtDayShort(iso);
  }

  function fmtDay(iso: string) {
    if (!iso) return '';
    const d = new Date(iso.includes('T') ? iso : iso + 'T00:00:00');
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function fmtDayShort(iso: string) {
    if (!iso) return '';
    const d = new Date(iso.includes('T') ? iso : iso + 'T00:00:00');
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { weekday: 'short' });
  }
  function fmtDayFull(slot: { starts_at: number }) { const d=new Date(slot.starts_at*1000); return d.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'}); }
  function isToday(iso: string) { return iso === todayIso; }
  function fmtTime(ts: number) { return new Date(ts * 1000).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }

  $: selectedSlot = slots.find(s => s.starts_at === startSlotTs);
  $: startsAtLocal = selectedSlot ? new Date(selectedSlot.starts_at * 1000).toISOString().slice(0, 16) : '';
  $: endsAtLocal = selectedSlot ? new Date(selectedSlot.ends_at * 1000).toISOString().slice(0, 16) : '';
  $: canSubmit = !!selectedSlot && !!clientName?.trim() && !!address?.trim() && !busy;

  const idTypes: { value: 'dl'|'passport'|'bcid'|'other'; label: string }[] = [
    { value: 'dl', label: "Driver's licence" },
    { value: 'passport', label: 'Passport' },
    { value: 'bcid', label: 'BCID' },
    { value: 'other', label: 'Other' }
  ];
  const durationOptions = [
    { value: 60, label: '1 hr' },
    { value: 90, label: '1.5 hr' },
    { value: 120, label: '2 hr' }
  ];
</script>

<svelte:head><title>New job</title></svelte:head>

<div class="mt-8 mb-8 px-4">
  <h1 class="text-[28px] font-bold tracking-tight">New job</h1>
  <p class="mt-2 text-[15px] leading-relaxed text-[var(--dim)]">Customer details, then pick a slot inside a tech’s open hours.</p>
</div>

{#if form?.error}
  <div class="form-section">
    <div class="err" role="alert">{form.error}</div>
  </div>
{/if}

<form method="POST" use:enhance novalidate class="pb-8">
  <!-- Customer -->
  <div class="group">
    <div class="group-title">Customer</div>
    <div class="input-group">
      <label class="field">
        <input name="client_name" bind:value={$bookForm.client_name} required autocomplete="name" placeholder="Full name" aria-label="Full name" aria-invalid={$errors.client_name ? "true" : undefined} style:border-color={$errors.client_name ? "var(--red)" : undefined} />
      {#if $errors.client_name}<span class="px-1 pt-1 text-[13px] leading-tight text-[var(--red)]" transition:fly={{ y: -4, duration: 160, easing: cubicOut }}>{$errors.client_name}</span>{/if}</label>
      <label class="field">
        <input name="address" bind:value={$bookForm.address} required autocomplete="street-address" placeholder="Address" aria-label="Address" aria-invalid={$errors.address ? "true" : undefined} />
      {#if $errors.address}<span class="px-1 pt-1 text-[13px] leading-tight text-[var(--red)]" transition:fly={{ y: -4, duration: 160, easing: cubicOut }}>{$errors.address}</span>{/if}</label>
      <label class="field">
        <input name="email" type="email" bind:value={$bookForm.email} autocomplete="email" placeholder="Email — optional" aria-label="Email" aria-invalid={$errors.email ? "true" : undefined} />
      {#if $errors.email}<span class="px-1 pt-1 text-[13px] leading-tight text-[var(--red)]" transition:fly={{ y: -4, duration: 160, easing: cubicOut }}>{$errors.email}</span>{/if}</label>
      <label class="field">
        <input name="dob" type="date" bind:value={$bookForm.dob} aria-label="Date of birth" aria-invalid={$errors.dob ? "true" : undefined} />
      {#if $errors.dob}<span class="px-1 pt-1 text-[13px] leading-tight text-[var(--red)]" transition:fly={{ y: -4, duration: 160, easing: cubicOut }}>{$errors.dob}</span>{/if}</label>
    </div>
  </div>

  <!-- TELUS account -->
  <div class="group">
    <div class="group-title">TELUS account</div>
    <div class="input-group">
      <label class="field">
        <input name="telus_pin" bind:value={$bookForm.telus_pin} inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="4-digit PIN" aria-label="4-digit PIN" aria-invalid={$errors.telus_pin ? "true" : undefined} />
      {#if $errors.telus_pin}<span class="px-1 pt-1 text-[13px] leading-tight text-[var(--red)]" transition:fly={{ y: -4, duration: 160, easing: cubicOut }}>{$errors.telus_pin}</span>{/if}</label>
      <label class="field">
        <select name="id_type" bind:value={$bookForm.id_type} aria-label="ID type">
          <option value="" disabled>Select…</option>
          {#each idTypes as t}<option value={t.value}>{t.label}</option>{/each}
        </select></label>
      <label class="field">
        <input name="id_last4" bind:value={$bookForm.id_last4} inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="Last 4 of ID" aria-label="Last 4 of ID" aria-invalid={$errors.id_last4 ? "true" : undefined} />
      {#if $errors.id_last4}<span class="px-1 pt-1 text-[13px] leading-tight text-[var(--red)]" transition:fly={{ y: -4, duration: 160, easing: cubicOut }}>{$errors.id_last4}</span>{/if}</label>
    </div>
  </div>

  <!-- Services -->
  <div class="group">
    <div class="group-title">Services the customer has</div>
    <div class="group-rows">
      <label class="row-line gap-3 cursor-pointer">
        <input type="checkbox" name="svc_internet" bind:checked={$bookForm.svc_internet} class="!w-5 !min-h-5 accent-[var(--blue)]" />
        <span class="label">Internet</span>
        <span class="chev ml-auto">{svcInternet ? 'Yes' : ''}</span></label>
      <label class="row-line gap-3 cursor-pointer">
        <input type="checkbox" name="svc_home_phone" bind:checked={$bookForm.svc_home_phone} class="!w-5 !min-h-5 accent-[var(--blue)]" />
        <span class="label">Home phone</span>
        <span class="chev ml-auto">{svcHomePhone ? 'Yes' : ''}</span></label>
      <label class="row-line gap-3 cursor-pointer">
        <input type="checkbox" name="svc_tv" bind:checked={$bookForm.svc_tv} class="!w-5 !min-h-5 accent-[var(--blue)]" />
        <span class="label">TV</span>
        <span class="chev ml-auto">{svcTv ? 'Yes' : ''}</span></label>
    </div>
  </div>

  <!-- Emergency -->
  <div class="group">
    <div class="group-title">Emergency contact</div>
    <div class="input-group">
      <label class="field"><input name="emergency_name" bind:value={$bookForm.emergency_name} placeholder="Emergency contact name" aria-label="Emergency contact name" /></label>
      <label class="field"><input name="emergency_number" bind:value={$bookForm.emergency_number} type="tel" placeholder="Phone number" aria-label="Phone number" /></label>
      <label class="field"><input name="emergency_relation" bind:value={$bookForm.emergency_relation} placeholder="Relation" aria-label="Relation" /></label>
    </div>
  </div>

  <div class="group">
    <div class="group-title">Verbal password</div>
    <div class="input-group">
      <label class="field"><input name="verbal_password" bind:value={$bookForm.verbal_password} placeholder="Verbal password" aria-label="Verbal password" /></label>
    </div>
  </div>

  <div class="group">
    <div class="group-title">Existing themes / package details</div>
    <div class="input-group">
      <label class="field"><textarea name="themes" bind:value={$bookForm.themes} rows="3" placeholder="Themes / package details" aria-label="Themes"></textarea></label>
    </div>
  </div>

  <div class="group">
    <div class="group-title">Home security being offered</div>
    <div class="input-group">
      <label class="field"><textarea name="security_offered" bind:value={$bookForm.security_offered} rows="3" placeholder="Home security being offered" aria-label="Home security"></textarea></label>
    </div>
  </div>

  <!-- Tech + Duration -->
  <div class="group">
    <div class="group-title">Schedule</div>
    <div class="input-group">
      <label class="field">
        <select on:change={(e) => setTech(Number(e.currentTarget.value))} value={techId} aria-label="Technician">
          {#each data.techs as t}<option value={t.id}>{t.display_name}</option>{/each}
        </select>
      </label>
    </div>
  </div>

  <div class="group">
    <div class="group-title">Install length</div>
    <div class="group-rows">
      <div class="flex gap-2 p-3">
        {#each durationOptions as opt}
          <button type="button" class="slot-btn flex-1 justify-center {durationMin === opt.value ? 'selected' : ''}" on:click={() => setDuration(opt.value)}>{opt.label}</button>
        {/each}
      </div>
    </div>
  </div>

  <input type="hidden" name="tech_id" value={techId} />

  <!-- Time slots — 2-tab: List / Calendar -->
  <div class="group group--loose">
    <div class="group-title flex items-center justify-between">Time <span class="inline-flex items-center rounded-full bg-[var(--blue)]/10 px-2.5 py-1 text-[12px] font-semibold text-[var(--blue)] border border-[var(--blue)]/15">{slots.length} slots</span></div>
    <div class="px-4 pb-3">
      <div class="inline-flex rounded-[10px] bg-[var(--row2)] p-1 gap-1">
        <button type="button" class="px-4 py-1.5 rounded-[8px] text-[14px] font-medium transition-colors {timeView==='list' ? 'bg-[var(--row)] text-[var(--ink)] shadow-sm border border-[var(--line-thin)]' : 'text-[var(--dim)] hover:text-[var(--ink)]'}" on:click={() => timeView='list'}>List</button>
        <button type="button" class="px-4 py-1.5 rounded-[8px] text-[14px] font-medium transition-colors {timeView==='calendar' ? 'bg-[var(--row)] text-[var(--ink)] shadow-sm border border-[var(--line-thin)]' : 'text-[var(--dim)] hover:text-[var(--ink)]'}" on:click={() => timeView='calendar'}>Calendar</button>
      </div>
    </div>
    {#if $errors.starts_at}<div class="mx-4 mb-3 rounded-[10px] border border-[var(--red)]/20 bg-[var(--red)]/10 px-4 py-3 text-[13px] leading-snug text-[var(--red)]" transition:fly={{ y: -4, duration: 160, easing: cubicOut }}>{$errors.starts_at}</div>{/if}
    {#if slotsByDay.length === 0}
      <div class="empty !py-8"><h3>No open hours</h3><div>Ask the tech to add a block in Hours.</div></div>
    {:else if timeView==='list'}
      <div class="group-rows overflow-hidden">
        {#each slotsByDay as [day, daySlots]}
          <div class="border-b border-[var(--line-thin)] last:border-0 hover:bg-[var(--row2)]/30 transition-colors">
            <div class="flex items-center justify-between px-4 pt-3.5 pb-2">
              <div class="flex items-baseline gap-2">
                <span class="text-[15px] font-semibold {isToday(day) ? 'text-[var(--blue)]' : isTomorrow(day) ? 'text-[var(--ink)]' : 'text-[var(--ink)]'}">{relativeDayLabel(day)}</span>
                <span class="text-[13px] text-[var(--dim)]">{fmtDay(day)}</span>
              </div>
              <span class="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[var(--row2)] text-[var(--dim)] border border-[var(--line-thin)]">{daySlots.length}</span>
            </div>
            <div class="slot-grid !gap-2 !px-4 !pb-4">
              {#each daySlots as s}<button type="button" class="slot-btn !min-h-[40px] !px-3.5 !text-[14px] {s.starts_at === startSlotTs ? 'selected' : ''}" on:click={() => { startSlotTs = s.starts_at; calSelectedDay = day; }}>{fmtTime(s.starts_at)}</button>{/each}
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <div class="group-rows overflow-hidden">
        <div class="flex items-center justify-between px-4 py-3 border-b border-[var(--line-thin)]">
          <button type="button" class="h-8 w-8 grid place-items-center rounded-full hover:bg-[var(--row2)] text-[var(--dim)]" on:click={calPrev} aria-label="Previous month">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <span class="text-[15px] font-semibold">{calMonthLabel}</span>
          <button type="button" class="h-8 w-8 grid place-items-center rounded-full hover:bg-[var(--row2)] text-[var(--dim)]" on:click={calNext} aria-label="Next month">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>
        <div class="grid grid-cols-7 gap-px bg-[var(--line-thin)]">
          {#each ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'] as wd}
            <div class="bg-[var(--row2)] text-center py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--dim)]">{wd}</div>
          {/each}
        </div>
        <div class="grid grid-cols-7 gap-px bg-[var(--line-thin)] p-px">
          {#each Array(calFirstWeekday) as _}<div class="bg-[var(--row)] min-h-[64px]"></div>{/each}
          {#each Array(calDaysInMonth) as _, i}
            {@const dayNum = i+1}
            {@const iso = calDateToIso(dayNum)}
            {@const daySlots = calSlotsMap.get(iso) || []}
            {@const isTodayCal = iso===todayIso}
            {@const isSelectedDay = iso===calSelectedDay}
            {@const hasSlots = daySlots.length>0}
            <button type="button" on:click={() => calSelectedDay = iso} class="relative bg-[var(--row)] min-h-[64px] p-2 text-left flex flex-col gap-1 hover:bg-[var(--row2)] transition-colors {isTodayCal ? 'ring-1 ring-inset ring-[var(--blue)]' : ''} {isSelectedDay ? '!bg-[var(--blue)] !text-white' : ''} {hasSlots ? '' : 'opacity-60'}">
              <span class="text-[14px] font-semibold {isSelectedDay ? 'text-white' : isTodayCal ? 'text-[var(--blue)]' : 'text-[var(--ink)]'}">{dayNum}</span>
              {#if hasSlots}<span class="inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-medium {isSelectedDay ? 'bg-white/20 text-white' : 'bg-[var(--blue)]/10 text-[var(--blue)] border border-[var(--blue)]/15'}">{daySlots.length}</span>{:else}<span class="text-[11px] text-[var(--dim2)]">—</span>{/if}
            </button>
          {/each}
        </div>
        {#if calSelectedDay && calSlotsMap.get(calSelectedDay)?.length}
          <div class="border-t border-[var(--line-thin)]">
            <div class="flex items-baseline gap-2 px-4 pt-3 pb-1">
              <span class="text-[15px] font-semibold {isToday(calSelectedDay) ? 'text-[var(--blue)]' : 'text-[var(--ink)]'}">{relativeDayLabel(calSelectedDay)}</span>
              <span class="text-[13px] text-[var(--dim)]">{fmtDay(calSelectedDay)}</span>
            </div>
            <div class="slot-grid">
              {#each calSlotsMap.get(calSelectedDay) as s}<button type="button" class="slot-btn {s.starts_at === startSlotTs ? 'selected' : ''}" on:click={() => startSlotTs = s.starts_at}>{fmtTime(s.starts_at)}</button>{/each}
            </div>
          </div>
        {:else if calSelectedDay}
          <div class="px-4 py-6 text-center text-[14px] text-[var(--dim)]">No slots this day — pick another date.</div>
        {/if}
      </div>
    {/if}
    {#if selectedSlot}
      <div class="mt-3 mx-4 flex items-center gap-3 rounded-[12px] bg-[var(--blue)] text-white px-4 py-3 shadow-lg shadow-[var(--blue)]/20">
        <div class="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 shrink-0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>
        </div>
        <div>
          <div class="text-[15px] font-semibold">{fmtTime(selectedSlot.starts_at)} — {fmtTime(selectedSlot.ends_at)}</div>
          <div class="text-[13px] text-white/80">{fmtDayFull(selectedSlot)}</div>
        </div>
      </div>
    {/if}
  </div>

  <div class="group">
    <div class="group-title">Notes</div>
    <div class="input-group">
      <label class="field"><textarea name="notes" bind:value={$bookForm.notes} rows="2" placeholder="Notes" aria-label="Notes"></textarea></label>
    </div>
  </div>

  <input type="hidden" name="starts_at" value={startsAtLocal} />
  <input type="hidden" name="ends_at" value={endsAtLocal} />

  <div class="form-section">
    <div class="flex items-center gap-3">
      <button type="button" class="filled flex-1 !w-auto !min-h-[50px] transition-colors duration-200 {confirmBook ? '!bg-amber-500 !cursor-default !opacity-100' : ''}" disabled={confirmBook ? true : (!canSubmit || busy)} on:click={(e)=>{ if(!confirmBook && canSubmit && !busy){ e.preventDefault(); confirmBook=true; } }}>{#if busy}Booking…{:else if confirmBook}Are you sure?{:else}Book job{/if}</button>
      {#if confirmBook}
        <button type="button" in:fly={{ x: 12, duration: 220, easing: cubicOut }} out:scale={{ start: 0.96, duration: 140 }} class="h-[50px] rounded-[10px] border border-[var(--line)] bg-[var(--row)] px-5 text-[15px] font-medium text-[var(--ink)] hover:bg-[var(--row2)] shrink-0" on:click={() => confirmBook=false} disabled={busy}>No</button>
        <button type="submit" in:fly={{ x: 12, duration: 240, easing: cubicOut, delay: 40 }} out:scale={{ start: 0.96, duration: 140 }} class="h-[50px] rounded-[10px] bg-[var(--blue)] px-6 text-[15px] font-semibold text-white hover:bg-[var(--blue-press)] shadow-md shadow-[var(--blue)]/20 shrink-0 disabled:opacity-30" disabled={busy}>Yes</button>
      {/if}
    </div>
    {#if !selectedSlot}<div class="mt-3 text-center text-[13px] text-[var(--dim)]">Pick a time slot above.</div>{/if}
    {#if selectedSlot && !canSubmit && !confirmBook}<div class="mt-3 text-center text-[13px] text-[var(--dim)]">Add customer name and address to continue.</div>{/if}
  </div>
</form>
