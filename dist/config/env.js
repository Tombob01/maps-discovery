/**
 * @module config/env
 *
 * Typed, validated runtime configuration loaded from environment variables.
 *
 * This is the ONLY place in the application that reads `process.env`.
 * All other modules import from this file rather than reading env vars directly.
 *
 * Validation rules:
 *   - All required variables must be present and non-empty at startup.
 *   - Numeric variables are coerced and range-checked.
 *   - Unknown variables are ignored (permissive for forward-compatibility).
 *   - Validation errors are collected and reported together, not one-at-a-time.
 *
 * Usage:
 *   import { env } from "../config/env.js";
 *   console.log(env.pg.host);
 *
 * Loading .env:
 *   Call loadEnv() once at application startup before importing anything
 *   that depends on env. For scripts: `import "./config/env.js"` at the top.
 */
import { resolve } from "node:path";
import { string as zString, coerce as zCoerce, enum as zEnum, object as zObject, } from "zod";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const nonEmptyString = zString().trim().min(1);
const positiveInt = zCoerce.number().int().positive();
const nonNegativeInt = zCoerce.number().int().min(0);
const portNumber = zCoerce.number().int().min(1).max(65535);
const booleanString = zEnum(["true", "false", "1", "0", "yes", "no"])
    .transform((v) => v === "true" || v === "1" || v === "yes");
// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const EnvSchema = zObject({
    // ── Runtime ──────────────────────────────────────────────────────────────
    NODE_ENV: zEnum(["development", "test", "production"]).default("development"),
    // ── PostgreSQL ───────────────────────────────────────────────────────────
    DATABASE_URL: nonEmptyString.optional(),
    PG_HOST: nonEmptyString.default("localhost"),
    PG_PORT: portNumber.default(5432),
    PG_DATABASE: nonEmptyString.default("maps_discovery"),
    PG_USER: nonEmptyString.default("maps_user"),
    PG_PASSWORD: nonEmptyString.default("maps_pass_local"),
    PG_POOL_MIN: nonNegativeInt.default(2),
    PG_POOL_MAX: positiveInt.default(10),
    PG_IDLE_TIMEOUT_MS: positiveInt.default(30_000),
    PG_CONNECTION_TIMEOUT_MS: positiveInt.default(5_000),
    PG_LOG_QUERIES: zEnum(["none", "slow", "all"]).default("none"),
    PG_SLOW_QUERY_THRESHOLD_MS: positiveInt.default(500),
    // ── Redis ────────────────────────────────────────────────────────────────
    REDIS_URL: nonEmptyString.optional(),
    REDIS_HOST: nonEmptyString.default("localhost"),
    REDIS_PORT: portNumber.default(6379),
    REDIS_PASSWORD: nonEmptyString.default("redis_pass_local"),
    REDIS_DB: nonNegativeInt.default(0),
    REDIS_CONNECT_TIMEOUT_MS: positiveInt.default(5_000),
    REDIS_COMMAND_TIMEOUT_MS: positiveInt.default(3_000),
    REDIS_MAX_RETRIES: positiveInt.default(3),
    // ── BullMQ ───────────────────────────────────────────────────────────────
    BULLMQ_DISCOVERY_RATE_LIMIT_MAX: positiveInt.default(2),
    BULLMQ_DISCOVERY_RATE_LIMIT_DURATION_MS: positiveInt.default(60_000),
    BULLMQ_DISCOVERY_CONCURRENCY: positiveInt.default(1),
    BULLMQ_STALL_INTERVAL_MS: positiveInt.default(30_000),
    BULLMQ_MAX_RETRIES: positiveInt.default(5),
    // ── Query engine ─────────────────────────────────────────────────────────
    QUERY_ENGINE_NICHE_DICTS_DIR: nonEmptyString.default("./data/dictionaries/niches"),
    QUERY_ENGINE_GEO_DICTS_DIR: nonEmptyString.default("./data/dictionaries/geo"),
    QUERY_ENGINE_DEFAULT_MAX_VARIANTS: positiveInt.default(20),
    QUERY_ENGINE_DEFAULT_STRATEGIES: nonEmptyString.default("synonym,modifier,plural,geo"),
    // ── Playwright ───────────────────────────────────────────────────────────
    PLAYWRIGHT_HEADLESS: booleanString.default(true),
    PLAYWRIGHT_SLOW_MO_MS: nonNegativeInt.default(150),
    PLAYWRIGHT_TIMEOUT_MS: positiveInt.default(30_000),
    PLAYWRIGHT_LOCALE: nonEmptyString.default("en-US"),
    PLAYWRIGHT_TIMEZONE: nonEmptyString.default("Africa/Lagos"),
    // ── Logging ──────────────────────────────────────────────────────────────
    LOG_LEVEL: zEnum(["trace", "debug", "info", "warn", "error", "fatal", "silent"]).default("info"),
    LOG_FORMAT: zEnum(["pretty", "json"]).default("pretty"),
    LOG_STACK_TRACES: booleanString.default(true),
    // ── Export ───────────────────────────────────────────────────────────────
    EXPORT_OUTPUT_DIR: nonEmptyString.default("./data/exports"),
});
// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------
let _config;
// ---------------------------------------------------------------------------
// Config builder
// ---------------------------------------------------------------------------
function buildConfig(parsed) {
    const root = resolve(process.cwd());
    return {
        env: parsed.NODE_ENV,
        pg: {
            connectionString: parsed.DATABASE_URL,
            host: parsed.PG_HOST,
            port: parsed.PG_PORT,
            database: parsed.PG_DATABASE,
            user: parsed.PG_USER,
            password: parsed.PG_PASSWORD,
            pool: {
                min: parsed.PG_POOL_MIN,
                max: parsed.PG_POOL_MAX,
                idleTimeoutMs: parsed.PG_IDLE_TIMEOUT_MS,
                connectionTimeoutMs: parsed.PG_CONNECTION_TIMEOUT_MS,
            },
            logging: {
                level: parsed.PG_LOG_QUERIES,
                slowThresholdMs: parsed.PG_SLOW_QUERY_THRESHOLD_MS,
            },
        },
        redis: {
            url: parsed.REDIS_URL,
            host: parsed.REDIS_HOST,
            port: parsed.REDIS_PORT,
            password: parsed.REDIS_PASSWORD,
            db: parsed.REDIS_DB,
            connectTimeoutMs: parsed.REDIS_CONNECT_TIMEOUT_MS,
            commandTimeoutMs: parsed.REDIS_COMMAND_TIMEOUT_MS,
            maxRetries: parsed.REDIS_MAX_RETRIES,
        },
        bullmq: {
            discovery: {
                rateLimitMax: parsed.BULLMQ_DISCOVERY_RATE_LIMIT_MAX,
                rateLimitDurationMs: parsed.BULLMQ_DISCOVERY_RATE_LIMIT_DURATION_MS,
                concurrency: parsed.BULLMQ_DISCOVERY_CONCURRENCY,
            },
            stallIntervalMs: parsed.BULLMQ_STALL_INTERVAL_MS,
            maxRetries: parsed.BULLMQ_MAX_RETRIES,
        },
        queryEngine: {
            nicheDictionariesDir: resolve(root, parsed.QUERY_ENGINE_NICHE_DICTS_DIR),
            geoDictionariesDir: resolve(root, parsed.QUERY_ENGINE_GEO_DICTS_DIR),
            defaultMaxVariants: parsed.QUERY_ENGINE_DEFAULT_MAX_VARIANTS,
            defaultStrategyIds: Object.freeze(parsed.QUERY_ENGINE_DEFAULT_STRATEGIES
                .split(",")
                .map(s => s.trim())
                .filter(s => s.length > 0)),
        },
        playwright: {
            headless: parsed.PLAYWRIGHT_HEADLESS,
            slowMoMs: parsed.PLAYWRIGHT_SLOW_MO_MS,
            timeoutMs: parsed.PLAYWRIGHT_TIMEOUT_MS,
            locale: parsed.PLAYWRIGHT_LOCALE,
            timezoneId: parsed.PLAYWRIGHT_TIMEZONE,
        },
        logging: {
            level: parsed.LOG_LEVEL,
            format: parsed.LOG_FORMAT,
            stackTraces: parsed.LOG_STACK_TRACES,
        },
        export: {
            outputDir: resolve(root, parsed.EXPORT_OUTPUT_DIR),
        },
    };
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Returns the validated application configuration.
 *
 * On first call, parses `process.env` against the schema.
 * Subsequent calls return the cached result.
 *
 * Throws `EnvValidationError` if any variable fails validation.
 * This is intentional — a misconfigured app should refuse to start.
 */
export function getConfig() {
    if (_config !== undefined)
        return _config;
    const result = EnvSchema.safeParse(process.env);
    if (!result.success) {
        const issues = result.error.issues
            .map(i => `  ${i.path.join(".")}: ${i.message}`)
            .join("\n");
        throw new EnvValidationError(`Environment validation failed:\n${issues}\n\nCheck .env.example for required variables.`);
    }
    _config = buildConfig(result.data);
    return _config;
}
/**
 * Lazily-evaluated singleton — the standard import for all application code.
 *
 * @example
 * import { env } from "../config/env.js";
 * const pool = new Pool({ host: env.pg.host, port: env.pg.port });
 */
export const env = new Proxy({}, {
    get(_target, prop) {
        return getConfig()[prop];
    },
});
/**
 * Resets the cached config. Only for use in tests.
 * @internal
 */
export function _resetConfigCache() {
    _config = undefined;
}
// ---------------------------------------------------------------------------
// EnvValidationError
// ---------------------------------------------------------------------------
export class EnvValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = "EnvValidationError";
        Object.setPrototypeOf(this, EnvValidationError.prototype);
    }
}
//# sourceMappingURL=env.js.map