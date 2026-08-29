<script lang="ts">
  import '../app.css';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
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
      <h1>Brinks Schedule</h1>
      <nav class="desktop-nav">
        <a href="/" class:active={isActive('/', true)}>Today</a>
        <a href="/calendar" class:active={isActive('/calendar')}>Week</a>
        {#if user.role === 'sales' || user.role === 'admin'}<a href="/book" class:active={isActive('/book')}>Book</a>{/if}
        {#if user.role === 'tech' || user.role === 'admin'}<a href="/availability" class:active={isActive('/availability')}>Hours</a>{/if}
        {#if user.role === 'admin'}<a href="/admin" class:active={isActive('/admin')}>Admin</a>{/if}
        <a href="/map" class:active={isActive('/map')}>Map</a>
        <a href="/income" class:active={isActive('/income')}>Income</a>
        <a href="/stats" class:active={isActive('/stats')}>Stats</a>
        <button class="bar-logout !flex !items-center !justify-center !p-1" on:click={toggleTheme} aria-label="Toggle theme" title="Toggle theme">
          {#if theme === 'dark'}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
          {:else}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          {/if}
        </button>
        <button class="bar-logout" on:click={logout} aria-label="Sign out">Sign out</button>
      </nav>
      <details class="more-menu"><summary>More</summary><div class="more-panel">
        <button on:click={toggleTheme} class="flex items-center gap-2" style="text-align:left">
          {#if theme === 'dark'}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg> Light mode
          {:else}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg> Dark mode
          {/if}
        </button>
        <a href="/income">Income</a><a href="/stats">Stats</a><a href="/map">Map</a>
        {#if user.role === 'admin'}<a href="/admin">Admin</a>{/if}
        <button class="bar-logout" on:click={logout}>Sign out</button>
      </div></details>
    </div>
  </div>
  <nav class="mobile-nav" aria-label="Primary navigation">
    <a href="/" class:active={isActive('/', true)}>Today</a><a href="/calendar" class:active={isActive('/calendar')}>Week</a>
    {#if user.role === 'sales' || user.role === 'admin'}<a href="/book" class:active={isActive('/book')}>Book</a>{/if}
    {#if user.role === 'tech' || user.role === 'admin'}<a href="/availability" class:active={isActive('/availability')}>Hours</a>{/if}
    <a href="/stats" class:active={isActive('/stats')}>Stats</a>
  </nav>
{/if}
<main class="page"><slot /></main>
