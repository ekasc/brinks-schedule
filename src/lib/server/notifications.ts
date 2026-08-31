import { env } from '$env/dynamic/private';
import { sendNotification, type PushSubscription } from 'web-push-neo';
import * as database from './db';

export interface NotificationRecord {
  id: number;
  user_id: number;
  title: string;
  body: string;
  url: string | null;
  read_at: number | null;
  created_at: number;
}

export interface PushDelivery {
  delivery_id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  payload: string;
  attempt_count: number;
}

interface NotificationDb {
  createNotification(userId: number, title: string, body: string, url: string | null, dedupeKey: string): Promise<number>;
  generateDailySummaryNotifications(fromTs:number, toTs:number, localDate:string): Promise<number>;
  reconcileJobNotifications(): Promise<number>;
  listNotifications(userId: number, limit: number, beforeId?: number): Promise<NotificationRecord[]>;
  countUnreadNotifications(userId: number): Promise<number>;
  markNotificationRead(notificationId: number, userId: number): Promise<boolean>;
  markAllNotificationsRead(userId: number): Promise<number>;
  upsertPushSubscription(userId: number, endpoint: string, p256dh: string, auth: string): Promise<void>;
  deletePushSubscription(userId: number, endpoint: string): Promise<boolean>;
  claimPendingPushDeliveries(limit: number, leaseUntil: number): Promise<PushDelivery[]>;
  completePushDelivery(deliveryId: number): Promise<void>;
  retryPushDelivery(deliveryId: number, nextAttemptAt: number, error: string): Promise<void>;
  deletePushSubscriptionByEndpoint(endpoint: string): Promise<void>;
}

const db = database as unknown as NotificationDb;

export async function notifyUser(userId:number, title:string, body:string, url:string|null, dedupeKey:string) {
  const id=await db.createNotification(userId, title, body, url, dedupeKey);
  if(id && env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT){
    await pumpPush(25).catch(()=>({claimed:0,sent:0,failed:0}));
  }
  return id;
}

export async function notifyJobCreated(job:{id:number;tech_id:number;client_name:string;starts_at:number}) {
  await notifyUser(job.tech_id, 'New booking', `${job.client_name} was added to your schedule.`, `/jobs/${job.id}`, `job:${job.id}:created`);
}

function zonedUnix(parts:{year:number;month:number;day:number;hour:number}, timeZone:string){
  let guess=Date.UTC(parts.year,parts.month-1,parts.day,parts.hour)/1000;
  const formatter=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'});
  for(let i=0;i<2;i++){
    const got=Object.fromEntries(formatter.formatToParts(new Date(guess*1000)).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
    const wanted=Date.UTC(parts.year,parts.month-1,parts.day,parts.hour)/1000;
    const observed=Date.UTC(got.year,got.month-1,got.day,got.hour)/1000;
    guess+=wanted-observed;
  }
  return guess;
}

export async function generateMorningSummaries(now=new Date()){
  const timeZone='America/Vancouver';
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
  if(parts.hour<7) return 0;
  const localDate=`${parts.year}-${String(parts.month).padStart(2,'0')}-${String(parts.day).padStart(2,'0')}`;
  const from=zonedUnix({year:parts.year,month:parts.month,day:parts.day,hour:0},timeZone);
  const next=new Date(Date.UTC(parts.year,parts.month-1,parts.day)+86400000);
  const to=zonedUnix({year:next.getUTCFullYear(),month:next.getUTCMonth()+1,day:next.getUTCDate(),hour:0},timeZone);
  return db.generateDailySummaryNotifications(from,to,localDate);
}

export const reconcileNotifications=()=>db.reconcileJobNotifications();
export async function reconcileAndDeliver(){
  const repaired=await reconcileNotifications();
  if(repaired && env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT) await pumpPush(25);
  return repaired;
}

export async function listForUser(userId: number, limit: number, beforeId?: number) {
  const [notifications, unread] = await Promise.all([
    db.listNotifications(userId, limit, beforeId),
    db.countUnreadNotifications(userId)
  ]);
  return { notifications, unread };
}

export const markRead = (userId: number, notificationId: number) =>
  db.markNotificationRead(notificationId, userId);
export const markAllRead = (userId: number) => db.markAllNotificationsRead(userId);
export const unreadCount = (userId: number) => db.countUnreadNotifications(userId);
export const subscribe = (userId: number, subscription: PushSubscription) =>
  db.upsertPushSubscription(userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth);
export const unsubscribe = (userId: number, endpoint: string) =>
  db.deletePushSubscription(userId, endpoint);

export async function pumpPush(limit = 50): Promise<{ claimed: number; sent: number; failed: number }> {
  const publicKey = env.VAPID_PUBLIC_KEY;
  const privateKey = env.VAPID_PRIVATE_KEY;
  const subject = env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    throw new Error('VAPID configuration is incomplete');
  }
  const vapidDetails = { publicKey, privateKey, subject };

  const now = Math.floor(Date.now() / 1000);
  const deliveries = await db.claimPendingPushDeliveries(limit, now + 120);
  let sent = 0;
  let failed = 0;
  for (const delivery of deliveries) {
    try {
      const result = await sendNotification({
        endpoint: delivery.endpoint,
        keys: { p256dh: delivery.p256dh, auth: delivery.auth }
      }, delivery.payload, { vapidDetails, TTL: 86400, signal: AbortSignal.timeout(10_000) });
      if (result.statusCode === 404 || result.statusCode === 410) {
        await db.deletePushSubscriptionByEndpoint(delivery.endpoint);
        await db.completePushDelivery(delivery.delivery_id);
        failed++;
      } else if (result.statusCode >= 200 && result.statusCode < 300) {
        await db.completePushDelivery(delivery.delivery_id);
        sent++;
      } else {
        throw new Error(`push service returned ${result.statusCode}`);
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message.slice(0, 300) : 'push failed';
      const delay = Math.min(3600, 30 * 2 ** Math.min(delivery.attempt_count, 7));
      await db.retryPushDelivery(delivery.delivery_id, now + delay, message);
      failed++;
    }
  }
  return { claimed: deliveries.length, sent, failed };
}
