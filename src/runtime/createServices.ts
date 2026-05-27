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
 *   -> DiscoveryRunner factory (createDiscoveryRunner — provider injected at call time)
 *   -> RuntimeExecutor      (orchestrates discovery + normalization end-to-end)
 *
 * createServices() is a pure composition function:
 *   - No DB calls.
 *   - No singletons or globals.
 *   - Safe to call multiple times (e.g. in tests with different storage mocks).
 *
 * To execute a run end-to-end:
 *   1. services.runService.createRun(req)
 *   2. await services.runtimeExecutor.execute({ provider, runId, query })
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
import { DiscoveryRunner } from "./DiscoveryRunner.js";
import { RuntimeExecutor } from "./RuntimeExecutor.js";
import type { IProvider } from "../core/interfaces/IProvider.js";
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
  /** Factory: inject a provider to get a ready-to-use DiscoveryRunner. */
  readonly createDiscoveryRunner: (provider: IProvider) => DiscoveryRunner;
  /** Orchestrates discovery + normalization end-to-end for a single run. */
  readonly runtimeExecutor: RuntimeExecutor;
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

  const noopWrite: (dest: string, content: string) => Promise<void> =
    async () => {};
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

  const createDiscoveryRunner = (provider: IProvider): DiscoveryRunner =>
    new DiscoveryRunner(provider, rawResultStore, normalizationQueue);

  const runtimeExecutor = new RuntimeExecutor(createDiscoveryRunner, coordinator);

  return {
    lifecycle,
    rawResultStore,
    normalizationQueue,
    coordinator,
    runService,
    createDiscoveryRunner,
    runtimeExecutor,
  };
}