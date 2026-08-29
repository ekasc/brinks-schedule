<script lang="ts">
  import type { PageData, ActionData } from './$types';
  export let data: PageData;
  export let form: ActionData;
</script>

<svelte:head><title>Admin</title></svelte:head>

<div class="mb-6">
  <h1>Admin</h1>
  <div class="mt-1 text-gray-400">Add people, rename, reset passwords.</div>
</div>

{#if form?.error}<div class="mb-6"><div class="text-red-400" role="alert">{form.error}</div></div>{/if}
{#if form?.ok}
  <div class="mb-6">
    <div role="status">Saved.</div>
  </div>
{/if}

<div class="mb-6">
  <div class="border-b border-gray-700 px-4 py-3 font-semibold">New user</div>
  <form method="POST" action="?/create">
    <div class="flex flex-col gap-3">
      <div class="flex flex-col gap-1">
        <input name="username" required autocomplete="off" placeholder="Username" aria-label="Username" />
      </div>
      <div class="flex flex-col gap-1">
        <input name="password" type="password" required minlength="6" placeholder="Password (min 6)" aria-label="Password" />
      </div>
      <div class="flex flex-col gap-1">
        <input name="display_name" required placeholder="Display font-medium" aria-label="Display font-medium" />
      </div>
      <div class="flex flex-col gap-1">
        <span>Role</span>
        <select name="role" required>
          <option value="sales">Sales</option>
          <option value="tech">Tech</option>
          <option value="admin">Admin</option>
        </select>
      </div>
    </div>
    <button type="submit" class="appearance-none rounded-md border-0 bg-blue-600 px-4 py-2 text-white hover:bg-blue-500 disabled:cursor-default disabled:opacity-30">Create user</button>
  </form>
</div>

<div class="mb-6 overflow-hidden rounded-xl bg-gray-900">
  <div class="border-b border-gray-700 px-4 py-3 font-semibold">Users</div>
  {#if data.users.length === 0}
    <div class="rounded-xl bg-gray-900 p-8 text-center text-gray-400">No users yet.</div>
  {:else}
    <div class="divide-y divide-gray-800">
      {#each data.users as u (u.id)}
        <div>
          <div class="flex flex-wrap items-center gap-3">
            <span>{u.display_name}</span>
            <span class="inline-flex rounded-full bg-gray-800 px-2 py-1 text-sm">{u.role}</span>
          </div>
          <div class="text-gray-400 text-sm">@{u.username}</div>
          <div class="flex flex-wrap items-center gap-3">
            <details class="rounded-lg bg-gray-800 p-3">
              <summary>Rename</summary>
              <form method="POST" action="?/rename" class="mt-3 rounded-lg bg-gray-900 p-3">
                <input type="hidden" name="id" value={u.id} />
                <div class="flex flex-col gap-3">
                  <div class="flex flex-col gap-1">
                    <input name="display_name" placeholder="New font-medium" required aria-label="New display font-medium" />
                  </div>
                </div>
                <button type="submit" class="appearance-none rounded-md border-0 bg-blue-600 px-4 py-2 text-white hover:bg-blue-500 disabled:cursor-default disabled:opacity-30">Save</button>
              </form>
            </details>
            <details class="rounded-lg bg-gray-800 p-3">
              <summary>Reset password</summary>
              <form method="POST" action="?/password" class="mt-3 rounded-lg bg-gray-900 p-3">
                <input type="hidden" name="id" value={u.id} />
                <div class="flex flex-col gap-3">
                  <div class="flex flex-col gap-1">
                    <input name="password" type="password" placeholder="New password (min 6)" minlength="6" required aria-label="New password" />
                  </div>
                </div>
                <button type="submit" class="appearance-none rounded-md border-0 bg-blue-600 px-4 py-2 text-white hover:bg-blue-500 disabled:cursor-default disabled:opacity-30">Save</button>
              </form>
            </details>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
