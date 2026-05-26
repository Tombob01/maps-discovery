# maps-discovery

Modular, queue-based Google Maps business discovery platform.

**Current scope:** query engine, canonicalization, and test infrastructure.
Scraping, normalization, and export stages are architecturally defined but not
yet implemented.

---

## Table of contents

1. [Required software](#1-required-software)
2. [First-time setup](#2-first-time-setup)
3. [Environment variables](#3-environment-variables)
4. [Database setup](#4-database-setup)
5. [Redis setup](#5-redis-setup)
6. [Daily development workflow](#6-daily-development-workflow)
7. [npm scripts reference](#7-npm-scripts-reference)
8. [Testing](#8-testing)
9. [TypeScript](#9-typescript)
10. [Linting and formatting](#10-linting-and-formatting)
11. [Project structure](#11-project-structure)
12. [Dictionary files](#12-dictionary-files)
13. [VSCode setup](#13-vscode-setup)
14. [Git workflow](#14-git-workflow)
15. [Future integration points](#15-future-integration-points)
16. [Troubleshooting](#16-troubleshooting)

---

## 1. Required software

| Tool               | Required version                       | Purpose                       |
| ------------------ | -------------------------------------- | ----------------------------- |
| **Node.js**        | `20.14.0` (exact)                      | Runtime                       |
| **npm**            | `>=10.2.0`                             | Package manager               |
| **Docker Desktop** | `>=4.25`                               | PostgreSQL + Redis containers |
| **Docker Compose** | `>=2.24` (bundled with Docker Desktop) | Service orchestration         |
| **Git**            | `>=2.40`                               | Version control               |

**Optional but recommended:**

| Tool                           | Purpose                                |
| ------------------------------ | -------------------------------------- |
| **nvm** or **fnm** or **mise** | Node version management                |
| **TablePlus** or **DBeaver**   | PostgreSQL GUI client                  |
| **RedisInsight**               | Redis GUI client                       |
| **VSCode**                     | Editor with full project configuration |

---

## 2. First-time setup

### 2.1 Install Node.js

Use a version manager to install the exact version pinned in `.nvmrc`.

**With nvm (macOS/Linux):**

```bash
# Install nvm if not present
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Restart your shell, then:
nvm install      # reads .nvmrc automatically
nvm use          # activates 20.14.0
node --version   # must print v20.14.0
```

**With fnm (faster, cross-platform):**

```bash
# Install fnm
curl -fsSL https://fnm.vercel.app/install | bash

# Restart your shell, then:
fnm install      # reads .nvmrc
fnm use
node --version   # must print v20.14.0
```

**With mise (polyglot version manager):**

```bash
mise install node@20.14.0
mise use node@20.14.0
```

### 2.2 Clone and install dependencies

```bash
git clone <repo-url> maps-discovery
cd maps-discovery

# Install all dependencies
npm install

# Bootstrap directories, copy .env.example → .env
npm run bootstrap
```

`bootstrap` creates the following directory structure if it doesn't exist:

```
data/
  dictionaries/
    niches/    ← place niche YAML dictionaries here
    geo/       ← place geo YAML dictionaries here
  exports/     ← CSV/JSONL output (git-ignored)
  cache/       ← runtime cache (git-ignored)
migrations/    ← numbered SQL migration files
logs/          ← application logs (git-ignored)
```

### 2.3 Configure environment

```bash
# .env was created by bootstrap — review and edit as needed
nano .env   # or code .env
```

The defaults in `.env` match the Docker Compose service configuration exactly.
No changes are required to get the local stack running.

See [§3 Environment variables](#3-environment-variables) for full documentation.

### 2.4 Start infrastructure services

```bash
npm run docker:up
```

This starts:

- **PostgreSQL 16** on `localhost:5432`
- **Redis 7** on `localhost:6379`
- **Adminer** (PostgreSQL UI) on `http://localhost:8080`

Wait for services to be healthy:

```bash
npm run docker:ps
# postgres: healthy, redis: healthy
```

### 2.5 Verify the setup

```bash
# TypeScript: zero errors
npm run typecheck:all

# Tests: all passing
npm run test

# Build: compiles cleanly
npm run build
```

All three commands should exit `0`.

---

## 3. Environment variables

All variables are documented in `.env.example`. Copy to `.env` and edit:

```bash
cp .env.example .env
```

**Key variables:**

| Variable                       | Default                      | Description          |
| ------------------------------ | ---------------------------- | -------------------- |
| `NODE_ENV`                     | `development`                | Runtime environment  |
| `PG_HOST`                      | `localhost`                  | PostgreSQL host      |
| `PG_PORT`                      | `5432`                       | PostgreSQL port      |
| `PG_DATABASE`                  | `maps_discovery`             | Database name        |
| `PG_USER`                      | `maps_user`                  | Database user        |
| `PG_PASSWORD`                  | `maps_pass_local`            | Database password    |
| `REDIS_HOST`                   | `localhost`                  | Redis host           |
| `REDIS_PORT`                   | `6379`                       | Redis port           |
| `REDIS_PASSWORD`               | `redis_pass_local`           | Redis password       |
| `QUERY_ENGINE_NICHE_DICTS_DIR` | `./data/dictionaries/niches` | Niche YAML directory |
| `QUERY_ENGINE_GEO_DICTS_DIR`   | `./data/dictionaries/geo`    | Geo YAML directory   |
| `LOG_LEVEL`                    | `info`                       | Logging verbosity    |

**Security rules:**

- `.env` is git-ignored and must never be committed
- `.env.example` is committed and is the authoritative reference
- Production secrets must be managed via a secrets manager (not `.env`)

---

## 4. Database setup

The schema is automatically created when the Docker container starts for the
first time via `docker/postgres/init/002_schema.sql`.

### Manual migration (future)

When the schema evolves, add numbered SQL files to `migrations/`:

```
migrations/
  001_initial.sql    ← initial schema (committed as reference)
  002_add_index.sql  ← each change gets a new numbered file
```

Run migrations:

```bash
npm run db:migrate
```

### Inspecting the database

**Via Adminer (browser):**

1. Open `http://localhost:8080`
2. System: `PostgreSQL`
3. Server: `postgres`
4. Username: `maps_user` (from `.env`)
5. Password: `maps_pass_local` (from `.env`)
6. Database: `maps_discovery`

**Via psql:**

```bash
docker exec -it maps_discovery_postgres \
  psql -U maps_user -d maps_discovery
```

**Via VSCode SQLTools:**
The workspace settings pre-configure a connection named
`maps_discovery (local docker)`. Install the SQLTools and SQLTools PostgreSQL
driver extensions, then click the plug icon in the sidebar.

### Reset the database

```bash
# Wipe all data and re-apply schema from scratch
npm run docker:reset
```

---

## 5. Redis setup

Redis requires no manual setup — the Docker container starts configured with:

- Password authentication
- 256MB max memory with LRU eviction
- Persistence (RDB snapshots)

### Inspecting Redis

```bash
# Connect via redis-cli inside the container
docker exec -it maps_discovery_redis \
  redis-cli -a redis_pass_local

# Common commands
KEYS *                   # list all keys
DBSIZE                   # number of keys
FLUSHDB                  # clear current database (use carefully)
```

**Via RedisInsight:** connect to `localhost:6379` with password `redis_pass_local`.

---

## 6. Daily development workflow

### Starting a session

```bash
cd maps-discovery

# Ensure correct Node version
nvm use             # or fnm use / mise use

# Start infrastructure (if not already running)
npm run docker:up
npm run docker:ps   # verify both are healthy
```

### Development loop

```bash
# Run tests in watch mode — re-runs on file save
npm run test:watch

# TypeScript compiler in watch mode — surfaces errors immediately
npm run build:watch
# (run in a second terminal alongside test:watch)
```

### Before committing

```bash
# Run the full CI check locally — identical to what CI runs
npm run ci
```

This runs in order:

1. `typecheck:all` — TypeScript, zero errors required
2. `lint` — ESLint, zero errors required
3. `format:check` — Prettier, zero formatting differences required
4. `test` — Vitest, all tests must pass

Fix any issues before pushing.

### Stopping the session

```bash
npm run docker:down   # stops containers, preserves data volumes
```

---

## 7. npm scripts reference

| Script                    | Description                                      |
| ------------------------- | ------------------------------------------------ |
| `npm run build`           | Compile TypeScript to `dist/`                    |
| `npm run build:watch`     | Compile in watch mode                            |
| `npm run typecheck`       | Type-check `src/` only                           |
| `npm run typecheck:tests` | Type-check `tests/` only                         |
| `npm run typecheck:all`   | Type-check everything                            |
| `npm run lint`            | Run ESLint across `src/` and `tests/`            |
| `npm run lint:fix`        | Run ESLint with auto-fix                         |
| `npm run format`          | Format all files with Prettier                   |
| `npm run format:check`    | Check formatting without writing                 |
| `npm run test`            | Run all tests once                               |
| `npm run test:watch`      | Run tests in watch mode                          |
| `npm run test:ui`         | Open Vitest browser UI                           |
| `npm run test:coverage`   | Run tests with coverage report                   |
| `npm run docker:up`       | Start all Docker services                        |
| `npm run docker:down`     | Stop Docker services                             |
| `npm run docker:reset`    | Wipe volumes and restart                         |
| `npm run docker:logs`     | Tail all service logs                            |
| `npm run docker:ps`       | Show service status                              |
| `npm run bootstrap`       | Create directories, copy `.env.example`          |
| `npm run clean`           | Remove `dist/` and `coverage/`                   |
| `npm run clean:all`       | Remove `dist/`, `coverage/`, `node_modules/`     |
| `npm run ci`              | Full CI check (typecheck + lint + format + test) |

---

## 8. Testing

### Running tests

```bash
npm run test           # run once
npm run test:watch     # watch mode (recommended during development)
npm run test:coverage  # with V8 coverage report
npm run test:ui        # browser UI (visual test explorer)
```

### Test structure

```
tests/
  fixtures/
    dictionaries/      ← YAML files used as test input
      niche-plumbers.yml
      niche-electricians.yml
      geo-nigeria.yml
  helpers/
    builders.ts        ← reusable object factories (no I/O)
    instances.ts       ← pre-wired component instances
  unit/
    core/
      errors.test.ts   ← AppError and all subclasses
      models.test.ts   ← BusinessRecord, Job payloads, etc.
      types.test.ts    ← Result<T>, Option<T>, common types
    query-engine/
      QueryCanonicalizer.test.ts
      QueryBuilder.test.ts
      QueryExpander.test.ts
      QueryEngine.test.ts
      QueryEngineFactory.test.ts
      GeoResolver.test.ts
      ResolvedQueryFactory.test.ts
      lifecycle.test.ts
      strategies.test.ts
      integration.test.ts       ← full pipeline, uses real YAML
      dictionaries/
        DictionaryLoader.test.ts
        DictionaryIndex.test.ts
```

### Writing tests

- Use `tests/helpers/builders.ts` for all object construction
- Use in-memory dictionaries (`makeNicheDictionaryIndex`) for unit tests
- Use `tests/fixtures/dictionaries/` YAML files for integration tests only
- Keep tests deterministic — no randomness, no network, no time-dependent assertions
- Add new fixture YAML files when testing new niche/geo patterns

### Coverage thresholds

Coverage is enforced in CI at:

- Lines: 80%
- Functions: 80%
- Branches: 75%
- Statements: 80%

---

## 9. TypeScript

The project uses TypeScript with the strictest available settings. All flags in
`tsconfig.json` are intentional. Do not relax them without a team discussion.

### Key compiler flags

| Flag                         | Why it's on                                                                              |
| ---------------------------- | ---------------------------------------------------------------------------------------- |
| `strict: true`               | Enables all strict mode checks                                                           |
| `exactOptionalPropertyTypes` | Prevents `field: T \| undefined` being set with `undefined` when `field?: T` is intended |
| `noUncheckedIndexedAccess`   | Array index access returns `T \| undefined`, not `T`                                     |
| `noImplicitOverride`         | Requires `override` keyword — prevents accidental method replacement                     |
| `verbatimModuleSyntax`       | Enforces `import type` for type-only imports                                             |

### Path aliases

Import from module aliases rather than relative paths:

```typescript
// ✓ preferred
import type { BusinessRecord } from "@core/models/BusinessRecord.js";
import { QueryCanonicalizer } from "@query-engine/QueryCanonicalizer.js";

// ✗ avoid
import type { BusinessRecord } from "../../core/models/BusinessRecord.js";
```

Aliases are defined in both `tsconfig.json` (paths) and `vitest.config.ts`
(resolve.alias). Keep both in sync.

### `.js` extensions in imports

All imports from local files must use `.js` extensions even though the source
files are `.ts`. This is required by `"module": "NodeNext"` and Node's native
ESM resolution:

```typescript
import { foo } from "./foo.js"; // ✓ correct
import { foo } from "./foo"; // ✗ will fail at runtime
import { foo } from "./foo.ts"; // ✗ will fail at runtime
```

---

## 10. Linting and formatting

### ESLint

```bash
npm run lint        # check
npm run lint:fix    # auto-fix where possible
```

ESLint is configured via `eslint.config.js` (flat config format). Key rules:

- No `any` — use `unknown` and narrow
- Explicit return types on exported functions
- `import type` for type-only imports
- Import ordering enforced

### Prettier

```bash
npm run format        # format all files
npm run format:check  # check without writing (used in CI)
```

Prettier is the single source of truth for formatting. ESLint handles logic
errors; Prettier handles whitespace. They are configured not to conflict via
`eslint-config-prettier`.

**In VSCode:** files are formatted automatically on save.

---

## 11. Project structure

```
maps-discovery/
├── src/
│   ├── core/                    # Shared domain: models, interfaces, types, errors
│   │   ├── errors/              # AppError and all subclasses
│   │   ├── interfaces/          # IProvider, IQueryEngine, INormalizer, etc.
│   │   ├── models/              # BusinessRecord, GeneratedQuery, Job payloads
│   │   └── types/               # Common, Geo, Pagination, Rate-limit primitives
│   ├── query-engine/            # Query generation and expansion (fully implemented)
│   │   ├── config/              # QueryEngineConfig
│   │   ├── dictionaries/        # YAML loaders and in-memory index
│   │   └── strategies/          # Synonym, Modifier, Plural, Geo strategies
│   ├── providers/               # Discovery providers (not yet implemented)
│   │   └── google-maps/
│   ├── normalizer/              # ProviderResult → BusinessRecord (not yet)
│   ├── deduplicator/            # Dedup strategies (not yet)
│   ├── pipeline/                # Stage workers and coordinator (not yet)
│   │   ├── stages/
│   │   └── workers/
│   ├── queue/                   # BullMQ queue definitions (not yet)
│   ├── storage/                 # PostgreSQL repositories (not yet)
│   ├── exporters/               # CSV/JSON/Postgres export (not yet)
│   ├── cache/                   # Redis abstractions (not yet)
│   ├── config/                  # Runtime config loader (not yet)
│   └── api/                     # Control-plane REST API (not yet)
│
├── tests/
│   ├── fixtures/dictionaries/   # Test YAML dictionaries
│   ├── helpers/                 # builders.ts, instances.ts
│   └── unit/                    # Test files mirroring src/ structure
│
├── data/                        # Runtime data (git-ignored contents)
│   ├── dictionaries/            # Production YAML files (these ARE committed)
│   └── exports/                 # Output files (git-ignored)
│
├── docker/
│   └── postgres/init/           # SQL files run on first container start
│
├── migrations/                  # Numbered SQL migration files
├── scripts/                     # Developer utilities
│
├── .env.example                 # Environment variable reference (committed)
├── .env                         # Local secrets (git-ignored)
├── docker-compose.yml
├── tsconfig.json
├── tsconfig.test.json
├── vitest.config.ts
├── eslint.config.js
├── .prettierrc.json
└── .gitignore
```

---

## 12. Dictionary files

Query expansion is driven by YAML dictionary files. These are committed to the
repository under `data/dictionaries/`.

### Niche dictionary format

`data/dictionaries/niches/niche-plumbers.yml`:

```yaml
version: 1
niche: plumbers
terms:
  - term: plumber
    synonyms:
      - plumbing contractor
      - pipefitter
      - drainage specialist
    modifiers:
      - emergency
      - residential
      - commercial
      - licensed
    plural: plumbers
    singular: plumber
```

### Geo dictionary format

`data/dictionaries/geo/geo-nigeria.yml`:

```yaml
version: 1
country: Nigeria
countryCode: NG
regions:
  - name: Lagos
    type: state
    aliases:
      - Lagos State
    subLocations:
      - name: Victoria Island
        type: district
        aliases:
          - VI
```

Validation errors in dictionary files are caught at startup and produce a
clear error message with the file path and offending field.

---

## 13. VSCode setup

### Install recommended extensions

1. Open the project in VSCode
2. Press `Cmd+Shift+P` → `Extensions: Show Recommended Extensions`
3. Install all recommendations

Key extensions:

- **ESLint** — inline lint errors
- **Prettier** — format on save
- **Vitest** — run/debug tests from the sidebar
- **SQLTools** — query PostgreSQL from the editor
- **GitLens** — enhanced git integration

### Workspace settings

`.vscode/settings.json` is committed and configures:

- Format on save with Prettier
- ESLint auto-fix on save
- TypeScript workspace SDK (uses local `node_modules/typescript`)
- Rulers at 100 characters
- SQLTools connection to local Docker postgres

### Debugging

Four debug configurations are available in `.vscode/launch.json`:

- **Debug: current test file** — run the open test file in the debugger
- **Debug: all tests** — run the full test suite with breakpoints
- **Debug: discovery worker** — run the worker with `.env` loaded
- **Debug: query engine smoke** — run `scripts/smoke-query-engine.ts`

Set breakpoints and press `F5` with the desired configuration selected.

---

## 14. Git workflow

### First-time initialization (new repository)

```bash
cd maps-discovery
git init
git add .
git commit -m "chore: initial project structure"
git branch -M main
git remote add origin <repo-url>
git push -u origin main
```

### Branch naming

```
feat/add-google-maps-provider
fix/canonicalizer-punctuation-strip
chore/upgrade-typescript-55
docs/update-geo-dictionary-format
refactor/normalizer-address-rules
test/add-dedup-strategy-coverage
```

### Commit message format (Conventional Commits)

```
<type>(<scope>): <description>

feat(query-engine):  add autocomplete harvesting strategy interface
fix(canonicalizer):  preserve hyphens in brand names during normalisation
test(strategies):    add geo strategy alias confidence tests
chore(deps):         upgrade playwright to 1.45.0
docs(dictionaries):  document geo YAML schema validation rules
refactor(core):      rename generatedBy to generatedByStrategies
```

Types: `feat`, `fix`, `test`, `chore`, `docs`, `refactor`, `perf`, `ci`

### Pre-commit check

Run before every commit:

```bash
npm run ci
```

Consider installing `husky` to run this automatically:

```bash
npm install -D husky
npx husky init
echo "npm run ci" > .husky/pre-commit
```

---

## 15. Future integration points

These modules are architecturally defined (interfaces exist in `src/core/`)
but not yet implemented. When implementing each:

### Playwright (browser automation)

```bash
npm install playwright          # already in optionalDependencies
npx playwright install chromium # download browser binaries
```

Implement: `src/providers/google-maps/GoogleMapsProvider.ts`
Interface: `src/core/interfaces/IProvider.ts`

### BullMQ (job queues)

Already in `dependencies`. Queue definitions go in `src/queue/queues/`.
Workers go in `src/pipeline/workers/`.
Interface: `src/core/interfaces/IPipelineStage.ts`

### Distributed workers

Add a `WORKER_CONCURRENCY` env variable and a worker bootstrap script.
The `ScrapingPolicy` and `RateLimitConfig` types in `src/core/types/rate-limit.ts`
are pre-designed for this.

### Proxy rotation

Add a `ProxyConfig` to `ScrapingPolicy`. The `IBrowserProvider` interface
accepts a `BrowserConfig` which can carry proxy settings.

### AI expansion strategy

Implement `IExpansionStrategy` and register via `additionalStrategies` in
`createQueryEngine()`. No changes to existing code required.

---

## 16. Troubleshooting

### `docker:up` fails with "port already in use"

```bash
# Find what is using port 5432
lsof -i :5432

# Find what is using port 6379
lsof -i :6379
```

Stop the conflicting process or change the port in `docker-compose.yml` and
update `PG_PORT` / `REDIS_PORT` in `.env`.

### `npm run test` fails with "Cannot find module"

```bash
# Ensure node_modules are installed
npm install

# Verify Node version
node --version  # must be v20.14.0
nvm use         # switch if needed
```

### PostgreSQL "authentication failed"

Ensure `.env` values match `docker-compose.yml`. If you changed the password
after the container was created, reset it:

```bash
npm run docker:reset   # wipes the volume, recreates with new credentials
```

### TypeScript errors after pulling new code

```bash
npm install              # pick up new/changed packages
npm run clean            # clear stale build output
npm run typecheck:all    # verify
```

### Dictionary files not found

Ensure `QUERY_ENGINE_NICHE_DICTS_DIR` and `QUERY_ENGINE_GEO_DICTS_DIR` in
`.env` point to directories containing `.yml` files. The loader returns an
empty index (not an error) for empty or missing directories.

```bash
ls data/dictionaries/niches/   # should list .yml files
ls data/dictionaries/geo/      # should list .yml files
```
