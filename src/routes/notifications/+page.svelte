<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { onMount } from 'svelte';
  import type { PageData } from './$types';

  export let data: PageData;

  let notificationBusy = false;
  let listMessage = '';
  let pushBusy = false;
  let pushEnabled = false;
  let pushSupported = true;
  let pushMessage = '';
  let registration: ServiceWorkerRegistration | null = null;

  const dateFormatter = new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  });

  function formatTime(timestamp: number) {
    const date = new Date(timestamp * 1000);
    const seconds = Math.round((date.getTime() - Date.now()) / 1000);
    const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
    if (Math.abs(seconds) < 60) return relative.format(seconds, 'second');
    const minutes = Math.round(seconds / 60);
    if (Math.abs(minutes) < 60) return relative.format(minutes, 'minute');
    const hours = Math.round(minutes / 60);
    if (Math.abs(hours) < 24) return relative.format(hours, 'hour');
    const days = Math.round(hours / 24);
    if (Math.abs(days) < 7) return relative.format(days, 'day');
    return dateFormatter.format(date);
  }

  function applicationServerKey(value: string) {
    const padding = '='.repeat((4 - value.length % 4) % 4);
    const decoded = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  }

  onMount(async () => {
    pushSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    if (!pushSupported) {
      pushMessage = 'Push notifications are not supported on this device.';
      return;
    }
    try {
      registration = await navigator.serviceWorker.register('/sw.js');
      pushEnabled = Boolean(await registration.pushManager.getSubscription());
      if (Notification.permission === 'denied') pushMessage = 'Push notifications are blocked in browser settings.';
    } catch {
      pushSupported = false;
      pushMessage = 'Push notifications are unavailable.';
    }
  });

  async function post(url: string, body?: object) {
    const response = await fetch(url, {
      method: 'POST',
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    if (!response.ok) throw new Error('Request failed');
    return response;
  }

  async function markRead(id: number) {
    notificationBusy = true;
    listMessage = '';
    try {
      await post(`/api/notifications/${id}/read`);
      await invalidateAll();
    } catch {
      // Surface failure — the old silent swallow made taps feel dead on flaky networks.
      listMessage = 'Could not mark as read. Try again.';
    } finally {
      notificationBusy = false;
    }
  }

  // Fire-and-forget read on open: the destination page's layout load refetches
  // the unread count, so no invalidate needed here. keepalive survives the nav.
  function markReadQuiet(id: number) {
    fetch(`/api/notifications/${id}/read`, { method: 'POST', keepalive: true }).catch(() => {});
  }

  async function markAllRead() {
    notificationBusy = true;
    listMessage = '';
    try {
      await post('/api/notifications/read-all');
      await invalidateAll();
    } catch {
      listMessage = 'Could not mark all as read. Try again.';
    } finally {
      notificationBusy = false;
    }
  }

  async function enablePush() {
    if (!registration || !data.vapidPublicKey) {
      pushMessage = 'Push notifications are not configured.';
      return;
    }
    pushBusy = true;
    pushMessage = '';
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        pushMessage = permission === 'denied'
          ? 'Push notifications are blocked in browser settings.'
          : 'Push notification permission was not granted.';
        return;
      }
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(data.vapidPublicKey)
      });
      await post('/api/notifications/push/subscribe', subscription.toJSON());
      pushEnabled = true;
      pushMessage = 'Push notifications enabled.';
    } catch {
      pushMessage = 'Could not enable push notifications. Try again.';
    } finally {
      pushBusy = false;
    }
  }

  async function disablePush() {
    if (!registration) return;
    pushBusy = true;
    pushMessage = '';
    try {
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await post('/api/notifications/push/unsubscribe', { endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }
      pushEnabled = false;
      pushMessage = 'Push notifications disabled.';
    } catch {
      pushMessage = 'Could not disable push notifications. Try again.';
    } finally {
      pushBusy = false;
    }
  }
</script>

<svelte:head><title>Notifications</title></svelte:head>

<div class="large-title inline page-title">
  <h1>Notifications</h1>
  {#if data.unread > 0}
    <button on:click={markAllRead} disabled={notificationBusy}>Mark all read</button>
  {/if}
</div>

<section class="group group--tight" aria-labelledby="push-heading">
  <div class="group-title" id="push-heading">Push notifications</div>
  <div class="group-rows">
    <div class="row-line push-row">
      <span class="label">
        {pushEnabled ? 'Enabled' : 'Get alerts on this device'}
        {#if pushMessage}<span class="status" aria-live="polite">{pushMessage}</span>{/if}
      </span>
      <button
        on:click={pushEnabled ? disablePush : enablePush}
        disabled={pushBusy || !pushSupported || (!pushEnabled && !data.vapidPublicKey)}
      >{pushBusy ? 'Working…' : pushEnabled ? 'Disable' : 'Enable'}</button>
    </div>
  </div>
</section>

<section class="group" aria-labelledby="notification-list-heading">
  <div class="group-title" id="notification-list-heading">
    {data.unread > 0 ? `${data.unread} unread` : 'Recent'}
  </div>
  {#if listMessage}<p class="mx-4 mt-1 text-[13px] text-[var(--red)]" role="alert">{listMessage}</p>{/if}
  {#if data.notifications.length === 0}
    <div class="empty">No notifications yet.</div>
  {:else}
    <div class="group-rows notification-list">
      {#each data.notifications as notification (notification.id)}
        <article class:unread={!notification.read_at} class="notification-row">
          <div class="notification-copy">
            {#if notification.url}
              <a class="notification-link" href={notification.url} on:click={() => markReadQuiet(notification.id)}>
                <strong>{notification.title}</strong>
                <span>{notification.body}</span>
              </a>
            {:else}
              <div class="notification-link">
                <strong>{notification.title}</strong>
                <span>{notification.body}</span>
              </div>
            {/if}
            <time datetime={new Date(notification.created_at * 1000).toISOString()}>{formatTime(notification.created_at)}</time>
          </div>
          {#if !notification.read_at}
            <button class="read-button" on:click={() => markRead(notification.id)} disabled={notificationBusy} aria-label={`Mark ${notification.title} as read`}>
              Mark read
            </button>
          {/if}
        </article>
      {/each}
    </div>
  {/if}
</section>

<style>
  .page-title { margin-top: var(--s-7); margin-bottom: var(--s-7); }
  .page-title button { font-size: var(--t-15); }
  .push-row { align-items: center; }
  .status { display: block; color: var(--dim); font-size: var(--t-13); margin-top: 2px; }
  .notification-row {
    display: flex; align-items: center; gap: var(--s-3); min-height: 72px;
    padding: var(--s-3) var(--s-4); border-bottom: 1px solid var(--line-thin);
  }
  .notification-row:last-child { border-bottom: 0; }
  .notification-row.unread { background: color-mix(in srgb, var(--blue) 7%, var(--row)); }
  .notification-copy { min-width: 0; flex: 1; }
  .notification-link { display: flex; flex-direction: column; color: var(--ink); }
  .notification-link strong { font-size: var(--t-17); font-weight: 600; }
  .notification-link span { color: var(--ink2); font-size: var(--t-15); overflow-wrap: anywhere; }
  time { display: block; color: var(--dim); font-size: var(--t-13); margin-top: var(--s-1); }
  .read-button { flex: none; font-size: var(--t-15); padding: 0 var(--s-2); }
  @media (max-width: 420px) {
    .notification-row { align-items: flex-start; }
    .read-button { margin-top: 1px; }
  }
</style>
