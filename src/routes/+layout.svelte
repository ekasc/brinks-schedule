<script lang="ts">
  import '../app.css';
  import { page } from '$app/stores';

  export let data: { user: { display_name: string; role: string; username: string } | null };

  $: user = data.user;
  $: route = $page.url.pathname;
  $: isActive = (prefix: string, exact = false) => exact ? route === prefix : route.startsWith(prefix);

  async function logout() {
    await fetch('/logout', { method: 'POST' });
    // hard reload so the layout's `user` re-loads as null and the bar disappears
    window.location.href = '/login';
  }
</script>

{#if user}
  <div class="bar-wrap">
    <div class="bar">
      <h1>Brinks Schedule</h1>
      <nav>
        <a href="/" class:active={isActive('/', true)}>Today</a>
        <a href="/calendar" class:active={isActive('/calendar')}>Week</a>
        {#if user.role === 'sales' || user.role === 'admin'}
          <a href="/book" class:active={isActive('/book')}>Book</a>
        {/if}
        {#if user.role === 'tech' || user.role === 'admin'}
          <a href="/availability" class:active={isActive('/availability')}>Hours</a>
        {/if}
        {#if user.role === 'admin'}
          <a href="/admin" class:active={isActive('/admin')}>Admin</a>
        {/if}
        <a href="/map" class:active={isActive('/map')}>Map</a>
        <button class="bar-logout" on:click={logout} aria-label="Sign out">Sign out</button>
      </nav>
    </div>
  </div>
{/if}

<main class="page">
  <slot />
</main>
