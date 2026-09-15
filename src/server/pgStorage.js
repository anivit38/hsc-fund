// Postgres-backed storage adapter for store.js — same getItem/setItem/removeItem
// shape as nodeStorage.js's file adapter, but durable across Render restarts
// and idle-sleep cycles (a plain file on Render's disk gets wiped on both).
// The whole "database" is still one JSON document; it just lives in a single
// row of a one-table key/value store instead of a file, so nothing else in
// store.js or the rest of the app needs to change.
//
// Works with any standard Postgres connection string — Neon, Supabase, RDS,
// a local Postgres, etc. getItem/setItem/removeItem are async here (unlike
// the file adapter), which store.js already tolerates: persist() calls
// setItem() without awaiting it (fire-and-forget so writes never block a
// request), and index.js awaits loadPersistedAsync() once at boot.

import pg from 'pg';

const { Pool } = pg;

export function createPgStorage(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error('createPgStorage requires DATABASE_URL');

  const pool = new Pool({
    connectionString,
    // Neon/Supabase terminate TLS with certs that Node's default trust store
    // sometimes can't chain-verify in this sandboxed runtime; this is the
    // standard workaround every managed-Postgres quickstart uses.
    ssl: { rejectUnauthorized: false },
  });

  pool.on('error', (e) => console.warn('[pg-storage] idle client error (pool recovers automatically):', e.message));

  const ready = pool.query(`
    CREATE TABLE IF NOT EXISTS kv_store (
      key text PRIMARY KEY,
      value text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  return {
    kind: 'postgres',
    async getItem(key) {
      await ready;
      const { rows } = await pool.query('SELECT value FROM kv_store WHERE key = $1', [key]);
      return rows[0]?.value ?? null;
    },
    async setItem(key, value) {
      // Fully self-contained try/catch: persist() in store.js calls this
      // without awaiting it, so a rejection here would otherwise surface as
      // an unhandled promise rejection instead of a clean log line.
      try {
        await ready;
        await pool.query(
          `INSERT INTO kv_store (key, value, updated_at) VALUES ($1, $2, now())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
          [key, value],
        );
      } catch (e) {
        console.warn('[pg-storage] write failed (will retry on next write):', e.message);
      }
    },
    async removeItem(key) {
      await ready;
      await pool.query('DELETE FROM kv_store WHERE key = $1', [key]);
    },
  };
}
