/**
 * scripts/db-seed.ts
 *
 * Seeds the local development database with a sample run and a handful
 * of generated queries so developers can inspect the schema without
 * running the full pipeline.
 *
 * Safe to run multiple times — uses INSERT ... ON CONFLICT DO NOTHING.
 *
 * Usage:
 *   npx tsx scripts/db-seed.ts
 *   npm run db:seed
 *
 * Only runs when NODE_ENV != 'production'.
 */

import { resolve, join }  from "node:path";
import pg                 from "pg";

const { Pool } = pg;

// ---------------------------------------------------------------------------
// Guard: refuse to seed production
// ---------------------------------------------------------------------------

if (process.env["NODE_ENV"] === "production") {
  console.error("❌  db:seed must not be run in production.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ROOT = resolve(import.meta.dirname ?? process.cwd(), "..");

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
// Seed data
// ---------------------------------------------------------------------------

const SEED_RUN_ID = "00000000-0000-0000-0000-000000000001";

const SEED_RUN = {
  id:     SEED_RUN_ID,
  status: "complete",
  config: JSON.stringify({
    runId:          SEED_RUN_ID,
    seeds:          [{ niche: "plumbers", location: { displayName: "Lagos, Nigeria", country: "NG" } }],
    providerIds:    ["google-maps"],
    forceReprocess: false,
  }),
  stats: JSON.stringify({
    queriesGenerated:  5,
    queriesDispatched: 5,
    rawResultsFound:   0,
    recordsNormalized: 0,
    recordsUnique:     0,
    recordsDuplicate:  0,
    recordsExported:   0,
    errors:            0,
  }),
};

const SEED_QUERIES = [
  {
    id:                      "00000000-0000-0000-0001-000000000001",
    run_id:                  SEED_RUN_ID,
    parent_id:               null,
    query_hash:              "a".repeat(64),
    raw_text:                "plumbers Lagos, Nigeria",
    canonical_text:          "plumbers lagos nigeria",
    canonical_geo_label:     "lagos nigeria",
    niche:                   "plumbers",
    provider_id:             "google-maps",
    generated_by_strategies: ["seed"],
    expansion_metadata:      [],
    geo_target:              { displayName: "Lagos, Nigeria", country: "NG", city: "Lagos" },
    lifecycle_state:         "canonicalized",
    status:                  "complete",
  },
  {
    id:                      "00000000-0000-0000-0001-000000000002",
    run_id:                  SEED_RUN_ID,
    parent_id:               "00000000-0000-0000-0001-000000000001",
    query_hash:              "b".repeat(64),
    raw_text:                "plumbing contractor Lagos, Nigeria",
    canonical_text:          "plumbing contractor lagos nigeria",
    canonical_geo_label:     "lagos nigeria",
    niche:                   "plumbers",
    provider_id:             "google-maps",
    generated_by_strategies: ["seed", "synonym"],
    expansion_metadata:      [{ strategyId: "synonym", sourceTerm: "plumber", confidence: 0.85 }],
    geo_target:              { displayName: "Lagos, Nigeria", country: "NG", city: "Lagos" },
    lifecycle_state:         "canonicalized",
    status:                  "complete",
  },
  {
    id:                      "00000000-0000-0000-0001-000000000003",
    run_id:                  SEED_RUN_ID,
    parent_id:               "00000000-0000-0000-0001-000000000001",
    query_hash:              "c".repeat(64),
    raw_text:                "emergency plumbers Lagos, Nigeria",
    canonical_text:          "emergency plumbers lagos nigeria",
    canonical_geo_label:     "lagos nigeria",
    niche:                   "plumbers",
    provider_id:             "google-maps",
    generated_by_strategies: ["seed", "modifier"],
    expansion_metadata:      [{ strategyId: "modifier", sourceTerm: "emergency", confidence: 0.80 }],
    geo_target:              { displayName: "Lagos, Nigeria", country: "NG", city: "Lagos" },
    lifecycle_state:         "canonicalized",
    status:                  "pending",
  },
];

// ---------------------------------------------------------------------------
// Insert helpers
// ---------------------------------------------------------------------------

async function seedRun(client: pg.PoolClient): Promise<void> {
  await client.query(`
    INSERT INTO runs (id, status, config, stats)
    VALUES ($1, $2, $3::jsonb, $4::jsonb)
    ON CONFLICT (id) DO NOTHING
  `, [SEED_RUN.id, SEED_RUN.status, SEED_RUN.config, SEED_RUN.stats]);
}

async function seedQuery(client: pg.PoolClient, q: (typeof SEED_QUERIES)[0]): Promise<void> {
  await client.query(`
    INSERT INTO queries (
      id, run_id, parent_id, query_hash, raw_text, canonical_text,
      canonical_geo_label, niche, provider_id, generated_by_strategies,
      expansion_metadata, geo_target, lifecycle_state, status
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9,
      $10::text[], $11::jsonb, $12::jsonb, $13, $14
    )
    ON CONFLICT (id) DO NOTHING
  `, [
    q.id, q.run_id, q.parent_id, q.query_hash, q.raw_text,
    q.canonical_text, q.canonical_geo_label, q.niche, q.provider_id,
    q.generated_by_strategies, JSON.stringify(q.expansion_metadata),
    JSON.stringify(q.geo_target), q.lifecycle_state, q.status,
  ]);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  try {
    const { config } = await import("dotenv");
    config({ path: join(ROOT, ".env") });
  } catch {
    // dotenv optional
  }

  const pool   = new Pool(getPoolConfig());
  const client = await pool.connect();

  try {
    console.log("🌱  Seeding development database\n");

    await seedRun(client);
    console.log(`   ✓ run            ${SEED_RUN_ID}`);

    for (const q of SEED_QUERIES) {
      await seedQuery(client, q);
      console.log(`   ✓ query          ${q.raw_text}`);
    }

    console.log(`\n✅  Seed complete — ${SEED_QUERIES.length} queries inserted.\n`);
    console.log("   View in Adminer: http://localhost:8080");
    console.log("   SELECT * FROM queries ORDER BY created_at;\n");

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error("\n❌  Seed failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
