<script lang="ts">
  import '../app.css';
  import { page, navigating } from '$app/stores';
  import { onMount } from 'svelte';
  import { dev } from '$app/environment';
  import { Button, Popover } from 'bits-ui';
  export let data: { user: { id:number; display_name: string; role: string; username: string } | null; notificationUnread:number };
  $: user = data.user;
  $: route = $page.url.pathname;
  $: isActive = (prefix: string, exact = false) => exact ? route === prefix : route.startsWith(prefix);
  let theme: 'light' | 'dark' = 'dark';
  onMount(() => {
    const saved = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    theme = saved ?? (prefersLight ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme', theme);
    if (!dev && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  });
  function toggleTheme() {
    theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }
  async function logout() {
    if (loggingOut) return;
    loggingOut = true;
    try {
      await fetch('/logout', { method: 'POST' });
    } finally {
      window.location.href = '/login';
    }
  }
  let moreOpen = false;
  let loggingOut = false;
</script>

{#if $navigating}
  <div class="nav-progress" aria-hidden="true"><span></span></div>
{/if}
{#if user}
  <div class="bar-wrap">
    <div class="bar">
      <h1>Schedule</h1>
      <nav class="desktop-nav">
        {#if user.role === 'admin'}
          <a href="/clients" class:active={isActive('/clients')}>Clients</a>
          <a href="/admin" class:active={isActive('/admin')}>Admin</a>
        {:else if user.role === 'tech'}
          <a href="/" class:active={isActive('/', true)}>Today</a>
          <a href="/calendar" class:active={isActive('/calendar')}>Week</a>
          <a href="/availability" class:active={isActive('/availability')}>Hours</a>
          <a href="/map" class:active={isActive('/map')}>Map</a>
          <a href="/route" class:active={isActive('/route')}>Route</a>
        {:else}
          <a href="/" class:active={isActive('/', true)}>Today</a>
          <a href="/calendar" class:active={isActive('/calendar')}>Week</a>
          <a href="/book" class:active={isActive('/book')}>Book</a>
          <a href="/map" class:active={isActive('/map')}>Map</a>
          <a href="/clients" class:active={isActive('/clients')}>Clients</a>
          <a href="/route" class:active={isActive('/route')}>Route</a>
        {/if}
        <a href="/notifications" class="bar-logout !relative !flex !items-center !justify-center !p-1" aria-label="Notifications{data.notificationUnread ? `, ${data.notificationUnread} unread` : ''}" title="Notifications">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>
          {#if data.notificationUnread}<span class="absolute -right-1 -top-1 min-w-4 rounded-full bg-[var(--red)] px-1 text-center text-[10px] font-bold leading-4 text-white">{data.notificationUnread>99?'99+':data.notificationUnread}</span>{/if}
        </a>
        <Button.Root class="bar-logout !flex !items-center !justify-center !p-1" onclick={toggleTheme} aria-label="Toggle theme" title="Toggle theme">
          {#if theme === 'dark'}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
          {:else}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          {/if}
        </Button.Root>
        <Button.Root class="bar-logout" onclick={logout} aria-label="Sign out" disabled={loggingOut}>{loggingOut ? 'Signing out…' : 'Sign out'}</Button.Root>
      </nav>
      <div class="more-menu">
        <Popover.Root bind:open={moreOpen}>
          <Popover.Trigger>
            {#snippet child({ props })}
              <Button.Root {...props} class="flex items-center gap-1 text-[15px] font-medium text-[var(--blue)] hover:opacity-70" aria-label="More menu">
                More
                <svg width="12" height="8" viewBox="0 0 12 8" fill="none" aria-hidden="true" class="shrink-0 text-[var(--blue)] transition-transform" style="transform: rotate({moreOpen ? 180 : 0}deg)"><path d="M1 1.5L6 6.5L11 1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </Button.Root>
            {/snippet}
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content class="z-[60] w-64 rounded-[14px] border border-[var(--line)] bg-[var(--row)] p-1.5 shadow-xl shadow-black/20" side="bottom" align="end" sideOffset={8} collisionPadding={12}>
              <div class="flex flex-col gap-0.5">
                <a href="/notifications" onclick={() => moreOpen = false} class="flex min-h-11 items-center gap-3 rounded-[10px] px-3 py-2 text-[15px] font-medium text-[var(--ink)] hover:bg-[var(--row2)] active:bg-[var(--row2)]">
                  <span class="grid h-7 w-7 place-items-center rounded-full bg-[var(--row2)] text-[var(--dim)]"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg></span>
                  <span class="flex-1">Notifications</span>{#if data.notificationUnread}<span class="rounded-full bg-[var(--red)] px-2 py-0.5 text-xs font-semibold text-white">{data.notificationUnread}</span>{/if}
                </a>
                <div class="my-1 h-px bg-[var(--line-thin)]"></div>
                {#if user.role !== 'admin' && user.role !== 'tech'}
                  <a href="/map" onclick={() => moreOpen = false} class="flex min-h-11 items-center gap-3 rounded-[10px] px-3 py-2 text-[15px] font-medium text-[var(--ink)] hover:bg-[var(--row2)] active:bg-[var(--row2)]">
                    <span class="grid h-7 w-7 place-items-center rounded-full bg-[var(--row2)] text-[var(--dim)]"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s7-6 7-12a7 7 0 1 0-14 0c0 6 7 12 7 12z"/><circle cx="12" cy="10" r="3"/></svg></span>
                    Map
                  </a>
                  <a href="/clients" onclick={() => moreOpen = false} class="flex min-h-11 items-center gap-3 rounded-[10px] px-3 py-2 text-[15px] font-medium text-[var(--ink)] hover:bg-[var(--row2)] active:bg-[var(--row2)]">
                    <span class="grid h-7 w-7 place-items-center rounded-full bg-[var(--row2)] text-[var(--dim)]"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span>
                    Clients
                  </a>
                  <div class="my-1 h-px bg-[var(--line-thin)]"></div>
                {/if}
                <button type="button" onclick={() => { toggleTheme(); moreOpen = false; }} class="flex min-h-11 w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left text-[15px] font-medium text-[var(--ink)] hover:bg-[var(--row2)] active:bg-[var(--row2)]">
                  <span class="grid h-7 w-7 place-items-center rounded-full bg-[var(--row2)] text-[var(--dim)]">
                    {#if theme === 'dark'}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
                    {:else}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                    {/if}
                  </span>
                  {theme === 'dark' ? 'Light mode' : 'Dark mode'}
                </button>
                <div class="my-1 h-px bg-[var(--line-thin)]"></div>
                <button type="button" onclick={logout} disabled={loggingOut} class="flex min-h-11 w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left text-[15px] font-medium text-[var(--red)] hover:bg-[color-mix(in_srgb,var(--red)_8%,transparent)] active:bg-[color-mix(in_srgb,var(--red)_12%,transparent)] disabled:opacity-50">
                  <span class="grid h-7 w-7 place-items-center rounded-full bg-[color-mix(in_srgb,var(--red)_10%,transparent)] text-[var(--red)]"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></span>
                  {loggingOut ? 'Signing out…' : 'Sign out'}
                </button>
              </div>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
    </div>
  </div>
  <nav class="mobile-nav" aria-label="Primary navigation">
    {#if user.role === 'admin'}
      <a href="/clients" class:active={isActive('/clients')}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        <span>Clients</span>
      </a>
      <a href="/admin" class:active={isActive('/admin')}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg>
        <span>Admin</span>
      </a>
    {:else if user.role === 'tech'}
      <a href="/" class:active={isActive('/', true)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 1.5"/></svg>
        <span>Today</span>
      </a>
      <a href="/calendar" class:active={isActive('/calendar')}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
        <span>Week</span>
      </a>
      <a href="/availability" class:active={isActive('/availability')}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 12V8"/><path d="M12 12l2.5 2.5"/></svg>
        <span>Hours</span>
      </a>
      <a href="/map" class:active={isActive('/map')}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s7-6 7-12a7 7 0 1 0-14 0c0 6 7 12 7 12z"/><circle cx="12" cy="10" r="3"/></svg>
        <span>Map</span>
      </a>
      <a href="/route" class:active={isActive('/route')}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l3 3 3-3"/><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/><path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z"/></svg>
        <span>Route</span>
      </a>
    {:else}
      <a href="/" class:active={isActive('/', true)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 1.5"/></svg>
        <span>Today</span>
      </a>
      <a href="/calendar" class:active={isActive('/calendar')}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
        <span>Week</span>
      </a>
      <a href="/book" class:active={isActive('/book')}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
        <span>Book</span>
      </a>
      <a href="/route" class:active={isActive('/route')}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l3 3 3-3"/><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/><path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z"/></svg>
        <span>Route</span>
      </a>
    {/if}
  </nav>
{/if}
<main class="page" class:page-loading={$navigating != null} aria-busy={$navigating != null ? 'true' : undefined}><slot /></main>
