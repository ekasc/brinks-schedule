<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { invalidateAll } from '$app/navigation';
  import { deserialize } from '$app/forms';
  import { Button, Select, Dialog } from 'bits-ui';
  import { swipeSheet } from '$lib/actions/swipeSheet';
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
  $: unavailable = (data.unavailableByTech[selectedTech] || []) as any[];

  const inpc = 'w-full bg-transparent py-0 text-[var(--t-17)] text-[var(--ink)] outline-none placeholder:text-[var(--dim)]';

  // editable pattern state
  type Interval = { start: string; end: string; kind: 'available'|'unavailable' };
  let patternMap: Record<number, Interval[]> = {};
  let draftMap: Record<number, Interval> = {};
  let enabledMap: Record<number, boolean> = {};
  let initializedFor: number | null = null;

  function minToStr(m:number){ const h=Math.floor(m/60).toString().padStart(2,'0'); const mm=(m%60).toString().padStart(2,'0'); return `${h}:${mm}`; }
  function strToMin(s:string){ const [h,m]=s.split(':').map(Number); return h*60+m; }

  function defaultDraft(dow:number): Interval {
    const arr = patternMap[dow] || [];
    const lastKind = arr.length ? arr[arr.length-1].kind : 'unavailable';
    return { start: '00:00', end: '01:00', kind: lastKind==='available' ? 'unavailable' : 'available' };
  }

  function initFromTemplates(){
    const map: Record<number, Interval[]> = {};
    const en: Record<number, boolean> = {};
    const drafts: Record<number, Interval> = {};
    for (const d of DAYS) { map[d.dow]=[]; en[d.dow]=false; drafts[d.dow]={start:'00:00', end:'01:00', kind:'unavailable'}; }
    for (const t of templates) {
      if (!map[t.dow]) map[t.dow]=[];
      map[t.dow].push({ start: minToStr(t.start_min), end: minToStr(t.end_min), kind: (t.kind==='unavailable'?'unavailable':'available') });
    }
    for (const d of DAYS) {
      if (map[d.dow].length) { en[d.dow]=true; drafts[d.dow]=defaultDraft(d.dow); }
    }
    patternMap = map;
    enabledMap = en;
    draftMap = drafts;
    initializedFor = selectedTech;
  }
  $: if (selectedTech && initializedFor!==selectedTech) initFromTemplates();
  // also re-init when templates change after save
  $: if (templates) { /* trigger */ }
  // ensure we init on first load
  $: if (initializedFor===null && templates) initFromTemplates();

  let saving=false;
  let saveErr='';
  let saveOk=false;

  async function savePatterns(){
    saveErr=''; saveOk=false; saving=true;
    try{
      const patterns:any[]=[];
      for (const d of DAYS){
        const intervals = patternMap[d.dow]||[];
        for (const iv of intervals){
          const sm=strToMin(iv.start); const em=strToMin(iv.end);
          if (!iv.start || !iv.end || em<=sm) { saveErr=`Invalid time on ${d.label}`; saving=false; return; }
          if (iv.kind!=='available' && iv.kind!=='unavailable') { saveErr=`Invalid kind on ${d.label}`; saving=false; return; }
          patterns.push({ dow:d.dow, start_min:sm, end_min:em, kind: iv.kind });
        }
      }
      const byDowAndKind: Record<string, {start:number; end:number}[]> = {};
      for (const p of patterns) {
        const key = `${p.dow}:${p.kind}`;
        (byDowAndKind[key] ??= []).push({start:p.start_min,end:p.end_min});
      }
      for (const key in byDowAndKind) {
        const arr = byDowAndKind[key].sort((a,b)=>a.start-b.start);
        const dow = Number(key.split(':')[0]);
        for(let i=1;i<arr.length;i++) if(arr[i].start < arr[i-1].end) { saveErr=`Overlapping intervals on ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dow]}`; saving=false; return; }
      }
      const fd=new FormData();
      fd.set('tech_id', String(selectedTech));
      fd.set('patterns', JSON.stringify(patterns));
      const res=await fetch('?/savePatterns', {method:'POST', body:fd});
      if (res.ok){ saveOk=true; setTimeout(()=>saveOk=false,1500); await invalidateAll(); }
      else { const j=await res.json().catch(()=>null); saveErr=j?.error||'Failed to save'; }
    } finally { saving=false; }
  }

  function toggleDay(dow:number, on:boolean){
    enabledMap[dow]=on;
    enabledMap={...enabledMap};
    if(on){
      if(!draftMap[dow]) draftMap[dow]={start:'00:00', end:'01:00', kind:'unavailable'};
      draftMap={...draftMap};
    } else {
      patternMap[dow]=[];
      patternMap={...patternMap};
    }
  }
  function addDraft(dow:number){
    const d = draftMap[dow] || {start:'09:00', end:'17:00', kind:'available'};
    if(!d.start || !d.end) return;
    const sm=strToMin(d.start); const em=strToMin(d.end);
    if(em<=sm) return;
    const arr=patternMap[dow]||[];
    arr.push({start:d.start, end:d.end, kind:d.kind});
    patternMap[dow]=arr; patternMap={...patternMap};
    // reset draft to opposite kind and next time
    const nextKind = d.kind==='available' ? 'unavailable' : 'available';
    const [h,m]=d.end.split(':').map(Number);
    const endMin = Math.min(24*60, h*60+m+60);
    const nextEnd = `${String(Math.floor(endMin/60)).padStart(2,'0')}:${String(endMin%60).padStart(2,'0')}`;
    draftMap[dow]={start:d.end, end: nextEnd, kind: nextKind};
    draftMap={...draftMap};
  }
  function addInterval(dow:number){ addDraft(dow); }
  function addIntervalAfter(dow:number, idx:number){
    const arr=patternMap[dow]||[];
    const prevKind = arr[idx]?.kind || 'available';
    const nextKind = prevKind==='available' ? 'unavailable' : 'available';
    const nextStart = arr[idx]?.end || '09:00';
    const [h,m]=nextStart.split(':').map(Number);
    const endMin = Math.min(24*60, h*60+m+60);
    const endStr = `${String(Math.floor(endMin/60)).padStart(2,'0')}:${String(endMin%60).padStart(2,'0')}`;
    arr.splice(idx+1, 0, {start: nextStart, end: endStr, kind: nextKind});
    patternMap[dow]=arr; patternMap={...patternMap};
  }
  function removeInterval(dow:number, idx:number){
    patternMap[dow].splice(idx,1);
    patternMap={...patternMap};
  }
  function presetDay(dow:number, preset:'9-5'|'off'){
    if(preset==='off'){ patternMap[dow]=[]; enabledMap[dow]=false; }
    else { patternMap[dow]=[{start:'09:00', end:'17:00', kind:'available'}]; enabledMap[dow]=true; if(!draftMap[dow]) draftMap[dow]={start:'09:00', end:'17:00', kind:'unavailable'}; }
    patternMap={...patternMap}; enabledMap={...enabledMap}; draftMap={...draftMap};
  }
  function copyToWeekdays(){
    const mon = patternMap[1]||[];
    const monEn = !!enabledMap[1];
    for(const d of [2,3,4,5]) { patternMap[d]=mon.map(x=>({...x})); enabledMap[d]=monEn; if(monEn && !draftMap[d]) draftMap[d]={start:'09:00', end:'17:00', kind: mon.length ? (mon[mon.length-1].kind==='available' ? 'unavailable' : 'available') : 'available'}; }
    patternMap={...patternMap}; enabledMap={...enabledMap}; draftMap={...draftMap};
  }

  // unavailable dialog
  let blockOpen=false;
  let blockDate=new Date().toISOString().slice(0,10);
  let blockStart='09:00';
  let blockEnd='17:00';
  let blockReason='';
  let blockBusy=false;
  let blockErr='';
  let blockWarning='';
  let blockConflicts: { id:number; client_name:string; starts_at:number; ends_at:number }[]=[];

  function clearBlockWarning(){ blockWarning=''; blockConflicts=[]; }

  async function addBlock(e:Event, force=false){
    e.preventDefault();
    blockBusy=true; blockErr='';
    try{
      const fd=new FormData();
      fd.set('tech_id', String(selectedTech));
      fd.set('date', blockDate);
      fd.set('start', blockStart);
      fd.set('end', blockEnd);
      fd.set('reason', blockReason);
      if(force) fd.set('force', 'true');
      const res=await fetch('?/addUnavailable', {method:'POST', headers:{'x-sveltekit-action':'true'}, body:fd});
      const result = deserialize(await res.text());
      if(result.type === 'success'){ blockReason=''; clearBlockWarning(); blockOpen=false; await invalidateAll(); }
      else {
        const response = result.type === 'failure' ? result.data as { error?:string; warning?:string; conflicts?:typeof blockConflicts } : undefined;
        if(response?.warning){ blockWarning=response.warning; blockConflicts=response.conflicts ?? []; }
        else blockErr=response?.error || 'Failed to add';
      }
    } finally { blockBusy=false; }
  }
  async function removeBlock(id:number){
    if(!confirm('Remove this blocked time?')) return;
    const fd=new FormData(); fd.set('id', String(id)); fd.set('tech_id', String(selectedTech));
    await fetch('?/removeUnavailable', {method:'POST', body:fd});
    await invalidateAll();
  }

  function fmt(ts:number){ return new Date(ts*1000).toLocaleString(undefined,{weekday:'short', month:'short', day:'numeric', hour:'numeric', minute:'2-digit'}); }
  function fmtTime(ts:number){ return new Date(ts*1000).toLocaleTimeString(undefined,{hour:'numeric', minute:'2-digit'}); }
  function fmtDay(ts:number){ return new Date(ts*1000).toLocaleDateString(undefined,{weekday:'short', month:'short', day:'numeric'}); }
  function fmtClock(s:string){ try{ const [h,m]=s.split(':').map(Number); const d=new Date(); d.setHours(h,m,0,0); return d.toLocaleTimeString(undefined,{hour:'numeric', minute:'2-digit'}); } catch{ return s; } }

  $: availTechItems = data.techs.map(t=>({value:String(t.id), label:t.display_name}));
  $: today = new Date().toISOString().slice(0,10);
</script>

<svelte:head><title>Availability</title></svelte:head>

<div class="mt-8 mb-8 px-4">
  <h1 class="text-[28px] font-bold tracking-tight">Hours</h1>
  <p class="mt-1 text-[15px] leading-snug text-[var(--dim)]">Set your weekly pattern. Sales books inside these hours. Use time off to block hours ad hoc.</p>
</div>

{#if data.techs.length > 1}
  <div class="group">
    <div class="group-title">Technician</div>
    <div class="input-group">
      <label class="field">
        <span class="key">Technician</span>
        <Select.Root type="single" value={String(selectedTech)} onValueChange={(v)=>{ if(v!=null) selectedTech=Number(v); initializedFor=null; }} items={availTechItems}>
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
  <div class="flex items-center justify-between gap-3">
    <div class="group-title !mb-0 !pb-0">Weekly pattern</div>
    <button class="text-[13px] font-medium text-[var(--blue)] hover:underline" on:click={copyToWeekdays}>Copy Mon to weekdays</button>
  </div>
  <div class="input-group mt-3">
    {#each DAYS as d}
      {@const intervals = patternMap[d.dow] || []}
      {@const isOn = !!enabledMap[d.dow]}
      <div class="field !py-3">
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <span class="text-[15px] font-semibold text-[var(--ink)] w-[110px]">{d.label}</span>
            <label class="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" class="sr-only peer" checked={isOn} on:change={(e)=>toggleDay(d.dow, e.currentTarget.checked)} />
              <div class="w-9 h-[22px] rounded-full bg-[var(--line)] peer-checked:bg-[var(--blue)] transition"></div>
              <div class="absolute left-0.5 top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow peer-checked:translate-x-[14px] transition"></div>
            </label>
            <span class="text-[13px] text-[var(--dim)]">{isOn?'On':'Off'}</span>
          </div>
          <div class="flex gap-1">
            <button class="rounded-full border border-[var(--line)] bg-[var(--row)] px-2.5 py-1 text-xs font-medium text-[var(--ink)] hover:bg-[var(--row2)]" on:click={()=>presetDay(d.dow,'9-5')}>9–5</button>
            <button class="rounded-full border border-[var(--line)] bg-[var(--row)] px-2.5 py-1 text-xs font-medium text-[var(--ink)] hover:bg-[var(--row2)]" on:click={()=>presetDay(d.dow,'off')}>Off</button>
          </div>
        </div>
        {#if isOn}
          {#if intervals.length}
            <div class="mt-3 rounded-[10px] border border-[var(--line)] bg-[var(--row)] overflow-hidden divide-y divide-[var(--line-thin)]">
              {#each intervals as iv, idx}
                <div class="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-[15px] font-medium text-[var(--ink)] whitespace-nowrap">{fmtClock(iv.start)} — {fmtClock(iv.end)}</span>
                    <span class="shrink-0 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold leading-none tracking-wide border {iv.kind==='available' ? 'bg-[color-mix(in_srgb,var(--green)_14%,transparent)] text-[var(--green)] border-[color-mix(in_srgb,var(--green)_22%,transparent)]' : 'bg-[color-mix(in_srgb,var(--red)_12%,transparent)] text-[var(--red)] border-[color-mix(in_srgb,var(--red)_18%,transparent)]'}">{iv.kind==='available' ? 'Available' : 'Unavailable'}</span>
                  </div>
                  <div class="flex items-center gap-1.5 self-end sm:shrink-0 sm:self-auto">
                    <button class="shrink-0 rounded-full bg-transparent px-2.5 py-1 text-xs font-medium text-[var(--dim)] hover:text-[var(--red)]" on:click={()=>removeInterval(d.dow, idx)} aria-label="Remove {d.label} {idx}">Remove</button>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
          {@const draft = draftMap[d.dow] || {start:'09:00', end:'17:00', kind:'available'}}
          <div class="mt-3 rounded-[10px] border border-dashed border-[var(--line)] bg-[var(--row2)]/30 p-3 flex flex-col gap-2">
            <div class="text-[13px] font-medium text-[var(--dim)]">New timeframe</div>
            <div class="flex items-center gap-2">
              <input type="time" class="flex-1 min-w-0 rounded-[8px] border border-[var(--line)] bg-[var(--row)] px-2 py-2 text-[15px] text-[var(--ink)] outline-none text-center" bind:value={draft.start} aria-label="Draft start {d.label}" />
              <span class="text-[var(--dim)] text-sm shrink-0">to</span>
              <input type="time" class="flex-1 min-w-0 rounded-[8px] border border-[var(--line)] bg-[var(--row)] px-2 py-2 text-[15px] text-[var(--ink)] outline-none text-center" bind:value={draft.end} aria-label="Draft end {d.label}" />
            </div>
            <div class="flex items-center gap-1.5">
              <button class="shrink-0 inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold leading-none tracking-wide border {draft.kind==='available' ? 'bg-[var(--green)] text-white border-[var(--green)]' : 'bg-transparent text-[var(--dim)] border-[var(--line)]'}" on:click={()=>{ draft.kind='available'; draftMap[d.dow]=draft; draftMap={...draftMap}; }}>Available</button>
              <button class="shrink-0 inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold leading-none tracking-wide border {draft.kind==='unavailable' ? 'bg-[var(--red)] text-white border-[var(--red)]' : 'bg-transparent text-[var(--dim)] border-[var(--line)]'}" on:click={()=>{ draft.kind='unavailable'; draftMap[d.dow]=draft; draftMap={...draftMap}; }}>Unavailable</button>
              <span class="flex-1"></span>
              <button class="shrink-0 rounded-full bg-[var(--blue)] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[var(--blue-press)]" on:click={()=>addDraft(d.dow)}>+ Add</button>
            </div>
          </div>
        {/if}
      </div>
    {/each}
  </div>
  <div class="mt-3 px-4 flex items-center gap-3">
    <Button.Root class="filled !w-auto px-6 disabled:opacity-30" onclick={savePatterns} disabled={saving}>{saving?'Saving…':'Save pattern'}</Button.Root>
    {#if saveOk}<span class="text-[13px] text-[var(--green)]">Saved</span>{/if}
    {#if saveErr}<span class="text-[13px] text-[var(--red)]" role="alert">{saveErr}</span>{/if}
  </div>
</div>

<div class="group group--loose">
  <div class="flex items-center justify-between">
    <div class="group-title !mb-0 !pb-0">Time off / Blocked hours · {unavailable.length}</div>
    <Dialog.Root bind:open={blockOpen}>
      <Dialog.Trigger>
        {#snippet child({props})}
          <Button.Root {...props} class="filled !w-auto px-4 py-2 text-[13px]">+ Block time</Button.Root>
        {/snippet}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay class="block-overlay fixed inset-0 z-[1000] bg-black/40 backdrop-blur-sm" />
        <Dialog.Content class="block-content fixed z-[1001] flex max-h-[85vh] flex-col overflow-hidden border border-[var(--line)] bg-[color-mix(in_srgb,var(--bg)_85%,transparent)] shadow-2xl backdrop-blur-[20px]" style="backdrop-filter: blur(20px) saturate(180%);">
          <div use:swipeSheet={{ onClose: ()=> blockOpen=false }} class="flex flex-col flex-1 min-h-0">
            <div data-sheet-handle class="mx-auto flex justify-center py-3 -my-1 md:hidden" aria-hidden="true" style="touch-action:none;"><div class="h-1.5 w-10 rounded-full bg-[var(--line)]"></div></div>
            <div class="flex items-center justify-between gap-4 border-b border-[var(--line-thin)] px-5 py-4">
              <h2 class="text-[17px] font-semibold text-[var(--ink)]">Block time</h2>
              <Button.Root class="grid h-8 w-8 place-items-center rounded-full bg-[var(--row)] border border-[var(--line)] text-[var(--dim)]" onclick={()=>blockOpen=false} aria-label="Close">✕</Button.Root>
            </div>
            <form on:submit={addBlock} class="overflow-y-auto p-5 flex flex-col gap-3" style="padding-bottom: max(20px, env(safe-area-inset-bottom));">
              <div class="input-group">
                <label class="field">
                  <span class="key">Date *</span>
                  <input class={inpc} type="date" bind:value={blockDate} on:input={clearBlockWarning} required aria-label="Date" />
                </label>
                <div class="field">
                  <span class="key">Time *</span>
                  <div class="flex items-center gap-3 pt-1">
                    <input class="flex-1 min-w-0 bg-transparent text-[var(--t-17)] text-[var(--ink)] outline-none" type="time" bind:value={blockStart} on:input={clearBlockWarning} required aria-label="Start" />
                    <span class="text-[var(--dim)] text-[15px]">to</span>
                    <input class="flex-1 min-w-0 bg-transparent text-[var(--t-17)] text-[var(--ink)] outline-none" type="time" bind:value={blockEnd} on:input={clearBlockWarning} required aria-label="End" />
                  </div>
                </div>
                <label class="field">
                  <span class="key">Reason</span>
                  <input class={inpc} type="text" bind:value={blockReason} placeholder="Reason (optional)" aria-label="Reason" />
                </label>
              </div>
              {#if blockErr}<div class="text-[13px] text-[var(--red)]">{blockErr}</div>{/if}
              {#if blockWarning}
                <div class="rounded-[10px] border border-[color-mix(in_srgb,var(--orange)_35%,var(--line))] bg-[color-mix(in_srgb,var(--orange)_10%,var(--row))] px-3.5 py-3" role="alert">
                  <div class="text-[14px] font-semibold text-[var(--ink)]">{blockWarning}</div>
                  {#each blockConflicts as job}
                    <div class="mt-1 text-[13px] text-[var(--dim)]">{job.client_name}, {fmtTime(job.starts_at)} to {fmtTime(job.ends_at)}</div>
                  {/each}
                  <div class="mt-2 text-[13px] text-[var(--dim)]">The booking will remain scheduled.</div>
                </div>
              {/if}
              <div class="flex gap-2">
                <Button.Root type="button" class="flex-1 rounded-[10px] border border-[var(--line)] bg-[var(--row)] px-4 py-2.5 text-[15px] font-medium text-[var(--ink)]" onclick={()=>blockOpen=false}>Cancel</Button.Root>
                <Button.Root type="submit" class="flex-1 rounded-[10px] bg-[var(--blue)] px-4 py-2.5 text-[15px] font-semibold text-white" disabled={blockBusy} onclick={(e)=>blockWarning && addBlock(e, true)}>{blockBusy?'Blocking…':blockWarning?'Block anyway':'Block time'}</Button.Root>
              </div>
            </form>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </div>
  {#if unavailable.length===0}
    <div class="group-rows mt-3">
      <div class="empty">No blocked time.</div>
    </div>
  {:else}
    <div class="group-rows divide-y divide-[var(--line-thin)] mt-3">
      {#each unavailable as u (u.id)}
        <div class="flex items-center gap-3 px-4 py-3.5">
          <div class="min-w-0 flex-1">
            <div class="text-[15px] font-semibold text-[var(--ink)]">{fmtDay(u.starts_at)}</div>
            <div class="text-[15px] text-[var(--ink)]">{fmtTime(u.starts_at)} – {fmtTime(u.ends_at)}</div>
            {#if u.reason}<div class="text-[13px] text-[var(--dim)]">{u.reason}</div>{/if}
          </div>
          <Button.Root class="shrink-0 rounded-full bg-[color-mix(in_srgb,var(--red)_12%,transparent)] px-3.5 py-2 text-[13px] font-medium text-[var(--red)] border border-[color-mix(in_srgb,var(--red)_18%,transparent)]" onclick={()=>removeBlock(u.id)}>Remove</Button.Root>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  :global(.block-content){ left:50%; top:50%; transform: translate(-50%,-50%); width:min(95vw,520px); max-height:85vh; border-radius:16px; }
  :global(.block-overlay[data-state="open"]){ animation: oi 240ms cubic-bezier(0.32,0.72,0,1); }
  :global(.block-content[data-state="open"]){ animation: di 400ms cubic-bezier(0.32,0.72,0,1); }
  @keyframes oi{from{opacity:0}to{opacity:1}} @keyframes di{from{opacity:0; transform: translate(-50%,-46%) scale(0.96)}to{opacity:1; transform: translate(-50%,-50%) scale(1)}}
  @media(max-width:640px){
    :global(.block-content){ left:0; right:0; top:auto; bottom:0; transform:none; width:100%; max-width:none; border-radius:20px 20px 0 0; border-bottom:none; }
    :global(.block-content[data-state="open"]){ animation: si 420ms cubic-bezier(0.32,0.72,0,1); }
    @keyframes si{from{opacity:0; transform: translateY(100%)}to{opacity:1; transform: translateY(0)}}
  }
</style>
