<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { invalidateAll } from '$app/navigation';
  import { deserialize } from '$app/forms';
  import { Button, Select } from 'bits-ui';
  import BitsTimeField from '$lib/components/BitsTimeField.svelte';
  export let data: PageData;
  export let form: ActionData;

  const DAYS = [
    { dow: 1, label: 'Monday' },
    { dow: 2, label: 'Tuesday' },
    { dow: 3, label: 'Wednesday' },
    { dow: 4, label: 'Thursday' },
    { dow: 5, label: 'Friday' },
    { dow: 6, label: 'Saturday' },
    { dow: 0, label: 'Sunday' },
  ];

  let selectedTech = data.techs[0]?.id ?? 0;
  $: if (!data.techs.find(t=>t.id===selectedTech)) selectedTech = data.techs[0]?.id ?? 0;

  $: templates = (data.templatesByTech[selectedTech] || []) as any[];

  const inpc = 'w-full bg-transparent py-0 text-[var(--t-17)] text-[var(--ink)] outline-none placeholder:text-[var(--dim)]';

  type DaySlot = { on: boolean; start: string; end: string };
  let daySlots: Record<number, DaySlot> = {};
  let initializedFor: number | null = null;

  function minToStr(m:number){ const h=Math.floor(m/60).toString().padStart(2,'0'); const mm=(m%60).toString().padStart(2,'0'); return `${h}:${mm}`; }
  function strToMin(s:string){ const [h,m]=s.split(':').map(Number); return h*60+m; }

  function initFromTemplates(){
    const next: Record<number, DaySlot> = {};
    for (const d of DAYS) next[d.dow] = { on: false, start: '09:00', end: '17:00' };
    const avail = templates.filter((t:any)=>(t.kind ?? 'available')==='available');
    // group by dow
    const byDow = new Map<number, any[]>();
    for (const t of avail) {
      if (!byDow.has(t.dow)) byDow.set(t.dow, []);
      byDow.get(t.dow)!.push(t);
    }
    for (const [dow, rows] of byDow) {
      const sMin = Math.min(...rows.map((r:any)=>r.start_min));
      const eMin = Math.max(...rows.map((r:any)=>r.end_min));
      next[dow] = { on: true, start: minToStr(sMin), end: minToStr(eMin) };
    }
    // if no avail at all, default Mon-Fri on
    if (!avail.length) {
      for (const dow of [1,2,3,4,5]) next[dow].on = true;
    }
    daySlots = next;
    initializedFor = selectedTech;
  }
  $: if (selectedTech && initializedFor!==selectedTech) initFromTemplates();
  $: if (initializedFor===null && templates) initFromTemplates();

  let saving=false;
  let saveErr='';
  let saveOk=false;

  async function saveHours(){
    saveErr=''; saveOk=false;
    const patterns: any[] = [];
    for (const d of DAYS) {
      const s = daySlots[d.dow];
      if (!s?.on) continue;
      const sm=strToMin(s.start); const em=strToMin(s.end);
      if (!s.start || !s.end || !Number.isFinite(sm) || !Number.isFinite(em) || em<=sm) { saveErr=`Invalid time on ${d.label}`; return; }
      if (em>1440 || sm<0) { saveErr=`Invalid time on ${d.label}`; return; }
      patterns.push({ dow: d.dow, start_min: sm, end_min: em, kind:'available' });
    }
    if (!patterns.length) { saveErr='Pick at least one day'; return; }
    saving=true;
    try{
      const fd=new FormData();
      fd.set('tech_id', String(selectedTech));
      fd.set('patterns', JSON.stringify(patterns));
      const res=await fetch('?/savePatterns', {method:'POST', body:fd});
      if (res.ok){ saveOk=true; setTimeout(()=>saveOk=false,1500); await invalidateAll(); initializedFor=null; }
      else {
        const txt=await res.text();
        try{
          const j=deserialize(txt);
          const err=(j as any)?.data?.error || (j as any)?.error;
          saveErr=err||'Failed to save';
        } catch { saveErr='Failed to save'; }
      }
    } finally { saving=false; }
  }



  $: availTechItems = data.techs.map(t=>({value:String(t.id), label:t.display_name}));
</script>

<svelte:head><title>Availability</title></svelte:head>

<div class="mt-8 mb-8 px-4">
  <h1 class="text-[28px] font-bold tracking-tight">Hours</h1>
</div>

{#if data.techs.length > 1}
  <div class="group">
    <div class="group-title">Technician</div>
    <div class="input-group">
      <label class="field">
        <span class="key">Technician</span>
        <Select.Root type="single" value={String(selectedTech)} onValueChange={(v)=>{ if(v!=null) { selectedTech=Number(v); initializedFor=null; } }} items={availTechItems}>
          <Select.Trigger class="{inpc} flex cursor-pointer items-center justify-between text-left data-[placeholder]:!text-[var(--dim)]" aria-label="Technician"><Select.Value placeholder="Technician" /><svg width="12" height="8" viewBox="0 0 12 8" fill="none" aria-hidden="true" class="ml-2 shrink-0 text-[var(--dim)]"><path d="M1 1.5L6 6.5L11 1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></Select.Trigger>
          <Select.Portal>
            <Select.Content class="z-[1000] min-w-[220px] w-[var(--bits-floating-anchor-width)] max-w-[92vw] rounded-[10px] border border-[var(--line)] bg-[var(--row)] p-1 text-[var(--ink)] shadow-xl" sideOffset={6}>
              <Select.Viewport>
                {#each data.techs as t}
                  <Select.Item value={String(t.id)} label={t.display_name} class="flex cursor-pointer items-center justify-between rounded-[8px] px-3 py-2 text-[15px] data-[state=checked]:bg-[var(--row2)] data-[highlighted]:bg-[var(--row2)]"><span>{t.display_name}</span></Select.Item>
                {/each}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>
      </label>
    </div>
  </div>
{/if}

<div class="group">
  <div class="group-title">Hours</div>
  <div class="input-group">
    {#each DAYS as d}
      {@const slot = daySlots[d.dow] ?? { on:false, start:'09:00', end:'17:00' }}
      <div class="field !py-3">
        <div class="flex items-center justify-between gap-3">
          <span class="text-[15px] font-medium text-[var(--ink)] w-[110px]">{d.label}</span>
          <div class="flex items-center gap-3">
            <span class="text-[13px] text-[var(--dim)] w-7 text-right">{slot.on?'On':'Off'}</span>
            <label class="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" class="sr-only peer" checked={slot.on} on:change={()=>{ daySlots[d.dow].on=!daySlots[d.dow].on; daySlots={...daySlots}; }} />
              <div class="w-9 h-[22px] rounded-full bg-[var(--line)] peer-checked:bg-[var(--blue)] transition"></div>
              <div class="absolute left-0.5 top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow peer-checked:translate-x-[14px] transition"></div>
            </label>
          </div>
        </div>
        {#if slot.on}
          <div class="mt-3 flex items-center gap-2">
            <BitsTimeField bind:value={daySlots[d.dow].start} ariaLabel="Start {d.label}" class="flex-1 min-w-0" />
            <span class="text-[var(--dim)] text-sm shrink-0">—</span>
            <BitsTimeField bind:value={daySlots[d.dow].end} ariaLabel="End {d.label}" class="flex-1 min-w-0" />
          </div>
        {/if}
      </div>
    {/each}
  </div>
  <div class="mt-3 flex items-center gap-3">
    <Button.Root class="filled !w-auto px-6 disabled:opacity-30" onclick={saveHours} disabled={saving}>{saving?'Saving…':'Save'}</Button.Root>
    {#if saveOk}<span class="text-[13px] text-[var(--green)]">Saved</span>{/if}
    {#if saveErr}<span class="text-[13px] text-[var(--red)]" role="alert">{saveErr}</span>{/if}
  </div>
</div>
