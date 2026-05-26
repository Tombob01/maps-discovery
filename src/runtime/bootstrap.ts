/**
 * @module runtime/bootstrap
 *
 * Composition root � assembles the full runtime container.
 *
 * Call bootstrap() once at process startup. The returned container
 * exposes everything needed to handle requests and run pipelines.
 * Call container.storage.client.end() for graceful shutdown.
 */

import { env } from "../config/env.js";
import { createStorage } from "./createStorage.js";
import { createServices } from "./createServices.js";
import type { AssembledStorage } from "./createStorage.js";
import type { AssembledServices } from "./createServices.js";

// ---------------------------------------------------------------------------
// Return shape
// ---------------------------------------------------------------------------

export interface RuntimeContainer {
  readonly storage: AssembledStorage;
  readonly services: AssembledServices;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Assembles the full runtime from environment configuration.
 * No network connections are opened � the Postgres pool is lazy.
 */
export function bootstrap(): RuntimeContainer {
  const storage = createStorage(env);
  const services = createServices(storage);
  return { storage, services };
}
