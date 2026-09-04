<script lang="ts">
  import { page } from '$app/stores';
  $: status = $page.status;
  $: heading = status === 404 ? 'Not found' : status === 403 ? 'Not allowed' : 'Something went wrong';
  $: detail =
    status === 404
      ? 'This job or page was deleted or never existed.'
      : 'Please try again — and tell Ekas if it keeps happening.';
</script>

<svelte:head><title>{status} · Schedule</title></svelte:head>

<div class="mt-8 mb-8 px-4">
  <h1 class="text-[28px] font-bold tracking-tight">{status} · {heading}</h1>
</div>

<div class="group">
  <div class="group-rows">
    <div class="px-4 py-5 text-center">
      <p class="text-[15px] text-[var(--dim)]">{detail}</p>
      <a href="/" class="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-[10px] bg-[var(--blue)] px-6 text-[15px] font-semibold text-white hover:bg-[var(--blue-press)]">Back to Today</a>
    </div>
  </div>
</div>
