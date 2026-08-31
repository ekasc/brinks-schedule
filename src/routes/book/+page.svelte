<script lang="ts">
  import { goto } from '$app/navigation';
  import { superForm } from 'sveltekit-superforms/client';
  import { fly, scale } from 'svelte/transition';
  import AddressAutocomplete from '$lib/components/AddressAutocomplete.svelte';
  import { Select, Button, Calendar, Popover } from 'bits-ui';
  import { CalendarDate, parseDate, today, getLocalTimeZone } from '@internationalized/date';
  import { cubicOut } from 'svelte/easing';
  import { onMount } from 'svelte';
  import type { PageData, ActionData } from './$types';
  export let data: PageData;
  export let form: ActionData;
  const { form: bookForm, errors, enhance } = superForm(data.form, { dataType: 'form', resetForm: false });

  let techId = data.preselectTech;
  let durationMin = data.durationMin;
  // keep in sync only on initial load, local changes are via history.replaceState (no reload)
  $: if (data.preselectTech && data.preselectTech !== techId && !history.state?.keepTech) techId = data.preselectTech;
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
  $: securityOffered = $bookForm.security_offered;
  $: notes = $bookForm.notes;
  let busy = false;
  let confirmBook = false;
  $: if (!canSubmit) confirmBook = false;
  let selLat: number | null = null;
  let selLng: number | null = null;

  $: if (form?.starts_at && startSlotTs === 0) {
    const t = new Date(form.starts_at).getTime() / 1000;
    if (slots.some(s => s.starts_at === t)) startSlotTs = t;
  }

  function setDuration(min: number) {
    if (min === durationMin) return;
    durationMin = min;
    startSlotTs = 0;
  }
  function setTech(id: number) {
    techId = id;
    startSlotTs = 0;
  }

  $: slots = (data.slotsByTechByDuration?.[techId]?.[durationMin] ?? data.slotsByTech[techId] ?? []);
  function localDateKey(ts:number) {
    const d = new Date(ts * 1000);
    const p = (n:number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
  }
  $: slotsByDay = (() => {
    const map = new Map<string, { starts_at: number; ends_at: number }[]>();
    for (const s of slots) {
      const key = localDateKey(s.starts_at);
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
  function slotsForCalendarDay(iso:string) {
    return slots.filter(s => localDateKey(s.starts_at) === iso);
  }
  let calSelectedDay: string | null = null;
  $: if (!calSelectedDay && slotsByDay.length) calSelectedDay = slotsByDay[0][0];
  function calPrev(){ calCursor = new Date(calYear, calMonth-1, 1); }
  function calNext(){ calCursor = new Date(calYear, calMonth+1, 1); }
  function calDateToIso(year:number, month:number, day:number){
    const m=String(month+1).padStart(2,'0'); const d=String(day).padStart(2,'0'); return `${year}-${m}-${d}`;
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
  // Format a unix timestamp as a datetime-local string using LOCAL components so the
  // value round-trips exactly. Using toISOString() would emit a UTC string with no
  // timezone suffix, which the browser would parse back as LOCAL time and shift the
  // stored booking by the user's UTC offset.
  function toLocalInput(ts: number): string {
    const d = new Date(ts * 1000);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  $: selectedSlot = slots.find(s => s.starts_at === startSlotTs);
  $: startsAtLocal = selectedSlot ? toLocalInput(selectedSlot.starts_at) : '';
  $: endsAtLocal = selectedSlot ? toLocalInput(selectedSlot.ends_at) : '';
  $: canSubmit = !!selectedSlot && !!clientName?.trim() && !!address?.trim() && !busy;

  const idTypes: { value: 'dl'|'passport'|'bcid'|'other'; label: string }[] = [
    { value: 'dl', label: "Driver's licence" },
    { value: 'passport', label: 'Passport' },
    { value: 'bcid', label: 'BCID' },
    { value: 'other', label: 'Other' }
  ];
  $: bookTechItems = data.techs.map((t) => ({ value: String(t.id), label: t.display_name }));
  const durationOptions = [
    { value: 60, label: '1 hr' },
    { value: 90, label: '1.5 hr' },
    { value: 120, label: '2 hr' }
  ];
  const inpc = 'w-full bg-transparent py-0 text-[var(--t-17)] text-[var(--ink)] outline-none placeholder:text-[var(--dim)]';

  function autoFocus(node: HTMLInputElement) {
    requestAnimationFrame(() => node.focus());
  }

  // --- Desktop ToC — column of section headers (Apple: restraint, spatial consistency) ---
  let tocActive = 'sec-customer';
  function tocScrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  $: tocItems = [
    { id: 'sec-customer', label: 'Customer' },
    { id: 'sec-telus', label: 'TELUS account' },
    { id: 'sec-services', label: 'Services the customer has' },
    { id: 'sec-emergency', label: 'Emergency contact' },
    { id: 'sec-verbal', label: 'Verbal password' },
    { id: 'sec-security', label: 'Home security being offered' },
    { id: 'sec-schedule', label: 'Schedule' },
    { id: 'sec-time', label: 'Time' },
    { id: 'sec-pricing', label: 'Pricing' },
    { id: 'sec-book', label: 'Book job' }
  ];
  onMount(() => {
    const ids = tocItems.map(t => t.id);
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter(e => e.isIntersecting).sort((a,b) => b.intersectionRatio - a.intersectionRatio);
      if (visible[0]) tocActive = visible[0].target.id;
    }, { rootMargin: '-25% 0px -60% 0px', threshold: [0, 0.25, 0.5, 1] });
    ids.forEach(id => { const el = document.getElementById(id); if (el) observer.observe(el); });
    return () => observer.disconnect();
  });

  // --- DOB bits calendar ---
  let dobOpen = false;
  $: dobCal = $bookForm.dob ? (() => { try { return parseDate($bookForm.dob); } catch { return undefined; } })() : undefined;
  $: dobDisplay = $bookForm.dob ? (() => { try { const d = new Date($bookForm.dob + 'T00:00:00'); return isNaN(d.getTime()) ? $bookForm.dob : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return $bookForm.dob; } })() : '';
  function onDobChange(v: CalendarDate | undefined) {
    $bookForm.dob = v ? v.toString() : '';
    dobOpen = false;
  }
  let dobPlaceholder: CalendarDate | undefined = undefined;
  $: if (!dobPlaceholder) dobPlaceholder = dobCal ?? today(getLocalTimeZone());
  $: dobWeeks = (() => {
    if (!dobPlaceholder) return [];
    const y = dobPlaceholder.year, m = dobPlaceholder.month;
    const firstWeekday = new Date(y, m - 1, 1).getDay();
    const daysInMonth = new Date(y, m, 0).getDate();
    const daysInPrevMonth = new Date(y, m - 1, 0).getDate();
    const weeks: CalendarDate[][] = [];
    let dc = 1 - firstWeekday;
    for (let w = 0; w < 6; w++) {
      const week: CalendarDate[] = [];
      for (let d = 0; d < 7; d++) {
        let yy = y, mm = m, dd = dc;
        if (dd < 1) {
          mm = m - 1 === 0 ? 12 : m - 1;
          yy = m - 1 === 0 ? y - 1 : y;
          dd = daysInPrevMonth + dd;
          week.push(new CalendarDate(yy, mm, dd));
        } else if (dd > daysInMonth) {
          mm = m + 1 === 13 ? 1 : m + 1;
          yy = m + 1 === 13 ? y + 1 : y;
          week.push(new CalendarDate(yy, mm, dd - daysInMonth));
        } else {
          week.push(new CalendarDate(y, m, dd));
        }
        dc++;
      }
      weeks.push(week);
    }
    return weeks;
  })();
</script>

<svelte:head><title>New job</title></svelte:head>

<div class="mt-8 mb-2 px-4">
  <h1 class="text-[28px] font-bold tracking-tight">New job</h1>
</div>
<p class="mb-6 px-4 text-[13px] text-[var(--dim)]" aria-hidden="true"><span class="text-[var(--red)]">*</span> Required</p>

<!-- Desktop ToC — minimal left column (Apple: restraint) -->
<nav aria-label="Sections" class="hidden xl:block fixed left-[calc(50%-552px)] top-[118px] w-[160px] z-20 select-none">
  <div class="py-1">
    <span class="block text-[10px] font-semibold tracking-[0.08em] uppercase text-[var(--dim2)] mb-2 px-2">On this page</span>
    <ol class="border-l border-[var(--line-thin)] ml-2">
      {#each tocItems as item}
        {@const active = tocActive === item.id}
        <li>
          <button type="button" onclick={() => tocScrollTo(item.id)} class="w-full text-left pl-3 pr-2 py-[3px] -ml-px border-l-2 text-[11.5px] leading-[1.3] tracking-tight transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue)] {active ? 'border-[var(--blue)] text-[var(--blue)] font-semibold' : 'border-transparent text-[var(--dim)] hover:text-[var(--ink)] font-normal'}">{item.label}</button>
        </li>
      {/each}
    </ol>
  </div>
</nav>

{#if form?.error}
  <div class="form-section">
    <div class="err" role="alert">{form.error}</div>
  </div>
{/if}

<form method="POST" use:enhance novalidate class="pb-8">
  <!-- Customer -->
  <div id="sec-customer" class="group scroll-mt-24">
    <div class="group-title">Customer</div>
    <div class="input-group">
      <label class="field">
        <input class={inpc} name="client_name" bind:value={$bookForm.client_name} required aria-required="true" autocomplete="name" placeholder="Full name *" aria-label="Full name (required)" aria-invalid={$errors.client_name ? "true" : undefined} style:border-color={$errors.client_name ? "var(--red)" : undefined} />
      {#if $errors.client_name}<span class="px-1 pt-1 text-[13px] leading-tight text-[var(--red)]" transition:fly={{ y: -4, duration: 160, easing: cubicOut }}>{$errors.client_name}</span>{/if}</label>
      <span id="sec-customer-addr" class="block scroll-mt-28" aria-hidden="true"></span>
      <AddressAutocomplete name="address" bind:value={$bookForm.address} bind:lat={selLat} bind:lng={selLng} placeholder="Address *" ariaLabel="Address (required)" error={$errors.address} showKey={false} required />
      {#if $bookForm.address?.trim()}
        {#if selLat != null && selLng != null}
          <span class="px-1 pt-1 text-[13px] leading-tight text-[var(--blue)]">✓ Map location set — this job will appear on the route map.</span>
        {:else}
          <span class="px-1 pt-1 text-[13px] leading-tight text-[var(--dim)]">No map location selected. If this address can’t be matched, the job will still be booked but won’t appear on the route map.</span>
        {/if}
      {/if}
      <label class="field">
        <input class={inpc} name="email" type="email" bind:value={$bookForm.email} autocomplete="email" placeholder="Email" aria-label="Email" aria-invalid={$errors.email ? "true" : undefined} />
      {#if $errors.email}<span class="px-1 pt-1 text-[13px] leading-tight text-[var(--red)]" transition:fly={{ y: -4, duration: 160, easing: cubicOut }}>{$errors.email}</span>{/if}</label>
      <label class="field">
        <input class={inpc} name="phone" bind:value={$bookForm.phone} type="tel" autocomplete="tel" placeholder="Phone" aria-label="Phone number" aria-invalid={$errors.phone ? "true" : undefined} />
      {#if $errors.phone}<span class="px-1 pt-1 text-[13px] leading-tight text-[var(--red)]" transition:fly={{ y: -4, duration: 160, easing: cubicOut }}>{$errors.phone}</span>{/if}</label>
      <label class="field">
        <Popover.Root bind:open={dobOpen}>
          <Popover.Trigger>
            {#snippet child({ props })}
              <button {...props} type="button" class={inpc + ' flex cursor-pointer items-center justify-between text-left data-[placeholder]:!text-[var(--dim)] active:!scale-100'} aria-label="Date of birth" data-placeholder={!dobDisplay ? '' : undefined}>
                <span class={!dobDisplay ? 'text-[var(--dim)]' : ''}>{dobDisplay || 'Date of birth'}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="ml-2 shrink-0 text-[var(--dim)]"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
              </button>
            {/snippet}
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content class="z-[1000] w-[320px] rounded-[14px] border border-[var(--line)] bg-[var(--row)] p-3 shadow-xl" sideOffset={8} side="bottom" align="start">
              <Calendar.Root type="single" value={dobCal} bind:placeholder={dobPlaceholder} onValueChange={onDobChange} maxValue={today(getLocalTimeZone())} locale="en-CA" weekdayFormat="short" fixedWeeks={true} class="w-full">
                <Calendar.Header class="flex items-center justify-between pb-3 gap-2">
                  <Calendar.PrevButton class="grid h-8 w-8 place-items-center rounded-full hover:bg-[var(--row2)] text-[var(--ink)] active:!scale-100"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></Calendar.PrevButton>
                  <div class="flex items-center gap-2">
                    <Calendar.MonthSelect class="rounded-[8px] border border-[var(--line)] bg-[var(--row)] px-2.5 py-1.5 text-[14px] font-medium text-[var(--ink)] outline-none" aria-label="Select month" />
                    <Calendar.YearSelect class="rounded-[8px] border border-[var(--line)] bg-[var(--row)] px-2.5 py-1.5 text-[14px] font-medium text-[var(--ink)] outline-none" aria-label="Select year" />
                  </div>
                  <Calendar.NextButton class="grid h-8 w-8 place-items-center rounded-full hover:bg-[var(--row2)] text-[var(--ink)] active:!scale-100"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg></Calendar.NextButton>
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
                    {#each dobWeeks as week}
                      <Calendar.GridRow class="flex justify-between">
                        {#each week as date}
                          <Calendar.Cell date={date} month={dobPlaceholder} class="p-0">
                            <Calendar.Day class="grid h-8 w-8 place-items-center rounded-full text-[14px] hover:bg-[var(--row2)] active:!scale-100 data-[selected]:!bg-[var(--blue)] data-[selected]:!text-white data-[disabled]:opacity-30 data-[outside-month]:opacity-30 data-[today]:ring-1 data-[today]:ring-[var(--blue)]" />
                          </Calendar.Cell>
                        {/each}
                      </Calendar.GridRow>
                    {/each}
                  </Calendar.GridBody>
                </Calendar.Grid>
                {#if dobDisplay}
                  <div class="mt-3 flex justify-between gap-2 border-t border-[var(--line-thin)] pt-3">
                    <Button.Root type="button" class="flex-1 rounded-[8px] border border-[var(--line)] bg-[var(--row)] px-3 py-1.5 text-[13px] text-[var(--ink)] hover:bg-[var(--row2)] active:!scale-100" onclick={() => onDobChange(undefined)}>Clear</Button.Root>
                    <Button.Root type="button" class="flex-1 rounded-[8px] bg-[var(--blue)] px-3 py-1.5 text-[13px] font-medium text-white hover:bg-[var(--blue-press)] active:!scale-100" onclick={() => dobOpen = false}>Done</Button.Root>
                  </div>
                {/if}
              </Calendar.Root>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        <input type="hidden" name="dob" value={$bookForm.dob} />
      {#if $errors.dob}<span class="px-1 pt-1 text-[13px] leading-tight text-[var(--red)]" transition:fly={{ y: -4, duration: 160, easing: cubicOut }}>{$errors.dob}</span>{/if}</label>
    </div>
  </div>

  <!-- TELUS account -->
  <div id="sec-telus" class="group scroll-mt-24">
    <div class="group-title">TELUS account</div>
    <div class="input-group">
      <label class="field">
        <input class={inpc} name="telus_pin" bind:value={$bookForm.telus_pin} inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="4-digit PIN" aria-label="4-digit PIN" aria-invalid={$errors.telus_pin ? "true" : undefined} />
      {#if $errors.telus_pin}<span class="px-1 pt-1 text-[13px] leading-tight text-[var(--red)]" transition:fly={{ y: -4, duration: 160, easing: cubicOut }}>{$errors.telus_pin}</span>{/if}</label>
      <label class="field">
        <Select.Root type="single" name="id_type" bind:value={$bookForm.id_type} items={idTypes}>
          <Select.Trigger class={inpc + ' flex cursor-pointer items-center justify-between text-left data-[placeholder]:!text-[var(--dim)]'} aria-label="ID type"><Select.Value placeholder="ID type" /><svg width="12" height="8" viewBox="0 0 12 8" fill="none" aria-hidden="true" class="ml-2 shrink-0 text-[var(--dim)]"><path d="M1 1.5L6 6.5L11 1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></Select.Trigger>
          <Select.Portal>
            <Select.Content class="z-[1000] min-w-[200px] w-[var(--bits-floating-anchor-width)] max-w-[92vw] rounded-[10px] border border-[var(--line)] bg-[var(--row)] p-1 text-[var(--ink)] shadow-xl" sideOffset={6}>
              <Select.Viewport>
                {#each idTypes as t}<Select.Item value={t.value} label={t.label} class="cursor-pointer rounded-[8px] px-3 py-2 text-[15px] data-[state=checked]:bg-[var(--row2)] data-[highlighted]:bg-[var(--row2)]">{t.label}</Select.Item>{/each}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>
      </label>
      <label class="field">
        <input class={inpc} name="id_last4" bind:value={$bookForm.id_last4} inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="Last 4 of ID" aria-label="Last 4 of ID" aria-invalid={$errors.id_last4 ? "true" : undefined} />
      {#if $errors.id_last4}<span class="px-1 pt-1 text-[13px] leading-tight text-[var(--red)]" transition:fly={{ y: -4, duration: 160, easing: cubicOut }}>{$errors.id_last4}</span>{/if}</label>
    </div>
  </div>

  <!-- Services -->
  <div id="sec-services" class="group scroll-mt-24">
    <div class="group-title">Services the customer has</div>
    <div class="group-rows divide-y divide-[var(--line-thin)]">
      <!-- Internet -->
      <div class="flex items-center gap-3 px-4 py-3 min-h-[56px] transition-colors duration-200 {svcInternet ? 'bg-[color-mix(in_srgb,var(--blue)_4%,var(--row))]' : 'bg-[var(--row)]'}">
        <label class="flex items-center gap-3 cursor-pointer shrink-0 select-none">
          <input type="checkbox" name="svc_internet" bind:checked={$bookForm.svc_internet} class="h-5 w-5 rounded-[6px] border-[1.5px] border-[var(--line)] bg-[var(--row2)] accent-[var(--blue)] checked:border-[var(--blue)] focus-visible:ring-2 focus-visible:ring-[var(--blue)] focus-visible:ring-offset-0 transition-colors" />
          <span class="text-[15px] font-medium tracking-tight {svcInternet ? 'text-[var(--ink)]' : 'text-[var(--ink)]'}">Internet</span>
        </label>
        {#if svcInternet}
          <div class="flex flex-1 items-center gap-3 min-w-0 ml-2 sm:ml-4" in:fly={{ x: 10, duration: 260, easing: cubicOut }} out:fly={{ x: 8, duration: 140 }}>
            <span class="hidden sm:block h-6 w-px bg-[var(--line)] shrink-0 opacity-60"></span>
            <div class="relative flex-1">
              <input use:autoFocus class="w-full bg-[var(--bg)] sm:bg-[var(--row2)] border border-[var(--line)] rounded-[10px] px-3.5 py-2.5 pr-8 text-[14px] leading-none text-[var(--ink)] placeholder:text-[var(--dim2)] placeholder:text-[13px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] focus:bg-[var(--row)] focus:border-[var(--blue)] focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--blue)_14%,transparent),inset_0_1px_2px_rgba(0,0,0,0.04)] outline-none transition-all duration-200" name="svc_internet_detail" bind:value={$bookForm.svc_internet_detail} placeholder="e.g. Fibre 1.5G" aria-label="Internet details" maxlength="120" autocomplete="off" />
              <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--dim2)]"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg></span>
            </div>
          </div>
        {:else}
          <span class="ml-auto hidden sm:inline-flex items-center rounded-full bg-[var(--row2)] border border-[var(--line-thin)] px-2.5 py-1 text-[11px] font-medium tracking-wide uppercase text-[var(--dim2)]">Not included</span>
        {/if}
      </div>
      <!-- Home phone -->
      <div class="flex items-center gap-3 px-4 py-3 min-h-[56px] transition-colors duration-200 {svcHomePhone ? 'bg-[color-mix(in_srgb,var(--blue)_4%,var(--row))]' : 'bg-[var(--row)]'}">
        <label class="flex items-center gap-3 cursor-pointer shrink-0 select-none">
          <input type="checkbox" name="svc_home_phone" bind:checked={$bookForm.svc_home_phone} class="h-5 w-5 rounded-[6px] border-[1.5px] border-[var(--line)] bg-[var(--row2)] accent-[var(--blue)] checked:border-[var(--blue)] focus-visible:ring-2 focus-visible:ring-[var(--blue)] focus-visible:ring-offset-0 transition-colors" />
          <span class="text-[15px] font-medium tracking-tight text-[var(--ink)]">Home phone</span>
        </label>
        {#if svcHomePhone}
          <div class="flex flex-1 items-center gap-3 min-w-0 ml-2 sm:ml-4" in:fly={{ x: 10, duration: 260, easing: cubicOut }} out:fly={{ x: 8, duration: 140 }}>
            <span class="hidden sm:block h-6 w-px bg-[var(--line)] shrink-0 opacity-60"></span>
            <div class="relative flex-1">
              <input use:autoFocus class="w-full bg-[var(--bg)] sm:bg-[var(--row2)] border border-[var(--line)] rounded-[10px] px-3.5 py-2.5 pr-8 text-[14px] leading-none text-[var(--ink)] placeholder:text-[var(--dim2)] placeholder:text-[13px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] focus:bg-[var(--row)] focus:border-[var(--blue)] focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--blue)_14%,transparent),inset_0_1px_2px_rgba(0,0,0,0.04)] outline-none transition-all duration-200" name="svc_home_phone_detail" bind:value={$bookForm.svc_home_phone_detail} placeholder="e.g. Unlimited Canada" aria-label="Home phone details" maxlength="120" autocomplete="off" />
              <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--dim2)]"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg></span>
            </div>
          </div>
        {:else}
          <span class="ml-auto hidden sm:inline-flex items-center rounded-full bg-[var(--row2)] border border-[var(--line-thin)] px-2.5 py-1 text-[11px] font-medium tracking-wide uppercase text-[var(--dim2)]">Not included</span>
        {/if}
      </div>
      <!-- TV -->
      <div class="flex items-center gap-3 px-4 py-3 min-h-[56px] transition-colors duration-200 {svcTv ? 'bg-[color-mix(in_srgb,var(--blue)_4%,var(--row))]' : 'bg-[var(--row)]'}">
        <label class="flex items-center gap-3 cursor-pointer shrink-0 select-none">
          <input type="checkbox" name="svc_tv" bind:checked={$bookForm.svc_tv} class="h-5 w-5 rounded-[6px] border-[1.5px] border-[var(--line)] bg-[var(--row2)] accent-[var(--blue)] checked:border-[var(--blue)] focus-visible:ring-2 focus-visible:ring-[var(--blue)] focus-visible:ring-offset-0 transition-colors" />
          <span class="text-[15px] font-medium tracking-tight text-[var(--ink)]">TV</span>
        </label>
        {#if svcTv}
          <div class="flex flex-1 items-center gap-3 min-w-0 ml-2 sm:ml-4" in:fly={{ x: 10, duration: 260, easing: cubicOut }} out:fly={{ x: 8, duration: 140 }}>
            <span class="hidden sm:block h-6 w-px bg-[var(--line)] shrink-0 opacity-60"></span>
            <div class="relative flex-1">
              <input use:autoFocus class="w-full bg-[var(--bg)] sm:bg-[var(--row2)] border border-[var(--line)] rounded-[10px] px-3.5 py-2.5 pr-8 text-[14px] leading-none text-[var(--ink)] placeholder:text-[var(--dim2)] placeholder:text-[13px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] focus:bg-[var(--row)] focus:border-[var(--blue)] focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--blue)_14%,transparent),inset_0_1px_2px_rgba(0,0,0,0.04)] outline-none transition-all duration-200" name="svc_tv_detail" bind:value={$bookForm.svc_tv_detail} placeholder="e.g. Optik TV 4K" aria-label="TV details" maxlength="120" autocomplete="off" />
              <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--dim2)]"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg></span>
            </div>
          </div>
        {:else}
          <span class="ml-auto hidden sm:inline-flex items-center rounded-full bg-[var(--row2)] border border-[var(--line-thin)] px-2.5 py-1 text-[11px] font-medium tracking-wide uppercase text-[var(--dim2)]">Not included</span>
        {/if}
      </div>
    </div>
    {#if $errors.svc_internet_detail}<span class="block px-4 pt-2 text-[13px] leading-tight text-[var(--red)]">{$errors.svc_internet_detail}</span>{/if}
    {#if $errors.svc_home_phone_detail}<span class="block px-4 pt-2 text-[13px] leading-tight text-[var(--red)]">{$errors.svc_home_phone_detail}</span>{/if}
    {#if $errors.svc_tv_detail}<span class="block px-4 pt-2 text-[13px] leading-tight text-[var(--red)]">{$errors.svc_tv_detail}</span>{/if}
  </div>

  <!-- Emergency -->
  <div id="sec-emergency" class="group scroll-mt-24">
    <div class="group-title">Emergency contact</div>
    <div class="input-group">
      <label class="field"><input class={inpc} name="emergency_name" bind:value={$bookForm.emergency_name} placeholder="Emergency contact name" aria-label="Emergency contact name" /></label>
      <label class="field"><input class={inpc} name="emergency_number" bind:value={$bookForm.emergency_number} type="tel" placeholder="Phone number" aria-label="Phone number" /></label>
      <label class="field"><input class={inpc} name="emergency_relation" bind:value={$bookForm.emergency_relation} placeholder="Relation" aria-label="Relation" /></label>
    </div>
  </div>

  <div id="sec-verbal" class="group scroll-mt-24">
    <div class="group-title">Verbal password</div>
    <div class="input-group">
      <label class="field"><input class={inpc} name="verbal_password" bind:value={$bookForm.verbal_password} placeholder="Verbal password" aria-label="Verbal password" /></label>
    </div>
  </div>

  <div id="sec-security" class="group scroll-mt-24">
    <div class="group-title">Home security being offered</div>
    <div class="input-group">
      <label class="field"><textarea class={inpc} name="security_offered" bind:value={$bookForm.security_offered} rows="3" placeholder="Home security being offered" aria-label="Home security"></textarea></label>
    </div>
  </div>

  <!-- Tech + Duration -->
  <div id="sec-schedule" class="group scroll-mt-24">
    <div class="group-title">Schedule</div>
    <div class="input-group">
      <label class="field">
        <Select.Root type="single" value={String(techId)} onValueChange={(v) => { if (v != null) setTech(Number(v)); }} items={bookTechItems}>
          <Select.Trigger class={inpc + ' flex cursor-pointer items-center justify-between text-left data-[placeholder]:!text-[var(--dim)]'} aria-label="Technician (required)" aria-required="true"><Select.Value placeholder="Technician *" /><svg width="12" height="8" viewBox="0 0 12 8" fill="none" aria-hidden="true" class="ml-2 shrink-0 text-[var(--dim)]"><path d="M1 1.5L6 6.5L11 1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></Select.Trigger>
          <Select.Portal>
            <Select.Content class="z-[1000] min-w-[200px] w-[var(--bits-floating-anchor-width)] max-w-[92vw] rounded-[10px] border border-[var(--line)] bg-[var(--row)] p-1 text-[var(--ink)] shadow-xl" sideOffset={6}>
              <Select.Viewport>
                {#each data.techs as t}<Select.Item value={String(t.id)} label={t.display_name} class="cursor-pointer rounded-[8px] px-3 py-2 text-[15px] data-[state=checked]:bg-[var(--row2)] data-[highlighted]:bg-[var(--row2)]">{t.display_name}</Select.Item>{/each}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>
      </label>
    </div>
  </div>

  <div class="group">
    <div class="group-title">Install length</div>
    <div class="group-rows">
      <div class="flex gap-2 p-3">
        {#each durationOptions as opt}
          <Button.Root type="button" class="slot-btn flex-1 justify-center {durationMin === opt.value ? 'selected' : ''}" onclick={() => setDuration(opt.value)}>{opt.label}</Button.Root>
        {/each}
      </div>
    </div>
  </div>

  <input type="hidden" name="tech_id" value={techId} />
  <!-- selLat/selLng are UI state only (map preview). Server geocodes address authoritatively — never trust client coords. -->

  <!-- Time slots — 2-tab: List / Calendar -->
  <div id="sec-time" class="group group--loose scroll-mt-24">
    <div class="group-title flex items-center justify-between"><span>Time <span class="req" aria-hidden="true">*</span></span> <span class="inline-flex items-center rounded-full bg-[color-mix(in_srgb,var(--blue)_10%,transparent)] px-2.5 py-1 text-[12px] font-semibold text-[var(--blue)] border border-[color-mix(in_srgb,var(--blue)_15%,transparent)]">{slots.length} slots</span></div>
    <div class="px-4 pb-3">
      <div class="inline-flex rounded-[10px] bg-[var(--row2)] p-1 gap-1">
        <Button.Root type="button" class="px-4 py-1.5 rounded-[8px] text-[14px] font-medium transition-colors {timeView==='list' ? 'bg-[var(--row)] text-[var(--ink)] shadow-sm border border-[var(--line-thin)]' : 'text-[var(--dim)] hover:text-[var(--ink)]'}" onclick={() => timeView='list'}>List</Button.Root>
        <Button.Root type="button" class="px-4 py-1.5 rounded-[8px] text-[14px] font-medium transition-colors {timeView==='calendar' ? 'bg-[var(--row)] text-[var(--ink)] shadow-sm border border-[var(--line-thin)]' : 'text-[var(--dim)] hover:text-[var(--ink)]'}" onclick={() => timeView='calendar'}>Calendar</Button.Root>
      </div>
    </div>
    {#if $errors.starts_at}<div class="mx-4 mb-3 rounded-[10px] border border-[color-mix(in_srgb,var(--red)_20%,transparent)] bg-[color-mix(in_srgb,var(--red)_10%,transparent)] px-4 py-3 text-[13px] leading-snug text-[var(--red)]" transition:fly={{ y: -4, duration: 160, easing: cubicOut }}>{$errors.starts_at}</div>{/if}
    {#if slotsByDay.length === 0}
      <div class="empty !py-8"><h3>No hours posted</h3><div>This tech hasn't added anything in Hours yet.</div></div>
    {:else if timeView==='list'}
      <div class="group-rows overflow-hidden">
        {#each slotsByDay as [day, daySlots]}
          <div class="border-b border-[var(--line-thin)] last:border-0 hover:bg-[color-mix(in_srgb,var(--row2)_30%,transparent)] transition-colors">
            <div class="flex items-center justify-between px-4 pt-3.5 pb-2">
              <div class="flex items-baseline gap-2">
                <span class="text-[15px] font-semibold {isToday(day) ? 'text-[var(--blue)]' : 'text-[var(--ink)]'}">{relativeDayLabel(day)}</span>
                <span class="text-[13px] text-[var(--dim)]">{fmtDay(day)}</span>
              </div>
              <span class="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[var(--row2)] text-[var(--dim)] border border-[var(--line-thin)]">{daySlots.length}</span>
            </div>
            <div class="slot-grid !gap-2 !px-4 !pb-4">
              {#each daySlots as s}<Button.Root type="button" class="slot-btn !min-h-[40px] !px-3.5 !text-[14px] {s.starts_at === startSlotTs ? 'selected' : ''}" onclick={() => { startSlotTs = s.starts_at; calSelectedDay = day; }}>{fmtTime(s.starts_at)}</Button.Root>{/each}
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <div class="group-rows overflow-hidden">
        <div class="flex items-center justify-between px-4 py-3 border-b border-[var(--line-thin)]">
          <Button.Root type="button" class="h-8 w-8 grid place-items-center rounded-full hover:bg-[var(--row2)] text-[var(--dim)]" onclick={calPrev} aria-label="Previous month">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>
          </Button.Root>
          <span class="text-[15px] font-semibold">{calMonthLabel}</span>
          <Button.Root type="button" class="h-8 w-8 grid place-items-center rounded-full hover:bg-[var(--row2)] text-[var(--dim)]" onclick={calNext} aria-label="Next month">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>
          </Button.Root>
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
            {@const iso = calDateToIso(calYear, calMonth, dayNum)}
            {@const daySlots = slotsForCalendarDay(iso)}
            {@const isTodayCal = iso===todayIso}
            {@const isSelectedDay = iso===calSelectedDay}
            {@const hasSlots = daySlots.length>0}
            <Button.Root type="button" onclick={() => calSelectedDay = iso} class="relative bg-[var(--row)] min-h-[64px] p-2 text-left flex flex-col gap-1 hover:bg-[var(--row2)] transition-colors {isTodayCal ? 'ring-1 ring-inset ring-[var(--blue)]' : ''} {isSelectedDay ? '!bg-[var(--blue)] !text-white' : ''} {hasSlots ? '' : 'opacity-60'}">
              <span class="text-[14px] font-semibold {isSelectedDay ? 'text-white' : isTodayCal ? 'text-[var(--blue)]' : 'text-[var(--ink)]'}">{dayNum}</span>
              {#if hasSlots}<span class="inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-medium {isSelectedDay ? 'bg-white/20 text-white' : 'bg-[color-mix(in_srgb,var(--blue)_10%,transparent)] text-[var(--blue)] border border-[color-mix(in_srgb,var(--blue)_15%,transparent)]'}">{daySlots.length}</span>{:else}<span class="text-[11px] text-[var(--dim2)]">—</span>{/if}
            </Button.Root>
          {/each}
        </div>
        {#if calSelectedDay && slotsForCalendarDay(calSelectedDay).length}
          <div class="border-t border-[var(--line-thin)]">
            <div class="flex items-baseline gap-2 px-4 pt-3 pb-1">
              <span class="text-[15px] font-semibold {isToday(calSelectedDay) ? 'text-[var(--blue)]' : 'text-[var(--ink)]'}">{relativeDayLabel(calSelectedDay)}</span>
              <span class="text-[13px] text-[var(--dim)]">{fmtDay(calSelectedDay)}</span>
            </div>
            <div class="slot-grid">
              {#each slotsForCalendarDay(calSelectedDay) as s}<Button.Root type="button" class="slot-btn {s.starts_at === startSlotTs ? 'selected' : ''}" onclick={() => startSlotTs = s.starts_at}>{fmtTime(s.starts_at)}</Button.Root>{/each}
            </div>
          </div>
        {:else if calSelectedDay}
          <div class="px-4 py-6 text-center text-[14px] text-[var(--dim)]">No slots this day — pick another date.</div>
        {/if}
      </div>
    {/if}
    {#if selectedSlot}
      <div class="mt-3 mx-4 flex items-center gap-3 rounded-[12px] bg-[var(--blue)] text-white px-4 py-3 shadow-lg shadow-[color-mix(in_srgb,var(--blue)_20%,transparent)]">
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
      <label class="field"><textarea class={inpc} name="notes" bind:value={$bookForm.notes} rows="2" placeholder="Notes" aria-label="Notes"></textarea></label>
    </div>
  </div>

  <div id="sec-pricing" class="group scroll-mt-24">
    <div class="group-title">Pricing</div>
    <div class="input-group">
      <label class="field">
        <input class={inpc} name="price" bind:value={$bookForm.price} type="text" inputmode="decimal" placeholder="Price ($)" aria-label="Price in dollars" aria-invalid={$errors.price ? "true" : undefined} />
      {#if $errors.price}<span class="px-1 pt-1 text-[13px] leading-tight text-[var(--red)]" transition:fly={{ y: -4, duration: 160, easing: cubicOut }}>{$errors.price}</span>{/if}</label>
    </div>
  </div>

  <input type="hidden" name="starts_at" value={startsAtLocal} />
  <input type="hidden" name="ends_at" value={endsAtLocal} />

  <div id="sec-book" class="form-section scroll-mt-24">
    <div class="flex items-center gap-3">
      <Button.Root type="button" class="filled flex-1 !w-auto !min-h-[50px] transition-all duration-200 {confirmBook ? '!ring-2 !ring-white/60 !ring-offset-2 !ring-offset-[var(--bg)]' : ''}" disabled={confirmBook ? true : (!canSubmit || busy)} onclick={(e)=>{ if(!confirmBook && canSubmit && !busy){ e.preventDefault(); confirmBook=true; } }}>{#if busy}Booking…{:else if confirmBook}Are you sure?{:else}Book job{/if}</Button.Root>
      {#if confirmBook}
        <div in:fly={{ x: 12, duration: 220, easing: cubicOut }} out:scale={{ start: 0.96, duration: 140 }} class="shrink-0">
          <Button.Root type="button" class="h-[50px] rounded-[10px] border border-[var(--line)] bg-[var(--row)] px-5 text-[15px] font-medium text-[var(--ink)] hover:bg-[var(--row2)]" onclick={() => confirmBook=false} disabled={busy}>No</Button.Root>
        </div>
        <div in:fly={{ x: 12, duration: 240, easing: cubicOut, delay: 40 }} out:scale={{ start: 0.96, duration: 140 }} class="shrink-0">
          <Button.Root type="submit" class="h-[50px] rounded-[10px] bg-[var(--blue)] px-6 text-[15px] font-semibold text-white hover:bg-[var(--blue-press)] shadow-md shadow-[color-mix(in_srgb,var(--blue)_20%,transparent)] shrink-0 disabled:opacity-30" disabled={busy}>Yes</Button.Root>
        </div>
      {/if}
    </div>
    {#if !selectedSlot}<div class="mt-3 text-center text-[13px] text-[var(--dim)]">Pick a time slot above.</div>{/if}
    {#if selectedSlot && !canSubmit && !confirmBook}<div class="mt-3 text-center text-[13px] text-[var(--dim)]">Add customer name and address to continue.</div>{/if}
  </div>
</form>
