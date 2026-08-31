<script lang="ts">
  import type { Suggestion } from '$lib/server/geocode';
  import { Popover } from 'bits-ui';

  export let value = '';
  export let lat: number | null = null;
  export let lng: number | null = null;
  export let name = 'address';
  export let placeholder = 'Address';
  export let ariaLabel = 'Address';
  export let error: string | undefined = undefined;
  export let showKey = false;
  export let required = false;

  let open = false;
  let loading = false;
  let suggestions: Suggestion[] = [];
  let active = -1;
  let debounce: ReturnType<typeof setTimeout> | undefined;

  function onChange() {
    active = -1;
    clearTimeout(debounce);
    // Invalidate server-untrusted coords whenever address changes — preserves
    // invariant: lat/lng, if present, was derived from the current address.
    lat = null;
    lng = null;
    const q = value.trim();
    if (q.length < 3) {
      suggestions = [];
      open = false;
      return;
    }
    debounce = setTimeout(fetchSuggestions, 300);
  }

  async function fetchSuggestions() {
    loading = true;
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(value.trim())}&limit=5`);
      const out = await res.json();
      suggestions = out.suggestions ?? [];
      open = suggestions.length > 0;
    } catch {
      suggestions = [];
      open = false;
    } finally {
      loading = false;
    }
  }

  function choose(s: Suggestion) {
    value = s.label;
    lat = s.lat;
    lng = s.lng;
    open = false;
    active = -1;
  }

  function onKey(e: KeyboardEvent) {
    if (!open && e.key !== 'ArrowDown') return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      active = Math.min(active + 1, suggestions.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      active = Math.max(active - 1, 0);
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      choose(suggestions[active]);
    } else if (e.key === 'Escape') {
      open = false;
      active = -1;
    }
  }

  function handleOpenChange(v: boolean) {
    if (v && suggestions.length === 0 && !loading) return;
    open = v;
  }

  $: if (open && suggestions.length === 0 && !loading) open = false;
</script>

<label class="field">
  {#if showKey}<span class="key">Address <span class="req" aria-hidden="true">*</span></span>{/if}
  <Popover.Root open={open} onOpenChange={handleOpenChange}>
    <Popover.Trigger>
      {#snippet child({ props })}
        <input
          {...props}
          type="text"
          class="w-full bg-transparent py-0 text-left text-[var(--t-17)] text-[var(--ink)] outline-none placeholder:text-[var(--dim)]"
          {name}
          bind:value
          oninput={onChange}
          onkeydown={onKey}
          onfocus={() => suggestions.length && (open = true)}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls="addr-listbox"
          aria-activedescendant={active >= 0 ? `addr-opt-${active}` : undefined}
          role="combobox"
          {placeholder}
          aria-label={ariaLabel}
          required={required}
          aria-required={required ? 'true' : undefined}
          aria-invalid={error ? 'true' : undefined}
          autocomplete="off"
          style:border-color={error ? 'var(--red)' : undefined}
        />
      {/snippet}
    </Popover.Trigger>
    {#if suggestions.length > 0 || loading}
    <Popover.Portal>
      <Popover.Content
        trapFocus={false}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        class="z-[1000] w-[var(--bits-floating-anchor-width)] min-w-[280px] max-w-[92vw] max-h-[min(45vh,340px)] overflow-y-auto overscroll-contain rounded-[10px] border border-[var(--line)] bg-[var(--row)] p-1 shadow-xl shadow-black/25"
        sideOffset={6}
        side="bottom"
        align="start"
        avoidCollisions={true}
        collisionPadding={8}
      >
        {#if loading}<span class="block px-3 py-2.5 text-[13px] text-[var(--dim)]">Searching…</span>{/if}
        {#each suggestions as s, i}
          <button type="button" role="option" aria-selected={i === active} id="addr-opt-{i}" class="block w-full cursor-pointer rounded-[8px] px-3 py-2.5 text-left text-[14px] leading-snug text-[var(--ink)] hover:bg-[var(--row2)] {i === active ? 'bg-[var(--row2)]' : ''}" onmousedown={(e) => e.preventDefault()} onclick={() => choose(s)} onmouseenter={() => (active = i)}>{s.label}</button>
        {/each}
      </Popover.Content>
    </Popover.Portal>
    {/if}
  </Popover.Root>
  {#if error}<span class="px-1 pt-1 text-[13px] leading-tight text-[var(--red)]">{error}</span>{/if}
</label>
