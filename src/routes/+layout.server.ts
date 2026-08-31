import type { LayoutServerLoad } from './$types';
import { generateMorningSummaries, unreadCount } from '$lib/server/notifications';

export const load: LayoutServerLoad = async ({ locals }) => {
  if(locals.user) await generateMorningSummaries();
  return {
    user: locals.user ? {
      id: locals.user.id,
      username: locals.user.username,
      role: locals.user.role,
      display_name: locals.user.display_name
    } : null,
    notificationUnread: locals.user ? await unreadCount(locals.user.id) : 0
  };
};
