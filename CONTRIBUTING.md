# Contributing to maps-discovery

Welcome. This document covers everything a new developer needs to know to
contribute effectively to this project.

Read this alongside `README.md` (setup) and the source code itself (which is
extensively commented).

---

## Table of contents

1. [Architecture overview](#1-architecture-overview)
2. [Module boundaries](#2-module-boundaries)
3. [Core conventions](#3-core-conventions)
4. [Adding a new niche dictionary](#4-adding-a-new-niche-dictionary)
5. [Adding a new geo dictionary](#5-adding-a-new-geo-dictionary)
6. [Adding a new expansion strategy](#6-adding-a-new-expansion-strategy)
7. [Adding a new provider (future)](#7-adding-a-new-provider-future)
8. [Writing tests](#8-writing-tests)
9. [Database changes](#9-database-changes)
10. [Pull request checklist](#10-pull-request-checklist)
11. [What not to do](#11-what-not-to-do)

---

## 1. Architecture overview

The system is a staged pipeline. Each stage is independent and communicates
only through queues (BullMQ) and the database (PostgreSQL). Stages never
call each other directly.

```
QuerySeed
  │
  ▼
[query:generate]  → QueryBuilder + QueryExpander → GeneratedQuery[]
  │
  ▼
[query:expand]    → IExpansionStrategy[] → variant GeneratedQuery[]
  │
  ▼
[discovery]       → IProvider.discover() → ProviderResult[]
  │
  ▼
[normalization]   → INormalizer → BusinessRecord[]
  │
  ▼
[deduplication]   → IDeduplicator → unique BusinessRecord[]
  │
  ▼
[export]          → IExporter → CSV / JSON / PostgreSQL
```

**Currently implemented:** query generation, canonicalization, and expansion
(`src/core/`, `src/query-engine/`). All other stages have interfaces defined
but no implementation.

---

## 2. Module boundaries

These boundaries are enforced and must not be violated:

| Module          | May import                    | Must NOT import                     |
| --------------- | ----------------------------- | ----------------------------------- |
| `core/`         | Nothing                       | Everything else                     |
| `query-engine/` | `core/`                       | providers, db, queues               |
| `providers/`    | `core/`                       | query-engine, normalizer, exporters |
| `normalizer/`   | `core/`                       | providers, queues, db               |
| `deduplicator/` | `core/`, `storage/`           | providers, exporters                |
| `pipeline/`     | All above, `queue/`           | Business logic                      |
| `exporters/`    | `core/` (BusinessRecord only) | Providers, queues                   |
| `storage/`      | `core/`                       | Business logic                      |
| `queue/`        | `core/`, Redis                | Application logic                   |

**The rule:** data flows downward through the pipeline. No stage may import
a module from a stage that comes after it.

---

## 3. Core conventions

### TypeScript

- **No `any`** — use `unknown` and narrow with type guards or Zod
- **No non-null assertions (`!`)** — narrow the type instead
- **`import type`** for all type-only imports — `verbatimModuleSyntax` enforces this
- **`.js` extension** in all local imports — required by NodeNext module resolution
- **Explicit return types** on all exported functions
- **`Result<T, E>`** for fallible operations — never throw from library code
- **`Object.freeze()`** on all returned domain objects from factories

### File naming

- `PascalCase.ts` for classes and interfaces
- `camelCase.ts` for utilities and helpers
- `index.ts` for barrel exports only — no logic in barrel files

### Error handling

All errors extend `AppError` (in `src/core/errors/BaseError.ts`). Each module
has its own error class. Never use raw `Error` for domain errors.

```typescript
// ✓ correct
throw new QueryEngineError({ code: "INVALID_SEED", message: "niche is empty" });

// ✗ wrong
throw new Error("niche is empty");
```

For functions that can fail without being exceptional (expected failures like
"not found"), return `Result<T, E>` instead of throwing:

```typescript
// ✓ correct — caller handles both paths
function resolve(
  target: GeoTarget,
): Promise<Result<ResolvedGeoTarget, GeoResolutionError>>;

// ✗ wrong — forces caller to catch
function resolve(target: GeoTarget): Promise<ResolvedGeoTarget>; // throws on failure
```

---

## 4. Adding a new niche dictionary

1. Create `data/dictionaries/niches/niche-<name>.yml`
2. Follow the schema in `schemas/niche-dictionary.schema.json`
3. Add at least: one `term`, some `synonyms`, some `modifiers`
4. Add `plural` and `singular` if the term has meaningful forms
5. Add a test fixture to `tests/fixtures/dictionaries/` if needed for new tests

**Minimal example:**

```yaml
version: 1
niche: accountants
terms:
  - term: accountant
    synonyms:
      - accounting firm
      - chartered accountant
      - CPA
    modifiers:
      - certified
      - local
      - small business
    plural: accountants
    singular: accountant
```

The dictionary is loaded at startup. No code changes are required.

---

## 5. Adding a new geo dictionary

1. Create `data/dictionaries/geo/geo-<country>.yml`
2. Follow the schema in `schemas/geo-dictionary.schema.json`
3. Use ISO 3166-1 alpha-2 for `countryCode`
4. Add `subLocations` for any city/region with distinct areas

**Minimal example:**

```yaml
version: 1
country: Kenya
countryCode: KE
regions:
  - name: Nairobi
    type: city
    aliases: []
    subLocations:
      - name: Westlands
        type: district
        aliases: []
      - name: Karen
        type: district
        aliases: []
```

---

## 6. Adding a new expansion strategy

Expansion strategies are the primary extension point. New strategies plug in
through `IExpansionStrategy` without modifying existing code.

### Steps

1. Create `src/query-engine/strategies/YourStrategy.ts`
2. Extend `BaseExpansionStrategy`
3. Implement `_apply(query, context): ReadonlyArray<StrategyCandidate>`
4. Choose a unique `id` string (e.g. `"autocomplete"`, `"ai-semantic"`)
5. Register via `createQueryEngine({ additionalStrategies: [new YourStrategy()] })`
6. Write tests in `tests/unit/query-engine/strategies.test.ts`

### Template

```typescript
import type {
  GeneratedQuery,
  ExpansionContext,
} from "../../core/models/Query.js";
import {
  BaseExpansionStrategy,
  type StrategyCandidate,
} from "./BaseExpansionStrategy.js";

export class YourExpansionStrategy extends BaseExpansionStrategy {
  override readonly id = "your-strategy-id" as const;
  override readonly description = "What this strategy does";

  protected override _apply(
    query: GeneratedQuery,
    context: ExpansionContext,
  ): ReadonlyArray<StrategyCandidate> {
    // Generate variants here.
    // - context.maxNew: how many you may return (enforced by base class)
    // - context.existingVariants: strings already produced (dedup handled by base)
    // - this._meta({ sourceTerm, confidence, parentQueryHash }): build metadata
    return [
      {
        rawText: `your variant ${query.rawText}`,
        metadata: this._meta({
          confidence: 0.8,
          parentQueryHash: query.queryHash,
        }),
      },
    ];
  }
}
```

### Future built-in strategies planned

These will follow the same pattern:

| ID                    | Description                                  |
| --------------------- | -------------------------------------------- |
| `autocomplete`        | Harvests provider autocomplete suggestions   |
| `ai-semantic`         | Calls an LLM for semantic variant generation |
| `competitor-keywords` | Mines keywords from competitor listings      |
| `trending`            | Uses search trend data for keyword weighting |

---

## 7. Adding a new provider (future)

Providers implement `IProvider` (or `IBrowserProvider` for Playwright-based).

1. Create `src/providers/<name>/`
2. Implement `IProvider` from `src/core/interfaces/IProvider.ts`
3. Implement `IProviderMapper` to map raw DOM/API output to `RawFields`
4. Register the provider in `src/pipeline/PipelineCoordinator.ts`
5. Add provider config to `.env.example`

The query engine generates queries with `providerId` matching your provider's
`IProvider.id`. Queries are only dispatched to the matching provider.

---

## 8. Writing tests

### Unit tests

- One test file per source file, mirroring the `src/` structure under `tests/unit/`
- Use `tests/helpers/builders.ts` for all object construction — never `new` domain objects directly in tests
- Use in-memory dictionary indexes (`makeNicheDictionaryIndex`) — never the filesystem
- No network calls, no randomness, no time-dependent assertions

### Integration tests

- Lives in `tests/unit/query-engine/integration.test.ts`
- Uses real YAML from `tests/fixtures/dictionaries/`
- Uses `StaticCoordinateGeoResolver` — never `PassthroughGeoResolver` in integration tests
  (it would hit the network in a real resolver scenario)
- `beforeAll` for expensive setup, not `beforeEach`

### What to test

For any new code, test:

1. **Happy path** — does it produce the expected output?
2. **Edge cases** — empty input, zero results, null fields
3. **Budget enforcement** — `maxNew` is never exceeded
4. **Deduplication** — same input twice doesn't produce duplicates
5. **Error paths** — does it return `Err(...)` or throw in the right cases?
6. **Immutability** — are returned objects frozen?

### Test naming

```typescript
describe("ComponentName", () => {
  describe("methodName()", () => {
    it("returns X when Y", () => { ... });
    it("returns Err(CODE) when Z", () => { ... });
    it("does not mutate the input", () => { ... });
  });
});
```

---

## 9. Database changes

Never edit migration files that have already been applied. Always add a new file.

```bash
# Create the next migration
touch migrations/002_add_geo_index.sql
```

Write the migration as idempotent SQL (`IF NOT EXISTS`, `IF EXISTS` guards).

Test the migration:

```bash
npm run docker:reset   # fresh database
npm run db:migrate     # apply all migrations
```

Update `docker/postgres/init/002_schema.sql` to keep it in sync with the
cumulative schema (used for fresh container starts only).

---

## 10. Pull request checklist

Before opening a PR, run locally:

```bash
npm run ci
# ✓ typecheck:all
# ✓ lint
# ✓ format:check
# ✓ test
```

Also verify:

- [ ] New functionality has corresponding tests
- [ ] Test coverage hasn't dropped below thresholds
- [ ] New environment variables are documented in `.env.example`
- [ ] Database changes have a migration file
- [ ] Dictionary schema changes update `schemas/`
- [ ] Public API changes update `README.md` if relevant
- [ ] Commit messages follow Conventional Commits format
- [ ] No `console.log` left in `src/` — use the logger

---

## 11. What not to do

These are the most common mistakes. Avoid them.

**Don't add logic to `src/core/`**
The core package contains only types, interfaces, and error classes. Zero
runtime logic. If you're writing a function in `src/core/`, it belongs
elsewhere.

**Don't import across module boundaries**
`src/query-engine/` may not import from `src/providers/`. Check the
[Module boundaries](#2-module-boundaries) table before adding any import.

**Don't throw from library functions**
Use `Result<T, E>`. Throwing forces callers to use try/catch and breaks the
type-safe error handling pattern the whole codebase follows.

**Don't put niche logic inside providers**
Providers receive `ResolvedQuery` and yield `ProviderResult`. They don't know
what a "plumber" is. Niche logic belongs in the query engine.

**Don't skip the `.js` extension**
`import { foo } from "./foo"` will fail at runtime with NodeNext module
resolution. Always: `import { foo } from "./foo.js"`.

**Don't use `any`**
If you can't type something, use `unknown` and write a type guard, or use
`zod` to parse it. `any` disables the type system for everyone who touches
that value downstream.

**Don't commit `.env`**
`.env` is git-ignored for good reason. Secrets committed to git are
compromised secrets. Use `.env.example` to document variables.
