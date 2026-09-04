<script lang="ts">
  import { enhance } from '$app/forms';
  import type { ActionData } from './$types';
  import { Button } from 'bits-ui';
  export let form: ActionData;

  let signingIn = false;

  const inpc = 'w-full bg-transparent py-0 text-[var(--t-17)] text-[var(--ink)] outline-none placeholder:text-[var(--dim)]';
</script>

<svelte:head><title>Sign In</title></svelte:head>

<div class="mx-auto flex min-h-[75vh] max-w-[400px] flex-col justify-center gap-6 px-4 py-10">
  <div class="text-center">
    <div class="mx-auto grid h-14 w-14 place-items-center rounded-[16px] bg-[var(--row)] border border-[var(--line)] text-[var(--blue)] shadow-sm" aria-hidden="true">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><circle cx="12" cy="16" r="1.2"/></svg>
    </div>
    <h1 class="mt-4 text-[28px] font-bold tracking-tight leading-none">Schedule</h1>
    <p class="mt-1.5 text-[15px] text-[var(--dim)]">Sign in to continue</p>
  </div>

  <form method="POST" class="flex flex-col gap-4" use:enhance={() => {
    signingIn = true;
    return async ({ update }) => {
      signingIn = false;
      await update();
    };
  }}>
    {#if form?.error}
      <div class="rounded-[10px] border border-[color-mix(in_srgb,var(--red)_18%,transparent)] bg-[color-mix(in_srgb,var(--red)_10%,transparent)] px-4 py-3 text-[15px] leading-snug text-[var(--red)]" role="alert">{form.error}</div>
    {/if}
    <div class="input-group">
      <label class="field">
        <span class="key">Username</span>
        <input class={inpc} id="username" name="username" placeholder="username" autocomplete="username" autocapitalize="off" autocorrect="off" value={form?.username ?? ''} required aria-label="Username" />
      </label>
      <label class="field">
        <span class="key">Password</span>
        <input class={inpc} id="password" name="password" type="password" placeholder="••••••••" autocomplete="current-password" required aria-label="Password" />
      </label>
    </div>
    <Button.Root type="submit" class="filled" disabled={signingIn}>{signingIn ? 'Signing in…' : 'Sign In'}</Button.Root>
  </form>
</div>
