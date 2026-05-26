#!/usr/bin/env node
/**
 * scripts/bootstrap.js
 *
 * Creates all required runtime directories and copies .env.example → .env
 * if .env does not already exist.
 *
 * Run automatically after npm install via package.json "prepare" script,
 * or manually with: npm run bootstrap
 *
 * Safe to run multiple times — all operations are idempotent.
 */

"use strict";

const fs   = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Directories to create
// ---------------------------------------------------------------------------

const DIRS = [
  // Runtime data (git-ignored contents, but directory structure is committed)
  "data/dictionaries/niches",
  "data/dictionaries/geo",
  "data/exports",
  "data/cache",

  // Migration files (committed SQL)
  "migrations",

  // Future packages (scaffold in advance so imports don't break)
  "src/providers/google-maps",
  "src/normalizer/rules",
  "src/normalizer/mappers",
  "src/deduplicator/strategies",
  "src/pipeline/stages",
  "src/pipeline/workers",
  "src/queue/queues",
  "src/queue/events",
  "src/storage/repositories",
  "src/exporters/base",
  "src/cache",
  "src/config",
  "src/api/routes",

  // Test fixtures
  "tests/fixtures/dictionaries",
  "tests/fixtures/queries",
  "tests/helpers",
  "tests/integration",

  // Logs directory
  "logs",
];

// ---------------------------------------------------------------------------
// Placeholder files to ensure git tracks otherwise-empty directories
// ---------------------------------------------------------------------------

const GITKEEP_DIRS = [
  "data/exports",
  "data/cache",
  "logs",
  "src/providers/google-maps",
  "src/normalizer/rules",
  "src/pipeline/workers",
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

let created = 0;
let skipped = 0;

console.log("🔧 maps-discovery bootstrap\n");

// Create directories
for (const dir of DIRS) {
  const fullPath = path.join(ROOT, dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
    console.log(`  ✓ created  ${dir}`);
    created++;
  } else {
    skipped++;
  }
}

// Write .gitkeep in otherwise-empty runtime directories
for (const dir of GITKEEP_DIRS) {
  const keepFile = path.join(ROOT, dir, ".gitkeep");
  if (!fs.existsSync(keepFile)) {
    fs.writeFileSync(keepFile, "");
  }
}

// Copy .env.example → .env if .env does not exist
const envExample = path.join(ROOT, ".env.example");
const envFile    = path.join(ROOT, ".env");

if (!fs.existsSync(envFile) && fs.existsSync(envExample)) {
  fs.copyFileSync(envExample, envFile);
  console.log("\n  ✓ created  .env  (copied from .env.example)");
  console.log("  ⚠️  Review .env and update any values before starting services.");
} else if (fs.existsSync(envFile)) {
  console.log("\n  ✓ .env already exists — skipped");
}

console.log(`\n  ${created} directories created, ${skipped} already present.`);
console.log("\n✅ Bootstrap complete.\n");
console.log("Next steps:");
console.log("  1. npm run docker:up        — start PostgreSQL and Redis");
console.log("  2. npm run typecheck:all    — verify TypeScript");
console.log("  3. npm run test             — run test suite");
console.log("  4. npm run build            — compile to dist/\n");
