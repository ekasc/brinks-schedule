// Node-safe schema — zero SvelteKit imports ($env, $app, etc.)
// Used by both db.ts (via D1/better-sqlite3) and tests/e2e/global-setup.ts (raw Node).

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('admin','sales','tech')), display_name TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1, session_version INTEGER NOT NULL DEFAULT 1, last_login INTEGER, created_at INTEGER NOT NULL DEFAULT (unixepoch()));
CREATE TABLE IF NOT EXISTS availability_blocks (id INTEGER PRIMARY KEY AUTOINCREMENT, tech_id INTEGER NOT NULL, starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL, note TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()), FOREIGN KEY (tech_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_avail_tech_starts ON availability_blocks(tech_id, starts_at);
CREATE TABLE IF NOT EXISTS availability_templates (id INTEGER PRIMARY KEY AUTOINCREMENT, tech_id INTEGER NOT NULL, dow INTEGER NOT NULL CHECK (dow >=0 AND dow <=6), start_min INTEGER NOT NULL, end_min INTEGER NOT NULL, kind TEXT NOT NULL DEFAULT 'available' CHECK (kind IN ('available','unavailable')), note TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()), FOREIGN KEY (tech_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_templates_tech_dow ON availability_templates(tech_id, dow);
CREATE TABLE IF NOT EXISTS availability_unavailable (id INTEGER PRIMARY KEY AUTOINCREMENT, tech_id INTEGER NOT NULL, starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL, reason TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()), FOREIGN KEY (tech_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_unavail_tech_starts ON availability_unavailable(tech_id, starts_at);
CREATE TABLE IF NOT EXISTS jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, tech_id INTEGER NOT NULL, booked_by INTEGER NOT NULL, client_name TEXT NOT NULL, address TEXT NOT NULL, street TEXT, city TEXT, province TEXT, postal_code TEXT, lat REAL, lng REAL, starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','signed','cancelled')), completed_at INTEGER, notes TEXT, email TEXT, dob TEXT, telus_pin TEXT, id_type TEXT CHECK (id_type IS NULL OR id_type IN ('dl','passport','bcid','other')), id_last4 TEXT, emergency_name TEXT, emergency_number TEXT, emergency_relation TEXT, verbal_password TEXT, svc_internet INTEGER NOT NULL DEFAULT 0, svc_internet_detail TEXT, svc_home_phone INTEGER NOT NULL DEFAULT 0, svc_home_phone_detail TEXT, svc_tv INTEGER NOT NULL DEFAULT 0, svc_tv_detail TEXT, themes TEXT, security_offered TEXT, phone TEXT, price_cents INTEGER NOT NULL DEFAULT 0, payout_cents INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch()), FOREIGN KEY (tech_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (booked_by) REFERENCES users(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_jobs_tech_starts ON jobs(tech_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at);
CREATE TABLE IF NOT EXISTS job_events (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER NOT NULL, actor_id INTEGER, kind TEXT NOT NULL, from_val TEXT, to_val TEXT, note TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()), FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_events_job ON job_events(job_id, created_at);
CREATE TABLE IF NOT EXISTS pii_access_log (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER NOT NULL, accessor_id INTEGER NOT NULL, created_at INTEGER NOT NULL DEFAULT (unixepoch()));
CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, url TEXT, dedupe_key TEXT NOT NULL, read_at INTEGER, created_at INTEGER NOT NULL DEFAULT (unixepoch()), UNIQUE(user_id, dedupe_key), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS notification_state (id INTEGER PRIMARY KEY CHECK(id=1), started_at INTEGER NOT NULL);
INSERT OR IGNORE INTO notification_state(id,started_at) VALUES(1,unixepoch());
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS push_subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch()), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS push_deliveries (id INTEGER PRIMARY KEY AUTOINCREMENT, notification_id INTEGER NOT NULL, subscription_id INTEGER NOT NULL, attempt_count INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL DEFAULT (unixepoch()), lease_until INTEGER, lease_token TEXT, delivered_at INTEGER, last_error TEXT, UNIQUE(notification_id, subscription_id), FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE, FOREIGN KEY (subscription_id) REFERENCES push_subscriptions(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS login_rate_limits (key TEXT PRIMARY KEY, window_start INTEGER NOT NULL, failures INTEGER NOT NULL, blocked_until INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_push_pending ON push_deliveries(delivered_at, next_attempt_at, lease_until);
CREATE TRIGGER IF NOT EXISTS notifications_enqueue_push AFTER INSERT ON notifications BEGIN INSERT OR IGNORE INTO push_deliveries(notification_id, subscription_id) SELECT NEW.id, id FROM push_subscriptions WHERE user_id=NEW.user_id; END;
`;

export function initializeSqliteSchema(db: any): void {
  db.exec(SCHEMA);
  // Migrations for pre-existing DBs (idempotent)
  if (!db.prepare(`PRAGMA table_info(jobs)`).all().some((c:any)=>c.name==='svc_internet_detail')) db.exec(`ALTER TABLE jobs ADD COLUMN svc_internet_detail TEXT;`);
  if (!db.prepare(`PRAGMA table_info(jobs)`).all().some((c:any)=>c.name==='svc_home_phone_detail')) db.exec(`ALTER TABLE jobs ADD COLUMN svc_home_phone_detail TEXT;`);
  if (!db.prepare(`PRAGMA table_info(jobs)`).all().some((c:any)=>c.name==='svc_tv_detail')) db.exec(`ALTER TABLE jobs ADD COLUMN svc_tv_detail TEXT;`);
  if (!db.prepare(`PRAGMA table_info(jobs)`).all().some((c:any)=>c.name==='payout_cents')) db.exec(`ALTER TABLE jobs ADD COLUMN payout_cents INTEGER NOT NULL DEFAULT 0;`);
  if (!db.prepare(`PRAGMA table_info(jobs)`).all().some((c:any)=>c.name==='phone')) db.exec(`ALTER TABLE jobs ADD COLUMN phone TEXT;`);
  if (!db.prepare(`PRAGMA table_info(jobs)`).all().some((c:any)=>c.name==='price_cents')) db.exec(`ALTER TABLE jobs ADD COLUMN price_cents INTEGER NOT NULL DEFAULT 0;`);
  if (!db.prepare(`PRAGMA table_info(users)`).all().some((c:any)=>c.name==='is_active')) db.exec(`ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;`);
  if (!db.prepare(`PRAGMA table_info(users)`).all().some((c:any)=>c.name==='last_login')) db.exec(`ALTER TABLE users ADD COLUMN last_login INTEGER;`);
  if (!db.prepare(`PRAGMA table_info(users)`).all().some((c:any)=>c.name==='session_version')) db.exec(`ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 1;`);
  if (!db.prepare(`PRAGMA table_info(jobs)`).all().some((c:any)=>c.name==='postal_code')) db.exec(`ALTER TABLE jobs ADD COLUMN postal_code TEXT;`);
  if (!db.prepare(`PRAGMA table_info(jobs)`).all().some((c:any)=>c.name==='street')) db.exec(`ALTER TABLE jobs ADD COLUMN street TEXT;`);
  if (!db.prepare(`PRAGMA table_info(jobs)`).all().some((c:any)=>c.name==='city')) db.exec(`ALTER TABLE jobs ADD COLUMN city TEXT;`);
  if (!db.prepare(`PRAGMA table_info(jobs)`).all().some((c:any)=>c.name==='province')) db.exec(`ALTER TABLE jobs ADD COLUMN province TEXT;`);
  if (!db.prepare(`PRAGMA table_info(availability_templates)`).all().some((c:any)=>c.name==='kind')) db.exec(`ALTER TABLE availability_templates ADD COLUMN kind TEXT NOT NULL DEFAULT 'available' CHECK (kind IN ('available','unavailable'));`);
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_templates_tech_dow ON availability_templates(tech_id, dow)`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_unavail_tech_starts ON availability_unavailable(tech_id, starts_at)`); } catch {}
}
