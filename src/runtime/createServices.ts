/**
 * @module runtime/createServices
 *
 * Assembles application services from storage dependencies.
 *
 * Wiring order:
 *   AssembledStorage
 *   ? RunLifecycleService  (uses storage-layer IRunStore + IRecordStore)
 *   ? RunService           (uses RunService-layer adapters + exporters)
 */

import { RunLifecycleService } from "../storage/RunLifecycleService.js";
import { RunService } from "../api/RunService.js";
import { JsonLinesExporter } from "../exporters/JsonLinesExporter.js";
import { CsvExporter } from "../exporters/CsvExporter.js";
import type { IExporter } from "../exporters/IExporter.js";
import type { AssembledStorage } from "./createStorage.js";

// ---------------------------------------------------------------------------
// Return shape
// ---------------------------------------------------------------------------

export interface AssembledServices {
  readonly lifecycle: RunLifecycleService;
  readonly runService: RunService;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Instantiates RunLifecycleService and RunService from assembled storage.
 * Exporters default to JsonLines + CSV writing to the filesystem.
 * Pass custom exporters for testing or alternative output targets.
 */
export function createServices(
  storage: AssembledStorage,
  exporters?: Map<string, IExporter>,
): AssembledServices {
  const lifecycle = new RunLifecycleService(
    storage.runStore,
    storage.recordStore,
  );

  const noopWrite: (
    dest: string,
    content: string,
  ) => Promise<void> = async () => {};
  const defaultExporters: Map<string, IExporter> =
    exporters ??
    new Map<string, IExporter>([
      ["jsonl", new JsonLinesExporter(noopWrite)],
      ["csv", new CsvExporter(noopWrite)],
    ]);

  const runService = new RunService(
    storage.runServiceStore,
    storage.recordServiceStore,
    defaultExporters,
  );

  return { lifecycle, runService };
}
