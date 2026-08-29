<script lang="ts">
  import type { ActionData } from './$types';
  export let form: ActionData;
</script>

<svelte:head><title>Sign In</title></svelte:head>

<div class="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center gap-6 px-4">
  <div class="text-center text-4xl" aria-hidden="true">🔒</div>
  <h1>Brinks Schedule</h1>

  <form method="POST" class="flex flex-col gap-4">
    {#if form?.error}
      <div class="text-red-400" role="alert">{form.error}</div>
    {/if}
    <div class="flex flex-col gap-3">
      <div class="flex flex-col gap-1">
        <input name="username" placeholder="Username" autocomplete="username" autocapitalize="off" autocorrect="off" value={form?.username ?? ''} required aria-label="Username" />
      </div>
      <div class="flex flex-col gap-1">
        <input name="password" type="password" placeholder="Password" autocomplete="current-password" required aria-label="Password" />
      </div>
    </div>
    <button type="submit" class="appearance-none rounded-md border-0 bg-blue-600 px-4 py-2 text-white hover:bg-blue-500 disabled:cursor-default disabled:opacity-30">Sign In</button>
  </form>
</div>
