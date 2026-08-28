<script lang="ts">
  import type { ActionData } from './$types';
  export let form: ActionData;
</script>

<svelte:head><title>Sign In</title></svelte:head>

<div class="login">
  <div class="logo" aria-hidden="true">🔒</div>
  <h1>Brinks Schedule</h1>

  <form method="POST" class="form">
    {#if form?.error}
      <div class="err" role="alert">{form.error}</div>
    {/if}
    <div class="input-group">
      <div class="field">
        <input name="username" placeholder="Username" autocomplete="username" autocapitalize="off" autocorrect="off" value={form?.username ?? ''} required aria-label="Username" />
      </div>
      <div class="field">
        <input name="password" type="password" placeholder="Password" autocomplete="current-password" required aria-label="Password" />
      </div>
    </div>
    <button type="submit" class="filled">Sign In</button>
  </form>
</div>
