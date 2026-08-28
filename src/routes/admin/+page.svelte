<script lang="ts">
  import type { PageData, ActionData } from './$types';
  export let data: PageData;
  export let form: ActionData;
</script>

<svelte:head><title>Admin</title></svelte:head>

<div class="large-title">
  <h1>Admin</h1>
  <div class="sub">Add people, rename, reset passwords.</div>
</div>

{#if form?.error}<div class="form-section"><div class="err" style="background: rgba(255, 69, 58, 0.15); color: var(--red); border-radius: var(--r-2); padding: var(--s-3) var(--s-4);" role="alert">{form.error}</div></div>{/if}
{#if form?.ok}
  <div class="form-section">
    <div style="background: rgba(48, 209, 88, 0.15); color: var(--green); border-radius: var(--r-2); padding: var(--s-3) var(--s-4);" role="status">Saved.</div>
  </div>
{/if}

<div class="form-section">
  <div class="group-title" style="padding-left: 0; padding-bottom: var(--s-2);">New user</div>
  <form method="POST" action="?/create">
    <div class="input-group">
      <div class="field">
        <input name="username" required autocomplete="off" placeholder="Username" aria-label="Username" />
      </div>
      <div class="field">
        <input name="password" type="password" required minlength="6" placeholder="Password (min 6)" aria-label="Password" />
      </div>
      <div class="field">
        <input name="display_name" required placeholder="Display name" aria-label="Display name" />
      </div>
      <div class="field" style="display: flex; align-items: center;">
        <span style="flex:1; color: var(--dim);">Role</span>
        <select name="role" required style="flex: 2; text-align: right;">
          <option value="sales">Sales</option>
          <option value="tech">Tech</option>
          <option value="admin">Admin</option>
        </select>
      </div>
    </div>
    <button type="submit" class="filled" style="margin-top: var(--s-3);">Create user</button>
  </form>
</div>

<div class="group">
  <div class="group-title">Users</div>
  {#if data.users.length === 0}
    <div class="empty" style="padding: var(--s-5) var(--s-4);">No users yet.</div>
  {:else}
    <div class="group-rows">
      {#each data.users as u (u.id)}
        <div style="padding: var(--s-3) var(--s-4); border-bottom: 1px solid var(--line-thin);">
          <div class="row" style="gap: var(--s-3); margin-bottom: 4px;">
            <span style="flex: 1; font-weight: 600; font-size: var(--t-17);">{u.display_name}</span>
            <span class="pill {u.role}">{u.role}</span>
          </div>
          <div class="muted small" style="margin-bottom: var(--s-2);">@{u.username}</div>
          <div class="row" style="gap: var(--s-5);">
            <details class="disclose" style="flex: 1; border-top: none; padding: 0;">
              <summary>Rename</summary>
              <form method="POST" action="?/rename" class="panel">
                <input type="hidden" name="id" value={u.id} />
                <div class="input-group">
                  <div class="field">
                    <input name="display_name" placeholder="New name" required aria-label="New display name" />
                  </div>
                </div>
                <button type="submit" class="filled" style="margin-top: var(--s-3);">Save</button>
              </form>
            </details>
            <details class="disclose" style="flex: 1; border-top: none; padding: 0;">
              <summary>Reset password</summary>
              <form method="POST" action="?/password" class="panel">
                <input type="hidden" name="id" value={u.id} />
                <div class="input-group">
                  <div class="field">
                    <input name="password" type="password" placeholder="New password (min 6)" minlength="6" required aria-label="New password" />
                  </div>
                </div>
                <button type="submit" class="filled" style="margin-top: var(--s-3);">Save</button>
              </form>
            </details>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
