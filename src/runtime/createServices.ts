/**
 * @module runtime/createServices
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
import { RuntimeFacade } from "./RuntimeFacade.js";
import { KeywordExpansionService } from "../ai/KeywordExpansionService.js";
import { GroqKeywordExpansionProvider } from "../ai/GroqKeywordExpansionProvider.js";
import { NoopKeywordExpansionProvider } from "../ai/NoopKeywordExpansionProvider.js";
import {
  createQueryEngine,
  buildQueryEngineConfig,
  PassthroughGeoResolver,
  ResolvedQueryFactory,
} from "../query-engine/index.js";
import { resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import type { IProvider } from "../core/interfaces/IProvider.js";
import type { IExporter } from "../exporters/IExporter.js";
import type { NormalizationJobPayload } from "../core/models/Job.js";
import type { IQueue } from "../queue/IQueue.js";
import type { AssembledStorage } from "./createStorage.js";
import type { IKeywordExpansionProvider } from "../ai/IKeywordExpansionProvider.js";
import type { QueryEngine } from "../query-engine/QueryEngine.js";

export interface AssembledServices {
  readonly lifecycle: RunLifecycleService;
  readonly rawResultStore: InMemoryRawResultStore;
  readonly normalizationQueue: IQueue<NormalizationJobPayload>;
  readonly coordinator: RunCoordinator;
  readonly runService: RunService;
  readonly createDiscoveryRunner: (provider: IProvider) => DiscoveryRunner;
  readonly runtimeExecutor: RuntimeExecutor;
  readonly expansionService: KeywordExpansionService;
  readonly queryEngine: QueryEngine;
  readonly geoResolver: PassthroughGeoResolver;
  readonly resolvedQueryFactory: ResolvedQueryFactory;
  readonly runtimeFacade: RuntimeFacade;
}

export function createServices(
  storage: AssembledStorage,
  overrides: {
    exporters?: Map<string, IExporter>;
    normalizationQueue?: IQueue<NormalizationJobPayload>;
    expansionProvider?: IKeywordExpansionProvider;
    groqApiKey?: string;
    staticCoordinates?: Readonly<Record<string, { lat: number; lng: number }>>;
  } = {},
): AssembledServices {
  const lifecycle = new RunLifecycleService(storage.runStore, storage.recordStore);
  const rawResultStore = new InMemoryRawResultStore();
  const normalizationQueue: IQueue<NormalizationJobPayload> =
    overrides.normalizationQueue ?? new InMemoryQueue<NormalizationJobPayload>("normalization");
  const normalizer = new BusinessNormalizer([new GoogleMapsProviderMapper()]);
  const coordinator = new RunCoordinator(lifecycle, normalizer, normalizationQueue, {
    fetchRawResult: (id) => rawResultStore.fetch(id),
  });
  const noopWrite: (dest: string, content: string) => Promise<void> = async () => {};
  const exporters: Map<string, IExporter> =
    overrides.exporters ??
    new Map<string, IExporter>([
      ["jsonl", new JsonLinesExporter(noopWrite)],
      ["csv", new CsvExporter(noopWrite)],
    ]);
  const runService = new RunService(storage.runServiceStore, storage.recordServiceStore, exporters);
  const createDiscoveryRunner = (provider: IProvider): DiscoveryRunner =>
    new DiscoveryRunner(provider, rawResultStore, normalizationQueue);
  const runtimeExecutor = new RuntimeExecutor(createDiscoveryRunner, coordinator);

  const expansionProvider: IKeywordExpansionProvider =
    overrides.expansionProvider ??
    (overrides.groqApiKey
      ? new GroqKeywordExpansionProvider(overrides.groqApiKey)
      : new NoopKeywordExpansionProvider());

  const expansionService = new KeywordExpansionService(expansionProvider);

  // ── Query engine ──────────────────────────────────────────────────────────
  // Dictionary directories sit at <project-root>/src/query-engine/dictionaries.
  // We derive the path from the URL of this module so it works regardless of
  // where the process is launched from.
  const __dirname = fileURLToPath(new URL(".", import.meta.url));
  const dictionariesBase = resolvePath(
    __dirname,
    "../query-engine/dictionaries",
  );
  const queryEngineConfig = buildQueryEngineConfig({
    nicheDictionariesDir: dictionariesBase,
    geoDictionariesDir: dictionariesBase,
  });
  const assembled = createQueryEngine({
    config: queryEngineConfig,
    ...(overrides.staticCoordinates !== undefined
      ? { staticCoordinates: overrides.staticCoordinates }
      : {}),
  });
  const queryEngine = assembled.engine;
  const geoResolver = new PassthroughGeoResolver(
    queryEngineConfig.geoResolver,
  );
  const resolvedQueryFactory = new ResolvedQueryFactory();

  const runtimeFacade = new RuntimeFacade(
    runService,
    runtimeExecutor,
    expansionService,
    queryEngine,
    geoResolver,
    resolvedQueryFactory,
  );

  return {
    lifecycle, rawResultStore, normalizationQueue, coordinator,
    runService, createDiscoveryRunner, runtimeExecutor,
    expansionService, queryEngine, geoResolver, resolvedQueryFactory,
    runtimeFacade,
  };
}