<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { Button, Select } from 'bits-ui';
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
        <Select.Root type="single" name="role" required value="sales" items={[{value:'sales',label:'Sales'},{value:'tech',label:'Tech'},{value:'admin',label:'Admin'}]}>
          <Select.Trigger class="flex w-full items-center justify-between gap-2 rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-white outline-none cursor-pointer text-left data-[placeholder]:!text-gray-400"><Select.Value placeholder="Role" /><svg width="12" height="8" viewBox="0 0 12 8" fill="none" aria-hidden="true" class="ml-1 shrink-0 text-gray-400"><path d="M1 1.5L6 6.5L11 1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></Select.Trigger>
          <Select.Portal>
            <Select.Content class="z-[1000] min-w-[200px] w-[var(--bits-floating-anchor-width)] max-w-[92vw] rounded-md border border-gray-700 bg-gray-900 p-1 text-white shadow-xl" sideOffset={6}>
              <Select.Viewport>
                <Select.Item value="sales" label="Sales" class="cursor-pointer rounded px-3 py-2 data-[state=checked]:bg-gray-800 data-[highlighted]:bg-gray-800">Sales</Select.Item>
                <Select.Item value="tech" label="Tech" class="cursor-pointer rounded px-3 py-2 data-[state=checked]:bg-gray-800 data-[highlighted]:bg-gray-800">Tech</Select.Item>
                <Select.Item value="admin" label="Admin" class="cursor-pointer rounded px-3 py-2 data-[state=checked]:bg-gray-800 data-[highlighted]:bg-gray-800">Admin</Select.Item>
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>
      </div>
    </div>
    <Button.Root type="submit" class="appearance-none rounded-md border-0 bg-blue-600 px-4 py-2 text-white hover:bg-blue-500 disabled:cursor-default disabled:opacity-30">Create user</Button.Root>
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
                <Button.Root type="submit" class="appearance-none rounded-md border-0 bg-blue-600 px-4 py-2 text-white hover:bg-blue-500 disabled:cursor-default disabled:opacity-30">Save</Button.Root>
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
                <Button.Root type="submit" class="appearance-none rounded-md border-0 bg-blue-600 px-4 py-2 text-white hover:bg-blue-500 disabled:cursor-default disabled:opacity-30">Save</Button.Root>
              </form>
            </details>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
