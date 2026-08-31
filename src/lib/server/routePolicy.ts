const PUBLIC_PATHS = ['/login', '/logout', '/favicon.ico', '/manifest.webmanifest', '/sw.js', '/robots.txt', '/api/notifications/cron'];

export function isDeprecated(path: string): boolean {
  return path === '/income' || path.startsWith('/income/') || path === '/stats' || path.startsWith('/stats/');
}

export function isAdminBlocked(path: string): boolean {
  if (path === '/') return true;
  if (path.startsWith('/calendar')) return true;
  if (path.startsWith('/book')) return true;
  if (path.startsWith('/availability')) return true;
  if (path.startsWith('/map')) return true;
  if (path.startsWith('/route')) return true;
  if (path.startsWith('/jobs')) return true;
  if (path.startsWith('/income')) return true;
  if (path.startsWith('/stats')) return true;
  return false;
}

export function getRedirect(path: string, user: { role: string } | null): string | null {
  const isFramework = path.startsWith('/_app') || path.startsWith('/.well-known') || path === '/[fallback]';
  if (isFramework) return null;
  const isPublic = PUBLIC_PATHS.some(p => path === p || path.startsWith(p + '/'));
  const isStaticAsset = path === '/favicon.ico' || path === '/manifest.webmanifest' || path === '/sw.js' || path === '/robots.txt';
  if (!user) {
    if (isPublic) return null;
    return '/login';
  }
  if (path === '/login' || path.startsWith('/login/')) {
    if (user.role === 'admin') return '/clients';
    return '/';
  }
  if (path === '/logout' || path.startsWith('/logout/')) return null;
  if (isStaticAsset) return null;
  if (isDeprecated(path)) {
    if (user.role === 'admin') return '/clients';
    return '/';
  }
  if (user.role === 'admin') {
    if (path === '/notifications' || path.startsWith('/notifications/') || path.startsWith('/api/notifications/')) return null;
    if (path === '/admin' || path.startsWith('/admin/')) return null;
    if (path === '/clients' || path.startsWith('/clients/')) return null;
    if (path === '/export' || path.startsWith('/export/') || path.startsWith('/export?')) return null;
    return '/clients';
  }
  if (path.startsWith('/export')) {
    if (user.role === 'sales' || user.role === 'tech') return '/';
  }
  if (user.role === 'tech') {
    if (path === '/api/geocode' || path.startsWith('/api/geocode/')) return '/';
  }
  return null;
}
