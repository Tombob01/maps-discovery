/**
 * scripts/check-env.ts
 *
 * Validates the runtime environment before starting the application.
 * Exits non-zero with a clear error message on any failure.
 *
 * Checks performed:
 *   1. All required environment variables are present and valid (Zod)
 *   2. PostgreSQL is reachable and the schema tables exist
 *   3. Redis is reachable and responds to PING
 *   4. Dictionary directories exist and contain at least one YAML file
 *
 * Usage:
 *   npx tsx scripts/check-env.ts
 *   node --import tsx/esm scripts/check-env.ts
 *
 * Run this before starting any worker process to catch misconfiguration
 * before it causes obscure runtime failures.
 */

import { resolve, join }     from "node:path";
import { existsSync, readdirSync } from "node:fs";
import pg                    from "pg";
import { createClient }      from "ioredis";
import { getConfig }         from "../src/config/env.js";

const ROOT = resolve(process.cwd());

// ---------------------------------------------------------------------------
// Result collector
// ---------------------------------------------------------------------------

interface CheckResult {
  name:    string;
  ok:      boolean;
  detail?: string;
}

const results: CheckResult[] = [];

function pass(name: string, detail?: string): void {
  results.push({ name, ok: true, detail });
}

function fail(name: string, detail: string): void {
  results.push({ name, ok: false, detail });
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

async function checkEnvVars(): Promise<void> {
  try {
    getConfig();
    pass("Environment variables", "All required variables present and valid");
  } catch (err) {
    fail("Environment variables", err instanceof Error ? err.message : String(err));
  }
}

async function checkPostgres(): Promise<void> {
  let config: ReturnType<typeof getConfig>;
  try {
    config = getConfig();
  } catch {
    fail("PostgreSQL", "Skipped — env config invalid");
    return;
  }

  const pool = new pg.Pool(
    config.pg.connectionString
      ? { connectionString: config.pg.connectionString, connectionTimeoutMillis: 5000 }
      : {
          host:                    config.pg.host,
          port:                    config.pg.port,
          database:                config.pg.database,
          user:                    config.pg.user,
          password:                config.pg.password,
          connectionTimeoutMillis: 5000,
        }
  );

  try {
    const client = await pool.connect();
    try {
      // Check the DB is up
      const { rows } = await client.query<{ now: Date }>("SELECT NOW() AS now");
      const serverTime = rows[0]?.now?.toISOString() ?? "unknown";

      // Check core tables exist
      const tables = await client.query<{ tablename: string }>(
        `SELECT tablename FROM pg_tables
         WHERE schemaname = 'public'
           AND tablename = ANY($1)`,
        [["runs", "queries", "raw_results", "businesses", "stage_checkpoints"]]
      );
      const found    = tables.rows.map(r => r.tablename).sort();
      const required = ["businesses", "queries", "raw_results", "runs", "stage_checkpoints"];
      const missing  = required.filter(t => !found.includes(t));

      if (missing.length > 0) {
        fail(
          "PostgreSQL",
          `Connected (server time: ${serverTime}) but missing tables: ${missing.join(", ")}. Run: npm run db:migrate`
        );
      } else {
        pass("PostgreSQL", `Connected — server time: ${serverTime} — all tables present`);
      }
    } finally {
      client.release();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    fail(
      "PostgreSQL",
      `Connection failed: ${msg}\n    Check: PG_HOST=${config.pg.host} PG_PORT=${config.pg.port} PG_DATABASE=${config.pg.database}\n    Is Docker running? npm run docker:up`
    );
  } finally {
    await pool.end();
  }
}

async function checkRedis(): Promise<void> {
  let config: ReturnType<typeof getConfig>;
  try {
    config = getConfig();
  } catch {
    fail("Redis", "Skipped — env config invalid");
    return;
  }

  const redisOptions = config.redis.url
    ? { lazyConnect: true, connectTimeout: 5000 }
    : {
        host:           config.redis.host,
        port:           config.redis.port,
        password:       config.redis.password,
        db:             config.redis.db,
        lazyConnect:    true,
        connectTimeout: 5000,
      };

  const client = config.redis.url
    ? createClient(config.redis.url, { lazyConnect: true, connectTimeout: 5000 })
    : createClient(redisOptions);

  try {
    await client.connect();
    const pong = await client.ping();
    if (pong === "PONG") {
      const info    = await client.info("server");
      const version = info.match(/redis_version:([^\r\n]+)/)?.[1]?.trim() ?? "unknown";
      pass("Redis", `Connected — Redis ${version} — PING OK`);
    } else {
      fail("Redis", `Unexpected PING response: ${pong}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    fail(
      "Redis",
      `Connection failed: ${msg}\n    Check: REDIS_HOST=${config.redis.host} REDIS_PORT=${config.redis.port}\n    Is Docker running? npm run docker:up`
    );
  } finally {
    await client.quit().catch(() => { /* already disconnected */ });
  }
}

function checkDictionaries(): void {
  let config: ReturnType<typeof getConfig>;
  try {
    config = getConfig();
  } catch {
    fail("Niche dictionaries", "Skipped — env config invalid");
    fail("Geo dictionaries",   "Skipped — env config invalid");
    return;
  }

  // Niche dictionaries
  const nicheDir = config.queryEngine.nicheDictionariesDir;
  if (!existsSync(nicheDir)) {
    fail("Niche dictionaries", `Directory not found: ${nicheDir}\n    Run: mkdir -p ${nicheDir}`);
  } else {
    const yamls = readdirSync(nicheDir).filter(
      (f: string) => f.endsWith(".yml") || f.endsWith(".yaml")
    );
    if (yamls.length === 0) {
      fail(
        "Niche dictionaries",
        `Directory is empty: ${nicheDir}\n    Add at least one .yml file. See data/dictionaries/niches/ for examples.`
      );
    } else {
      pass("Niche dictionaries", `${yamls.length} file(s) in ${nicheDir}`);
    }
  }

  // Geo dictionaries
  const geoDir = config.queryEngine.geoDictionariesDir;
  if (!existsSync(geoDir)) {
    fail("Geo dictionaries", `Directory not found: ${geoDir}\n    Run: mkdir -p ${geoDir}`);
  } else {
    const yamls = readdirSync(geoDir).filter(
      (f: string) => f.endsWith(".yml") || f.endsWith(".yaml")
    );
    if (yamls.length === 0) {
      fail(
        "Geo dictionaries",
        `Directory is empty: ${geoDir}\n    Add at least one .yml file. See data/dictionaries/geo/ for examples.`
      );
    } else {
      pass("Geo dictionaries", `${yamls.length} file(s) in ${geoDir}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Load .env
  try {
    const { config } = await import("dotenv");
    config({ path: join(ROOT, ".env") });
  } catch {
    // dotenv optional
  }

  console.log("🔍  maps-discovery environment check\n");

  await checkEnvVars();
  await checkPostgres();
  await checkRedis();
  checkDictionaries();

  // Report
  const width = Math.max(...results.map(r => r.name.length)) + 2;
  let allOk   = true;

  for (const result of results) {
    const label   = result.name.padEnd(width);
    const icon    = result.ok ? "✅" : "❌";
    const detail  = result.detail ?? "";
    const detailLines = detail.split("\n");

    console.log(`  ${icon}  ${label}  ${detailLines[0] ?? ""}`);
    for (const line of detailLines.slice(1)) {
      console.log(`         ${" ".repeat(width)}  ${line}`);
    }

    if (!result.ok) allOk = false;
  }

  console.log();

  if (allOk) {
    console.log("✅  All checks passed. Environment is ready.\n");
    process.exit(0);
  } else {
    const failed = results.filter(r => !r.ok).map(r => r.name);
    console.error(`❌  ${failed.length} check(s) failed: ${failed.join(", ")}`);
    console.error("    Fix the issues above before starting the application.\n");
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Unexpected error during env check:", err);
  process.exit(1);
});
