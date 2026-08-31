<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import { Button, Dialog } from 'bits-ui';
  import { swipeSheet } from '$lib/actions/swipeSheet';
  export let data: PageData;
  export let form: ActionData;

  const inpc = 'w-full bg-transparent py-0 text-[var(--t-17)] text-[var(--ink)] outline-none placeholder:text-[var(--dim)]';

  let newOpen = false;
  let newRole: 'sales' | 'tech' | 'admin' = 'sales';
  let editOpen = false;
  let editUser: (typeof data.users)[number] | null = null;
  let q = '';
  $: if (form?.ok && newOpen) newOpen = false;
  $: if (form?.ok && editOpen) editOpen = false;
  $: filtered = data.users.filter(u => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return u.display_name.toLowerCase().includes(s) || u.username.toLowerCase().includes(s) || u.role.includes(s);
  });
  function openEdit(u: (typeof data.users)[number]) { editUser = u; editOpen = true; }
</script>

<svelte:head><title>Admin</title></svelte:head>

<div class="mt-8 mb-6 px-4 sm:px-0 flex items-start justify-between gap-4">
  <div>
    <h1 class="text-[28px] font-bold tracking-tight">Admin</h1>
    <p class="mt-1 text-[15px] leading-snug text-[var(--dim)]">Create accounts and update names or passwords.</p>
  </div>
  <Dialog.Root bind:open={newOpen}>
    <Dialog.Trigger>
      {#snippet child({ props })}
        <Button.Root {...props} class="filled !w-auto shrink-0 px-5">New user</Button.Root>
      {/snippet}
    </Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay class="admin-new-overlay fixed inset-0 z-[1000] bg-black/40 backdrop-blur-sm" />
      <Dialog.Content class="admin-new-content fixed z-[1001] flex max-h-[85vh] flex-col overflow-hidden border border-[var(--line)] bg-[color-mix(in_srgb,var(--bg)_85%,transparent)] shadow-2xl will-change-[transform,opacity] backdrop-blur-[20px] backdrop-saturate-[180%]" style="backdrop-filter: blur(20px) saturate(180%); -webkit-backdrop-filter: blur(20px) saturate(180%); border-top: 1px solid rgba(255,255,255,0.4);">
        <div use:swipeSheet={{ onClose: () => newOpen = false }} class="flex flex-col flex-1 min-h-0">
        <div data-sheet-handle class="mx-auto flex justify-center py-3 -my-1 md:hidden" aria-hidden="true" style="touch-action:none;"><div class="h-1.5 w-10 rounded-full bg-[var(--line)]"></div></div>
        <div class="flex items-center justify-between gap-4 border-b border-[var(--line-thin)] px-5 py-4">
          <div>
            <h2 class="text-[17px] font-semibold text-[var(--ink)]">New user</h2>
            <p class="mt-0.5 text-[13px] text-[var(--dim)]">Add a technician, sales or admin account.</p>
          </div>
          <Button.Root class="grid h-8 w-8 place-items-center rounded-full bg-[var(--row)] border border-[var(--line)] text-[var(--dim)] hover:bg-[var(--row2)] hover:text-[var(--ink)]" onclick={() => newOpen = false} aria-label="Close">✕</Button.Root>
        </div>
        <form method="POST" action="?/create" class="overflow-y-auto">
          <div class="p-5 flex flex-col gap-3">
            <div class="input-group">
              <label class="field">
                <span class="key">Display name</span>
                <input class={inpc} id="new-display" name="display_name" required placeholder="Jane Doe" aria-label="Display name" autocomplete="off" />
              </label>
              <label class="field">
                <span class="key">Username</span>
                <input class={inpc} id="new-username" name="username" required autocomplete="off" placeholder="jane.doe" aria-label="Username" autocapitalize="off" />
              </label>
              <label class="field">
                <span class="key">Password</span>
                <input class={inpc} id="new-password" name="password" type="password" required minlength="8" maxlength="128" placeholder="At least 8 characters" aria-label="Password" />
              </label>
            </div>
            <div class="input-group">
              <label class="field">
                <span class="key">Role</span>
                <select name="role" required bind:value={newRole} class="{inpc} cursor-pointer" aria-label="Role">
                  <option value="sales">Sales</option>
                  <option value="tech">Tech</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
            </div>
          </div>
          <div class="flex gap-2 border-t border-[var(--line-thin)] bg-[var(--row)]/50 px-5 pt-4" style="padding-bottom: max(16px, env(safe-area-inset-bottom));">
            <Button.Root type="button" class="flex-1 rounded-[10px] border border-[var(--line)] bg-[var(--row)] px-4 py-2.5 text-[15px] font-medium text-[var(--ink)] hover:bg-[var(--row2)]" onclick={() => newOpen = false}>Cancel</Button.Root>
            <Button.Root type="submit" class="flex-1 rounded-[10px] bg-[var(--blue)] px-4 py-2.5 text-[15px] font-semibold text-white hover:bg-[var(--blue-press)]">Create user</Button.Root>
          </div>
        </form>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
</div>

{#if form?.error}
  <div class="form-section">
    <div class="err" role="alert">{form.error}</div>
  </div>
{/if}
{#if form?.ok}
  <div class="form-section">
    <div class="rounded-[10px] border border-[color-mix(in_srgb,var(--green)_18%,transparent)] bg-[color-mix(in_srgb,var(--green)_10%,transparent)] px-4 py-3 text-[15px] text-[var(--green)]" role="status">Saved.</div>
  </div>
{/if}

<div class="group group--loose sm:!mx-0">
  <div class="flex items-baseline justify-between gap-3 pb-3">
    <div class="group-title !p-0 !pb-0">Users · {filtered.length}{q ? ` / ${data.users.length}` : ''}</div>
  </div>

  <div class="mb-3">
    <input class="w-full rounded-[10px] border border-[var(--line)] bg-[var(--row)] px-3 py-2.5 text-[15px] text-[var(--ink)] outline-none placeholder:text-[var(--dim)]" placeholder="Search name or username" bind:value={q} aria-label="Search users" />
  </div>

  {#if filtered.length === 0}
    <div class="group-rows">
      <div class="empty">{q ? `No match for “${q}”` : 'No users yet.'}</div>
    </div>
  {:else}
    <div class="group-rows divide-y divide-[var(--line-thin)]">
      {#each filtered as u (u.id)}
        <div class="bg-[var(--row)]">
          <div class="flex items-center gap-3 px-4 py-3.5">
            <div class="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--row2)] border border-[var(--line-thin)] text-[13px] font-semibold text-[var(--ink)]" aria-hidden="true">{u.display_name.trim().charAt(0).toUpperCase() || '?'}</div>
            <div class="min-w-0 flex-1">
              <div class="truncate text-[15px] font-semibold leading-tight text-[var(--ink)]">{u.display_name}</div>
              <div class="truncate text-[13px] leading-tight text-[var(--dim)]">@{u.username}</div>
            </div>
            <span class="pill {u.role} shrink-0 capitalize">{u.role}</span>
            <Button.Root class="shrink-0 rounded-full border border-[var(--line)] bg-[var(--row)] px-3.5 py-1.5 text-[13px] font-medium text-[var(--blue)] hover:bg-[var(--row2)]" onclick={() => openEdit(u)} aria-label="Edit {u.display_name}">Edit</Button.Root>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<Dialog.Root bind:open={editOpen}>
  <Dialog.Portal>
    <Dialog.Overlay class="admin-edit-overlay fixed inset-0 z-[1000] bg-black/40 backdrop-blur-sm" />
    <Dialog.Content class="admin-edit-content fixed z-[1001] flex max-h-[85vh] flex-col overflow-hidden border border-[var(--line)] bg-[color-mix(in_srgb,var(--bg)_85%,transparent)] shadow-2xl will-change-[transform,opacity] backdrop-blur-[20px] backdrop-saturate-[180%]" style="backdrop-filter: blur(20px) saturate(180%); -webkit-backdrop-filter: blur(20px) saturate(180%); border-top: 1px solid rgba(255,255,255,0.4);">
      <div use:swipeSheet={{ onClose: () => editOpen = false }} class="flex flex-col flex-1 min-h-0">
        <div data-sheet-handle class="mx-auto flex justify-center py-3 -my-1 md:hidden" aria-hidden="true" style="touch-action:none;"><div class="h-1.5 w-10 rounded-full bg-[var(--line)]"></div></div>
        <div class="flex items-center justify-between gap-4 border-b border-[var(--line-thin)] px-5 py-4">
          <div class="min-w-0">
            <h2 class="truncate text-[17px] font-semibold text-[var(--ink)]">{editUser?.display_name ?? 'Edit user'}</h2>
            <p class="truncate text-[13px] text-[var(--dim)]">{editUser ? `@${editUser.username} · ${editUser.role}` : ''}</p>
          </div>
          <Button.Root class="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--row)] border border-[var(--line)] text-[var(--dim)] hover:bg-[var(--row2)] hover:text-[var(--ink)]" onclick={() => editOpen = false} aria-label="Close">✕</Button.Root>
        </div>
        {#if editUser}
          <form method="POST" action="?/edit" class="overflow-y-auto px-5 py-5 flex flex-col gap-4" style="padding-bottom: max(20px, env(safe-area-inset-bottom));">
            <div class="input-group">
              <label class="field">
                <span class="key">Display name</span>
                <input class={inpc} name="display_name" required value={editUser.display_name} aria-label="Display name" autocomplete="off" />
              </label>
              <label class="field">
                <span class="key">Username</span>
                <input class={inpc} name="username" required value={editUser.username} aria-label="Username" autocapitalize="off" autocomplete="off" />
              </label>
              <label class="field">
                <span class="key">Role</span>
                <select name="role" required class="{inpc} cursor-pointer" aria-label="Role">
                  <option value="sales" selected={editUser.role === 'sales'}>Sales</option>
                  <option value="tech" selected={editUser.role === 'tech'}>Tech</option>
                  <option value="admin" selected={editUser.role === 'admin'}>Admin</option>
                </select>
              </label>
              <label class="field">
                <span class="key">New password</span>
                <input class={inpc} name="password" type="password" minlength="8" maxlength="128" placeholder="Leave blank to keep" aria-label="New password" autocomplete="new-password" />
              </label>
            </div>
            <input type="hidden" name="id" value={editUser.id} />
            <div class="flex justify-end">
              <Button.Root type="submit" class="filled !w-auto px-6">Save</Button.Root>
            </div>
          </form>
        {/if}
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  :global(.admin-new-content),
  :global(.admin-edit-content) {
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(95vw, 520px);
    max-height: 85vh;
    border-radius: 16px;
    will-change: transform, opacity;
  }
  :global(.admin-new-overlay[data-state="open"]),
  :global(.admin-edit-overlay[data-state="open"]) { animation: admin-overlay-in 240ms cubic-bezier(0.32,0.72,0,1); }
  :global(.admin-new-overlay[data-state="closed"]),
  :global(.admin-edit-overlay[data-state="closed"]) { animation: admin-overlay-out 180ms ease; }
  :global(.admin-new-content[data-state="open"]),
  :global(.admin-edit-content[data-state="open"]) { animation: admin-dialog-in 400ms cubic-bezier(0.32,0.72,0,1); }
  :global(.admin-new-content[data-state="closed"]),
  :global(.admin-edit-content[data-state="closed"]) { animation: admin-dialog-out 200ms cubic-bezier(0.32,0.72,0,1); }
  @keyframes admin-overlay-in { from { opacity: 0; } to { opacity: 1; } }
  @keyframes admin-overlay-out { from { opacity: 1; } to { opacity: 0; } }
  @keyframes admin-dialog-in { from { opacity: 0; transform: translate(-50%, -46%) scale(0.96); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
  @keyframes admin-dialog-out { from { opacity: 1; transform: translate(-50%, -50%) scale(1); } to { opacity: 0; transform: translate(-50%, -46%) scale(0.98); } }
  :global(.admin-new-content) button:active:not(:disabled),
  :global(.admin-edit-content) button:active:not(:disabled) { transform: scale(0.97); transition: transform 100ms ease-out; }
  @media (max-width: 640px) {
    :global(.admin-new-content),
    :global(.admin-edit-content) {
      left: 0;
      right: 0;
      top: auto;
      bottom: 0;
      transform: none;
      width: 100%;
      max-width: none;
      max-height: 88vh;
      border-radius: 20px 20px 0 0;
      border-bottom: none;
    }
    :global(.admin-new-content[data-state="open"]),
    :global(.admin-edit-content[data-state="open"]) { animation: admin-sheet-in 420ms cubic-bezier(0.32,0.72,0,1); }
    :global(.admin-new-content[data-state="closed"]),
    :global(.admin-edit-content[data-state="closed"]) { animation: admin-sheet-out 280ms cubic-bezier(0.32,0.72,0,1); }
    @keyframes admin-sheet-in { from { opacity: 0; transform: translateY(100%) scale(0.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
    @keyframes admin-sheet-out { from { opacity: 1; transform: translateY(0) scale(1); } to { opacity: 0; transform: translateY(100%) scale(0.985); } }
  }
  @media (prefers-reduced-motion: reduce) {
    :global(.admin-new-content[data-state="open"]),
    :global(.admin-new-content[data-state="closed"]),
    :global(.admin-edit-content[data-state="open"]),
    :global(.admin-edit-content[data-state="closed"]),
    :global(.admin-new-overlay[data-state="open"]),
    :global(.admin-new-overlay[data-state="closed"]),
    :global(.admin-edit-overlay[data-state="open"]),
    :global(.admin-edit-overlay[data-state="closed"]) { animation-duration: 160ms !important; }
    :global(.admin-new-content[data-state="open"]),
    :global(.admin-new-content[data-state="closed"]),
    :global(.admin-edit-content[data-state="open"]),
    :global(.admin-edit-content[data-state="closed"]) { transform: none !important; }
  }
  @media (prefers-reduced-transparency: reduce) {
    :global(.admin-new-content),
    :global(.admin-edit-content) { backdrop-filter: none !important; background: var(--bg) !important; }
    :global(.admin-new-overlay),
    :global(.admin-edit-overlay) { backdrop-filter: none !important; }
  }
</style>
