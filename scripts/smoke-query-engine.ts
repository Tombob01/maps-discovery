/**
 * scripts/smoke-query-engine.ts
 *
 * Quick manual smoke test for the query engine.
 * Not part of the test suite — run this to manually verify the
 * query engine produces sane output from real YAML dictionaries.
 *
 * Usage:
 *   node --import tsx/esm scripts/smoke-query-engine.ts
 *   npx tsx scripts/smoke-query-engine.ts
 */

import { resolve }             from "node:path";
import {
  createQueryEngine,
  buildQueryEngineConfig,
}                              from "../src/query-engine/index.js";
import type { GeneratedQuery } from "../src/core/models/Query.js";

const ROOT         = resolve(import.meta.dirname ?? process.cwd(), "..");
const NICHE_DICTS  = resolve(ROOT, process.env["QUERY_ENGINE_NICHE_DICTS_DIR"] ?? "data/dictionaries/niches");
const GEO_DICTS    = resolve(ROOT, process.env["QUERY_ENGINE_GEO_DICTS_DIR"]   ?? "data/dictionaries/geo");

async function main(): Promise<void> {
  console.log("🔍  Query Engine Smoke Test\n");
  console.log(`   Niche dicts : ${NICHE_DICTS}`);
  console.log(`   Geo dicts   : ${GEO_DICTS}\n`);

  const { engine, nicheDictCount, geoDictCount, strategyIds } = createQueryEngine({
    config: buildQueryEngineConfig(
      { nicheDictionariesDir: NICHE_DICTS, geoDictionariesDir: GEO_DICTS },
      { expansion: { defaultMaxVariants: 20, defaultStrategyIds: ["synonym", "modifier", "plural", "geo"], continueOnStrategyError: true } },
    ),
    staticCoordinates: {
      "Lagos, Nigeria":  { lat: 6.5244, lng: 3.3792 },
      "Abuja, Nigeria":  { lat: 9.0765, lng: 7.3986 },
    },
  });

  console.log(`✅  Loaded ${nicheDictCount} niche dict(s) and ${geoDictCount} geo dict(s)`);
  console.log(`   Strategies: ${strategyIds.join(", ")}\n`);

  const seed = {
    niche:    "plumbers",
    location: { displayName: "Lagos, Nigeria", country: "NG", city: "Lagos" },
    maxVariants: 15,
  };

  console.log(`📋  Seed: "${seed.niche}" in "${seed.location.displayName}"`);
  console.log(`   maxVariants: ${seed.maxVariants}\n`);

  const result = await engine.generate(
    seed,
    "smoke-run-1" as import("../src/core/types/common.js").RunID,
    ["google-maps"],
  );

  if (!result.ok) {
    console.error("❌  generate() failed:", result.error);
    process.exit(1);
  }

  const queries: ReadonlyArray<GeneratedQuery> = result.value;
  console.log(`✅  Generated ${queries.length} queries:\n`);

  const byStrategy = new Map<string, number>();
  queries.forEach(q => {
    const last = q.generatedByStrategies[q.generatedByStrategies.length - 1] ?? "seed";
    byStrategy.set(last, (byStrategy.get(last) ?? 0) + 1);
  });

  queries.forEach((q, i) => {
    const strategy = q.generatedByStrategies.join(" → ");
    console.log(`  [${String(i + 1).padStart(2, "0")}] ${q.rawText}`);
    console.log(`       hash: ${q.queryHash.slice(0, 16)}…  via: ${strategy}`);
  });

  console.log("\n  Strategy breakdown:");
  for (const [strat, count] of byStrategy.entries()) {
    console.log(`    ${strat.padEnd(16)} : ${count}`);
  }

  // Verify invariants
  const hashes = queries.map(q => q.queryHash);
  const unique  = new Set(hashes);
  if (unique.size !== hashes.length) {
    console.error("\n❌  INVARIANT FAILED: duplicate queryHashes detected");
    process.exit(1);
  }

  const badLifecycle = queries.filter(q => q.lifecycleState !== "canonicalized");
  if (badLifecycle.length > 0) {
    console.error(`\n❌  INVARIANT FAILED: ${badLifecycle.length} queries not in 'canonicalized' state`);
    process.exit(1);
  }

  console.log("\n✅  All invariants passed");
  console.log("✅  Smoke test complete\n");
}

main().catch(err => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
