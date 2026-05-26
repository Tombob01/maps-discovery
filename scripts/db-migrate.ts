/**
 * scripts/db-migrate.ts
 *
 * Applies all numbered SQL migration files in migrations/ that have not yet
 * been applied to the database.
 *
 * Migration state is tracked in the `schema_migrations` table:
 *   - Each applied migration gets one row
 *   - Files are applied in lexicographic order (001_, 002_, ...)
 *   - Idempotent: running twice is safe
 *
 * Usage:
 *   npx tsx scripts/db-migrate.ts
 *   npm run db:migrate
 *
 * Environment:
 *   Reads PG_* variables from .env (or DATABASE_URL if set)
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve }             from "node:path";
import { createInterface }           from "node:readline";

// ---------------------------------------------------------------------------
// Minimal pg client — avoids circular imports from src/storage
// ---------------------------------------------------------------------------

import pg from "pg";

const { Pool } = pg;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ROOT           = resolve(import.meta.dirname ?? process.cwd(), "..");
const MIGRATIONS_DIR = join(ROOT, "migrations");

function getPoolConfig(): pg.PoolConfig {
  if (process.env["DATABASE_URL"]) {
    return { connectionString: process.env["DATABASE_URL"] };
  }
  return {
    host:     process.env["PG_HOST"]     ?? "localhost",
    port:     parseInt(process.env["PG_PORT"] ?? "5432", 10),
    database: process.env["PG_DATABASE"] ?? "maps_discovery",
    user:     process.env["PG_USER"]     ?? "maps_user",
    password: process.env["PG_PASSWORD"] ?? "maps_pass_local",
  };
}

// ---------------------------------------------------------------------------
// Migration runner
// ---------------------------------------------------------------------------

async function ensureMigrationsTable(client: pg.PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename    TEXT        PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function getAppliedMigrations(client: pg.PoolClient): Promise<Set<string>> {
  const result = await client.query<{ filename: string }>(
    "SELECT filename FROM schema_migrations ORDER BY filename"
  );
  return new Set(result.rows.map(r => r.filename));
}

function getPendingMigrations(applied: Set<string>): string[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f: string) => f.endsWith(".sql"))
    .sort();                           // lexicographic = 001_ before 002_

  return files.filter((f: string) => !applied.has(f));
}

async function applyMigration(client: pg.PoolClient, filename: string): Promise<void> {
  const filePath = join(MIGRATIONS_DIR, filename);
  const sql      = readFileSync(filePath, "utf8");

  // Wrap each migration in a transaction for atomicity
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query(
      "INSERT INTO schema_migrations (filename) VALUES ($1)",
      [filename]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

async function main(): Promise<void> {
  // Load .env if running outside of the npm scripts chain
  try {
    const { config } = await import("dotenv");
    config({ path: join(ROOT, ".env") });
  } catch {
    // dotenv is optional — env vars may already be set
  }

  const pool   = new Pool(getPoolConfig());
  const client = await pool.connect();

  try {
    console.log("🗃  Running database migrations\n");

    await ensureMigrationsTable(client);
    const applied = await getAppliedMigrations(client);
    const pending = getPendingMigrations(applied);

    if (pending.length === 0) {
      console.log("✅  No pending migrations — database is up to date.\n");
      return;
    }

    console.log(`   Found ${pending.length} pending migration(s):\n`);

    for (const filename of pending) {
      process.stdout.write(`   Applying ${filename} ... `);
      await applyMigration(client, filename);
      console.log("✓");
    }

    console.log(`\n✅  Applied ${pending.length} migration(s) successfully.\n`);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error("\n❌  Migration failed:", err instanceof Error ? err.message : err);
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
