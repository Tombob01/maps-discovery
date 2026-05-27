/**
 * @module runtime/createServices
 *
 * Assembles application services from storage dependencies.
 *
 * Wiring order:
 *   AssembledStorage
 *   -> RunLifecycleService  (uses storage-layer IRunStore + IRecordStore)
 *   -> InMemoryRawResultStore (bridges provider output -> normalization input)
 *   -> RunCoordinator       (owns full run lifecycle execution)
 *   -> RunService           (uses RunService-layer adapters + exporters)
 *
 * createServices() is a pure composition function:
 *   - No DB calls.
 *   - No singletons or globals.
 *   - Safe to call multiple times (e.g. in tests with different storage mocks).
 *
 * To execute a run end-to-end:
 *   1. services.runService.createRun(req)        -> persists pending Run
 *   2. enqueue NormalizationJobPayloads onto services.normalizationQueue
 *   3. services.coordinator.execute(runId)        -> drains queue, persists records
 */

import { RunLifecycleService } from "../storage/RunLifecycleService.js";
import { InMemoryRawResultStore } from "../storage/InMemoryRawResultStore.js";
import { RunCoordinator } from "../pipeline/RunCoordinator.js";
import { InMemoryQueue } from "../queue/InMemoryQueue.js";
import { RunService } from "../api/RunService.js";
import { JsonLinesExporter } from "../exporters/JsonLinesExporter.js";
import { CsvExporter } from "../exporters/CsvExporter.js";
import { BusinessNormalizer } from "../normalizer/BusinessNormalizer.js";
import { GoogleMapsProviderMapper } from "../normalizer/GoogleMapsProviderMapper.js";
import type { IExporter } from "../exporters/IExporter.js";
import type { NormalizationJobPayload } from "../core/models/Job.js";
import type { IQueue } from "../queue/IQueue.js";
import type { AssembledStorage } from "./createStorage.js";

export interface AssembledServices {
  readonly lifecycle: RunLifecycleService;
  readonly rawResultStore: InMemoryRawResultStore;
  readonly normalizationQueue: IQueue<NormalizationJobPayload>;
  readonly coordinator: RunCoordinator;
  readonly runService: RunService;
}

export function createServices(
  storage: AssembledStorage,
  overrides: {
    exporters?: Map<string, IExporter>;
    normalizationQueue?: IQueue<NormalizationJobPayload>;
  } = {},
): AssembledServices {
  const lifecycle = new RunLifecycleService(
    storage.runStore,
    storage.recordStore,
  );

  const rawResultStore = new InMemoryRawResultStore();

  const normalizationQueue: IQueue<NormalizationJobPayload> =
    overrides.normalizationQueue ??
    new InMemoryQueue<NormalizationJobPayload>("normalization");

  const normalizer = new BusinessNormalizer([new GoogleMapsProviderMapper()]);

  const coordinator = new RunCoordinator(
    lifecycle,
    normalizer,
    normalizationQueue,
    {
      fetchRawResult: (id) => rawResultStore.fetch(id),
    },
  );

  const noopWrite: (
    dest: string,
    content: string,
  ) => Promise<void> = async () => {};
  const exporters: Map<string, IExporter> =
    overrides.exporters ??
    new Map<string, IExporter>([
      ["jsonl", new JsonLinesExporter(noopWrite)],
      ["csv", new CsvExporter(noopWrite)],
    ]);

  const runService = new RunService(
    storage.runServiceStore,
    storage.recordServiceStore,
    exporters,
  );

  return {
    lifecycle,
    rawResultStore,
    normalizationQueue,
    coordinator,
    runService,
  };
}
