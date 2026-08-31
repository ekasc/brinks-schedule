const EXACT_PUSH_HOSTS=new Set([
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'web.push.apple.com'
]);

export function isAllowedPushEndpoint(value:string):boolean{
  let url:URL;
  try { url=new URL(value); } catch { return false; }
  if(url.protocol!=='https:' || url.username || url.password || (url.port && url.port!=='443')) return false;
  const host=url.hostname.toLowerCase();
  return EXACT_PUSH_HOSTS.has(host) || host.endsWith('.notify.windows.com');
}
