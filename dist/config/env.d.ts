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
import type { output as ZOutput, input as ZInput } from "zod";
declare const EnvSchema: import("zod").ZodObject<{
    NODE_ENV: import("zod").ZodDefault<import("zod").ZodEnum<["development", "test", "production"]>>;
    DATABASE_URL: import("zod").ZodOptional<import("zod").ZodString>;
    PG_HOST: import("zod").ZodDefault<import("zod").ZodString>;
    PG_PORT: import("zod").ZodDefault<import("zod").ZodNumber>;
    PG_DATABASE: import("zod").ZodDefault<import("zod").ZodString>;
    PG_USER: import("zod").ZodDefault<import("zod").ZodString>;
    PG_PASSWORD: import("zod").ZodDefault<import("zod").ZodString>;
    PG_POOL_MIN: import("zod").ZodDefault<import("zod").ZodNumber>;
    PG_POOL_MAX: import("zod").ZodDefault<import("zod").ZodNumber>;
    PG_IDLE_TIMEOUT_MS: import("zod").ZodDefault<import("zod").ZodNumber>;
    PG_CONNECTION_TIMEOUT_MS: import("zod").ZodDefault<import("zod").ZodNumber>;
    PG_LOG_QUERIES: import("zod").ZodDefault<import("zod").ZodEnum<["none", "slow", "all"]>>;
    PG_SLOW_QUERY_THRESHOLD_MS: import("zod").ZodDefault<import("zod").ZodNumber>;
    REDIS_URL: import("zod").ZodOptional<import("zod").ZodString>;
    REDIS_HOST: import("zod").ZodDefault<import("zod").ZodString>;
    REDIS_PORT: import("zod").ZodDefault<import("zod").ZodNumber>;
    REDIS_PASSWORD: import("zod").ZodDefault<import("zod").ZodString>;
    REDIS_DB: import("zod").ZodDefault<import("zod").ZodNumber>;
    REDIS_CONNECT_TIMEOUT_MS: import("zod").ZodDefault<import("zod").ZodNumber>;
    REDIS_COMMAND_TIMEOUT_MS: import("zod").ZodDefault<import("zod").ZodNumber>;
    REDIS_MAX_RETRIES: import("zod").ZodDefault<import("zod").ZodNumber>;
    BULLMQ_DISCOVERY_RATE_LIMIT_MAX: import("zod").ZodDefault<import("zod").ZodNumber>;
    BULLMQ_DISCOVERY_RATE_LIMIT_DURATION_MS: import("zod").ZodDefault<import("zod").ZodNumber>;
    BULLMQ_DISCOVERY_CONCURRENCY: import("zod").ZodDefault<import("zod").ZodNumber>;
    BULLMQ_STALL_INTERVAL_MS: import("zod").ZodDefault<import("zod").ZodNumber>;
    BULLMQ_MAX_RETRIES: import("zod").ZodDefault<import("zod").ZodNumber>;
    QUERY_ENGINE_NICHE_DICTS_DIR: import("zod").ZodDefault<import("zod").ZodString>;
    QUERY_ENGINE_GEO_DICTS_DIR: import("zod").ZodDefault<import("zod").ZodString>;
    QUERY_ENGINE_DEFAULT_MAX_VARIANTS: import("zod").ZodDefault<import("zod").ZodNumber>;
    QUERY_ENGINE_DEFAULT_STRATEGIES: import("zod").ZodDefault<import("zod").ZodString>;
    PLAYWRIGHT_HEADLESS: import("zod").ZodDefault<import("zod").ZodEffects<import("zod").ZodEnum<["true", "false", "1", "0", "yes", "no"]>, boolean, "0" | "true" | "false" | "1" | "yes" | "no">>;
    PLAYWRIGHT_SLOW_MO_MS: import("zod").ZodDefault<import("zod").ZodNumber>;
    PLAYWRIGHT_TIMEOUT_MS: import("zod").ZodDefault<import("zod").ZodNumber>;
    PLAYWRIGHT_LOCALE: import("zod").ZodDefault<import("zod").ZodString>;
    PLAYWRIGHT_TIMEZONE: import("zod").ZodDefault<import("zod").ZodString>;
    LOG_LEVEL: import("zod").ZodDefault<import("zod").ZodEnum<["trace", "debug", "info", "warn", "error", "fatal", "silent"]>>;
    LOG_FORMAT: import("zod").ZodDefault<import("zod").ZodEnum<["pretty", "json"]>>;
    LOG_STACK_TRACES: import("zod").ZodDefault<import("zod").ZodEffects<import("zod").ZodEnum<["true", "false", "1", "0", "yes", "no"]>, boolean, "0" | "true" | "false" | "1" | "yes" | "no">>;
    EXPORT_OUTPUT_DIR: import("zod").ZodDefault<import("zod").ZodString>;
}, "strip", import("zod").ZodTypeAny, {
    NODE_ENV: "development" | "test" | "production";
    PG_HOST: string;
    PG_PORT: number;
    PG_DATABASE: string;
    PG_USER: string;
    PG_PASSWORD: string;
    PG_POOL_MIN: number;
    PG_POOL_MAX: number;
    PG_IDLE_TIMEOUT_MS: number;
    PG_CONNECTION_TIMEOUT_MS: number;
    PG_LOG_QUERIES: "none" | "slow" | "all";
    PG_SLOW_QUERY_THRESHOLD_MS: number;
    REDIS_HOST: string;
    REDIS_PORT: number;
    REDIS_PASSWORD: string;
    REDIS_DB: number;
    REDIS_CONNECT_TIMEOUT_MS: number;
    REDIS_COMMAND_TIMEOUT_MS: number;
    REDIS_MAX_RETRIES: number;
    BULLMQ_DISCOVERY_RATE_LIMIT_MAX: number;
    BULLMQ_DISCOVERY_RATE_LIMIT_DURATION_MS: number;
    BULLMQ_DISCOVERY_CONCURRENCY: number;
    BULLMQ_STALL_INTERVAL_MS: number;
    BULLMQ_MAX_RETRIES: number;
    QUERY_ENGINE_NICHE_DICTS_DIR: string;
    QUERY_ENGINE_GEO_DICTS_DIR: string;
    QUERY_ENGINE_DEFAULT_MAX_VARIANTS: number;
    QUERY_ENGINE_DEFAULT_STRATEGIES: string;
    PLAYWRIGHT_HEADLESS: boolean;
    PLAYWRIGHT_SLOW_MO_MS: number;
    PLAYWRIGHT_TIMEOUT_MS: number;
    PLAYWRIGHT_LOCALE: string;
    PLAYWRIGHT_TIMEZONE: string;
    LOG_LEVEL: "trace" | "debug" | "info" | "warn" | "error" | "fatal" | "silent";
    LOG_FORMAT: "pretty" | "json";
    LOG_STACK_TRACES: boolean;
    EXPORT_OUTPUT_DIR: string;
    DATABASE_URL?: string | undefined;
    REDIS_URL?: string | undefined;
}, {
    NODE_ENV?: "development" | "test" | "production" | undefined;
    DATABASE_URL?: string | undefined;
    PG_HOST?: string | undefined;
    PG_PORT?: number | undefined;
    PG_DATABASE?: string | undefined;
    PG_USER?: string | undefined;
    PG_PASSWORD?: string | undefined;
    PG_POOL_MIN?: number | undefined;
    PG_POOL_MAX?: number | undefined;
    PG_IDLE_TIMEOUT_MS?: number | undefined;
    PG_CONNECTION_TIMEOUT_MS?: number | undefined;
    PG_LOG_QUERIES?: "none" | "slow" | "all" | undefined;
    PG_SLOW_QUERY_THRESHOLD_MS?: number | undefined;
    REDIS_URL?: string | undefined;
    REDIS_HOST?: string | undefined;
    REDIS_PORT?: number | undefined;
    REDIS_PASSWORD?: string | undefined;
    REDIS_DB?: number | undefined;
    REDIS_CONNECT_TIMEOUT_MS?: number | undefined;
    REDIS_COMMAND_TIMEOUT_MS?: number | undefined;
    REDIS_MAX_RETRIES?: number | undefined;
    BULLMQ_DISCOVERY_RATE_LIMIT_MAX?: number | undefined;
    BULLMQ_DISCOVERY_RATE_LIMIT_DURATION_MS?: number | undefined;
    BULLMQ_DISCOVERY_CONCURRENCY?: number | undefined;
    BULLMQ_STALL_INTERVAL_MS?: number | undefined;
    BULLMQ_MAX_RETRIES?: number | undefined;
    QUERY_ENGINE_NICHE_DICTS_DIR?: string | undefined;
    QUERY_ENGINE_GEO_DICTS_DIR?: string | undefined;
    QUERY_ENGINE_DEFAULT_MAX_VARIANTS?: number | undefined;
    QUERY_ENGINE_DEFAULT_STRATEGIES?: string | undefined;
    PLAYWRIGHT_HEADLESS?: "0" | "true" | "false" | "1" | "yes" | "no" | undefined;
    PLAYWRIGHT_SLOW_MO_MS?: number | undefined;
    PLAYWRIGHT_TIMEOUT_MS?: number | undefined;
    PLAYWRIGHT_LOCALE?: string | undefined;
    PLAYWRIGHT_TIMEZONE?: string | undefined;
    LOG_LEVEL?: "trace" | "debug" | "info" | "warn" | "error" | "fatal" | "silent" | undefined;
    LOG_FORMAT?: "pretty" | "json" | undefined;
    LOG_STACK_TRACES?: "0" | "true" | "false" | "1" | "yes" | "no" | undefined;
    EXPORT_OUTPUT_DIR?: string | undefined;
}>;
export type RawEnv = ZInput<typeof EnvSchema>;
export type ParsedEnv = ZOutput<typeof EnvSchema>;
export interface AppConfig {
    readonly env: "development" | "test" | "production";
    readonly pg: {
        readonly connectionString: string | undefined;
        readonly host: string;
        readonly port: number;
        readonly database: string;
        readonly user: string;
        readonly password: string;
        readonly pool: {
            readonly min: number;
            readonly max: number;
            readonly idleTimeoutMs: number;
            readonly connectionTimeoutMs: number;
        };
        readonly logging: {
            readonly level: "none" | "slow" | "all";
            readonly slowThresholdMs: number;
        };
    };
    readonly redis: {
        readonly url: string | undefined;
        readonly host: string;
        readonly port: number;
        readonly password: string;
        readonly db: number;
        readonly connectTimeoutMs: number;
        readonly commandTimeoutMs: number;
        readonly maxRetries: number;
    };
    readonly bullmq: {
        readonly discovery: {
            readonly rateLimitMax: number;
            readonly rateLimitDurationMs: number;
            readonly concurrency: number;
        };
        readonly stallIntervalMs: number;
        readonly maxRetries: number;
    };
    readonly queryEngine: {
        readonly nicheDictionariesDir: string;
        readonly geoDictionariesDir: string;
        readonly defaultMaxVariants: number;
        readonly defaultStrategyIds: readonly string[];
    };
    readonly playwright: {
        readonly headless: boolean;
        readonly slowMoMs: number;
        readonly timeoutMs: number;
        readonly locale: string;
        readonly timezoneId: string;
    };
    readonly logging: {
        readonly level: string;
        readonly format: "pretty" | "json";
        readonly stackTraces: boolean;
    };
    readonly export: {
        readonly outputDir: string;
    };
}
/**
 * Returns the validated application configuration.
 *
 * On first call, parses `process.env` against the schema.
 * Subsequent calls return the cached result.
 *
 * Throws `EnvValidationError` if any variable fails validation.
 * This is intentional — a misconfigured app should refuse to start.
 */
export declare function getConfig(): AppConfig;
/**
 * Lazily-evaluated singleton — the standard import for all application code.
 *
 * @example
 * import { env } from "../config/env.js";
 * const pool = new Pool({ host: env.pg.host, port: env.pg.port });
 */
export declare const env: AppConfig;
/**
 * Resets the cached config. Only for use in tests.
 * @internal
 */
export declare function _resetConfigCache(): void;
export declare class EnvValidationError extends Error {
    constructor(message: string);
}
export {};
//# sourceMappingURL=env.d.ts.map