import type { LayoutServerLoad } from './$types';
import { unreadCount } from '$lib/server/notifications';

export const load: LayoutServerLoad = async ({ locals }) => {
  // NOTE: morning summaries + push delivery are owned by the 15-min cron
  // (`/api/notifications/cron`). They used to run here on EVERY navigation,
  // putting multiple queries + inserts in the path of every tap.
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
