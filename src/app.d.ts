import type { User } from '$lib/server/db';

declare global {
  namespace App {
    interface Locals {
      user: User | null;
    }
    // Cloudflare Workers bindings (see wrangler.toml). `DB` is the D1 database.
    interface Platform {
      env: { DB: unknown };
    }
  }
}

export {};
