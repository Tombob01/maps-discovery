/**
 * @module runtime/bootstrap
 *
 * Composition root -- assembles the full runtime container.
 *
 * Call bootstrap() once at process startup. The returned container
 * exposes everything needed to handle requests and run pipelines.
 * Call container.storage.client.end() for graceful shutdown.
 */

import { env } from "../config/env.js";
import { createStorage } from "./createStorage.js";
import { createServices } from "./createServices.js";
import type { AssembledStorage } from "./createStorage.js";
import type { AssembledServices, QueueConfig } from "./createServices.js";
import type { RuntimeFacade } from "./RuntimeFacade.js";

// ---------------------------------------------------------------------------
// Return shape
// ---------------------------------------------------------------------------

export interface RuntimeContainer {
  readonly storage: AssembledStorage;
  readonly services: AssembledServices;
  /** Stable public API -- preferred entry point for external callers. */
  readonly runtimeFacade: RuntimeFacade;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Assembles the full runtime from environment configuration.
 * No network connections are opened -- the Postgres pool is lazy.
 */
export function bootstrap(): RuntimeContainer {
  const storage = createStorage(env);
  const apiKey = env.ai.groq.apiKey;
  const queueConfig: QueueConfig =
    env.queueBackend === "bullmq"
      ? {
          backend: "bullmq" as const,
          connection: {
            host: env.redis.host,
            port: env.redis.port,
            password: env.redis.password,
            db: env.redis.db,
          },
          options: {
            defaultMaxAttempts: env.bullmq.maxRetries,
            stallIntervalMs: env.bullmq.stallIntervalMs,
          },
        }
      : { backend: "memory" as const };

  const services = createServices(
    storage,
    {
      ...(apiKey !== undefined ? { groqApiKey: apiKey } : {}),
      nominatim: {
        enabled: env.geocoding.nominatim.enabled,
        userAgent: env.geocoding.nominatim.userAgent,
      },
    },
    queueConfig,
  );
  return { storage, services, runtimeFacade: services.runtimeFacade };
}
