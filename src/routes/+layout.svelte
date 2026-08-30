<script lang="ts">
  import '../app.css';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { dev } from '$app/environment';
  import { Button } from 'bits-ui';
  export let data: { user: { display_name: string; role: string; username: string } | null };
  $: user = data.user;
  $: route = $page.url.pathname;
  $: isActive = (prefix: string, exact = false) => exact ? route === prefix : route.startsWith(prefix);
  let theme: 'light' | 'dark' = 'dark';
  onMount(() => {
    const saved = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    theme = saved ?? (prefersLight ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme', theme);
    // Register the PWA service worker (production only — dev caching fights HMR).
    if (!dev && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  });
  function toggleTheme() {
    theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }
  async function logout() { await fetch('/logout', { method: 'POST' }); window.location.href = '/login'; }
</script>

{#if user}
  <div class="bar-wrap">
    <div class="bar">
      <h1>Schedule</h1>
      <nav class="desktop-nav">
        <a href="/" class:active={isActive('/', true)}>Today</a>
        <a href="/calendar" class:active={isActive('/calendar')}>Week</a>
        {#if user.role === 'sales' || user.role === 'admin'}<a href="/book" class:active={isActive('/book')}>Book</a>{/if}
        {#if user.role === 'tech' || user.role === 'admin'}<a href="/availability" class:active={isActive('/availability')}>Hours</a>{/if}
        {#if user.role === 'admin'}<a href="/admin" class:active={isActive('/admin')}>Admin</a>{/if}
        <a href="/map" class:active={isActive('/map')}>Map</a>
        <a href="/clients" class:active={isActive('/clients')}>Clients</a>
        <a href="/route" class:active={isActive('/route')}>Route</a>
        <a href="/income" class:active={isActive('/income')}>Income</a>
        <a href="/stats" class:active={isActive('/stats')}>Stats</a>
        <Button.Root class="bar-logout !flex !items-center !justify-center !p-1" onclick={toggleTheme} aria-label="Toggle theme" title="Toggle theme">
          {#if theme === 'dark'}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
          {:else}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          {/if}
        </Button.Root>
        <Button.Root class="bar-logout" onclick={logout} aria-label="Sign out">Sign out</Button.Root>
      </nav>
      <details class="more-menu"><summary>More</summary><div class="more-panel">
        <Button.Root onclick={toggleTheme} class="flex items-center gap-2" style="text-align:left">
          {#if theme === 'dark'}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg> Light mode
          {:else}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg> Dark mode
          {/if}
        </Button.Root>
        <a href="/income">Income</a><a href="/stats">Stats</a><a href="/map">Map</a><a href="/clients">Clients</a><a href="/route">Route</a>
        {#if user.role === 'admin'}<a href="/admin">Admin</a>{/if}
        <Button.Root class="bar-logout" onclick={logout}>Sign out</Button.Root>
      </div></details>
    </div>
  </div>
  <nav class="mobile-nav" aria-label="Primary navigation">
    <a href="/" class:active={isActive('/', true)}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 1.5"/></svg>
      <span>Today</span>
    </a>
    <a href="/calendar" class:active={isActive('/calendar')}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
      <span>Week</span>
    </a>
    {#if user.role === 'sales' || user.role === 'admin'}
      <a href="/book" class:active={isActive('/book')}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
        <span>Book</span>
      </a>
    {/if}
    {#if user.role === 'tech' || user.role === 'admin'}
      <a href="/availability" class:active={isActive('/availability')}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 12V8"/><path d="M12 12l2.5 2.5"/></svg>
        <span>Hours</span>
      </a>
    {/if}
    <a href="/stats" class:active={isActive('/stats')}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v18h18"/><path d="M7 16V9M12 16V5M17 16V12"/></svg>
      <span>Stats</span>
    </a>
    <a href="/route" class:active={isActive('/route')}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l3 3 3-3"/><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/><path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z"/></svg>
      <span>Route</span>
    </a>
  </nav>
{/if}
<main class="page"><slot /></main>
