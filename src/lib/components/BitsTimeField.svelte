<script lang="ts">
  import { TimeField } from 'bits-ui';
  import { Time } from '@internationalized/date';

  let {
    value = $bindable('09:00'),
    ariaLabel = '',
    id = undefined as string | undefined,
    disabled = false,
    required = false,
    variant = 'default' as 'default' | 'ghost',
    class: klass = '',
    onChange = undefined as ((v: string) => void) | undefined
  }: {
    value?: string;
    ariaLabel?: string;
    id?: string;
    disabled?: boolean;
    required?: boolean;
    variant?: 'default' | 'ghost';
    class?: string;
    onChange?: (v: string) => void;
  } = $props();

  function parse(s: string): Time | undefined {
    if (!s || !s.includes(':')) return undefined;
    const [hs, ms] = s.split(':');
    const h = Number(hs);
    const m = Number(ms);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return undefined;
    if (h < 0 || h > 23 || m < 0 || m > 59) return undefined;
    return new Time(h, m);
  }

  function format(t: Time | undefined): string {
    if (!t) return '';
    return `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;
  }

  let internal: Time | undefined = $state(parse(value));

  $effect(() => {
    const p = parse(value);
    if (p && internal && p.hour === internal.hour && p.minute === internal.minute) return;
    if (!p && !internal) return;
    if (p?.hour !== internal?.hour || p?.minute !== internal?.minute) {
      internal = p;
    }
  });

  function handleValueChange(v: Time | undefined) {
    const s = format(v);
    if (s !== value) {
      value = s;
      onChange?.(s);
    }
  }

  let baseClass = $derived(
    variant === 'ghost'
      ? 'flex items-center justify-center gap-0.5 bg-transparent px-1 py-0 text-[var(--t-17)] text-[var(--ink)] outline-none'
      : 'flex items-center justify-center gap-0.5 rounded-[10px] border border-[var(--line)] bg-[var(--row)] px-2 py-2.5 text-[15px] font-semibold tracking-tight text-[var(--ink)] outline-none focus-within:border-[var(--blue)] focus-within:ring-2 focus-within:ring-[var(--blue)]/20'
  );
</script>

<TimeField.Root
  bind:value={internal}
  onValueChange={handleValueChange}
  hourCycle={12}
  granularity="minute"
  locale="en"
  {disabled}
  {required}
>
  <TimeField.Input
    {id}
    aria-label={ariaLabel}
    class={`${baseClass} ${klass}`}
  >
    {#snippet children({ segments })}
      {#each segments as { part, value: segValue }}
        {#if part === 'literal'}
          <span class="text-[var(--dim)] font-normal select-none">{segValue}</span>
        {:else}
          <TimeField.Segment
            {part}
            class="rounded-[4px] px-0.5 outline-none focus:bg-[var(--blue)] focus:text-white data-[invalid]:text-[var(--red)] min-w-[2ch] text-center"
          >
            {segValue}
          </TimeField.Segment>
        {/if}
      {/each}
    {/snippet}
  </TimeField.Input>
</TimeField.Root>

<style>
  :global([data-segment]) {
    caret-color: transparent;
  }
</style>
