/**
 * @module runtime/createServices
 */

import { RunLifecycleService } from "../storage/RunLifecycleService.js";
import type { IRawResultStore } from "../storage/IRawResultStore.js";
import { RunCoordinator } from "../pipeline/RunCoordinator.js";
import { InMemoryQueue } from "../queue/InMemoryQueue.js";
import { BullMQQueue } from "../queue/BullMQQueue.js";
import type { BullMQQueueConnection, BullMQQueueOptions } from "../queue/BullMQQueue.js";
import { RunService } from "../api/RunService.js";
import { JsonLinesExporter } from "../exporters/JsonLinesExporter.js";
import { CsvExporter } from "../exporters/CsvExporter.js";
import { BusinessNormalizer } from "../normalizer/BusinessNormalizer.js";
import { GoogleMapsProviderMapper } from "../normalizer/GoogleMapsProviderMapper.js";
import { ProposalBuilder } from "../normalizer/ProposalBuilder.js";
import { PostgresProposalRepository } from "../storage/PostgresProposalRepository.js";
import { ProposalOrchestrator } from "../proposal/ProposalOrchestrator.js";
import { ProposalProductionStage } from "../pipeline/ProposalProductionStage.js";
import { ProposalProductionCoordinator } from "../pipeline/ProposalProductionCoordinator.js";
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
  NominatimGeoResolver,
} from "../query-engine/index.js";
import { resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import type { IProvider } from "../core/interfaces/IProvider.js";
import type { IExporter } from "../exporters/IExporter.js";
import type { NormalizationJobPayload, ProposalProductionJobPayload } from "../core/models/Job.js";
import type { IQueue } from "../queue/IQueue.js";
import type { AssembledStorage } from "./createStorage.js";
import type { IKeywordExpansionProvider } from "../ai/IKeywordExpansionProvider.js";
import type { QueryEngine } from "../query-engine/QueryEngine.js";
import type { IGeoResolver } from "../core/interfaces/IQueryEngine.js";

export interface QueueConfig {
  readonly backend: "memory" | "bullmq";
  readonly connection?: BullMQQueueConnection;
  readonly options?: BullMQQueueOptions;
}

export interface AssembledServices {
  readonly lifecycle: RunLifecycleService;
  readonly rawResultStore: IRawResultStore;
  readonly normalizationQueue: IQueue<NormalizationJobPayload>;
  readonly proposalProductionQueue: IQueue<ProposalProductionJobPayload>;
  readonly proposalProductionStage: ProposalProductionStage;
  readonly proposalProductionCoordinator: ProposalProductionCoordinator;
  readonly coordinator: RunCoordinator;
  readonly runService: RunService;
  readonly createDiscoveryRunner: (provider: IProvider) => DiscoveryRunner;
  readonly runtimeExecutor: RuntimeExecutor;
  readonly expansionService: KeywordExpansionService;
  readonly queryEngine: QueryEngine;
  readonly geoResolver: IGeoResolver;
  readonly resolvedQueryFactory: ResolvedQueryFactory;
  readonly runtimeFacade: RuntimeFacade;
  /**
   * Releases any resources held by constructed services. A no-op for
   * implementations with nothing to release (e.g. InMemoryQueue); calls
   * close() on the normalization queue if it exposes one (e.g. a future
   * Redis/BullMQ-backed implementation).
   */
  readonly shutdown: () => Promise<void>;
}

export function createServices(
  storage: AssembledStorage,
  overrides: {
    exporters?: Map<string, IExporter>;
    normalizationQueue?: IQueue<NormalizationJobPayload>;
    expansionProvider?: IKeywordExpansionProvider;
    groqApiKey?: string;
    staticCoordinates?: Readonly<Record<string, { lat: number; lng: number }>>;
    nominatim?: { enabled: boolean; userAgent: string };
  } = {},
  queueConfig?: QueueConfig,
): AssembledServices {
  const lifecycle = new RunLifecycleService(storage.runStore, storage.recordStore);
  const rawResultStore: IRawResultStore = storage.rawResultStore;
  const normalizationQueue: IQueue<NormalizationJobPayload> =
    overrides.normalizationQueue ?? createDefaultNormalizationQueue(queueConfig);
  const normalizer = new BusinessNormalizer([new GoogleMapsProviderMapper()]);
  const proposalBuilder = new ProposalBuilder([new GoogleMapsProviderMapper()]);
  const proposalStore = new PostgresProposalRepository(storage.client);
  const proposalOrchestrator = new ProposalOrchestrator(
    rawResultStore,
    proposalBuilder,
    proposalStore,
  );
  const proposalProductionStage = new ProposalProductionStage(proposalOrchestrator);
  const proposalProductionQueue: IQueue<ProposalProductionJobPayload> =
    new InMemoryQueue<ProposalProductionJobPayload>("proposal-production");
  const proposalProductionCoordinator = new ProposalProductionCoordinator(
    proposalProductionQueue,
    proposalProductionStage,
  );
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
  const createDiscoveryRunner = (provider: IProvider): DiscoveryRunner => {
    return new DiscoveryRunner(provider, rawResultStore, normalizationQueue, proposalProductionQueue);
  };
  const runtimeExecutor = new RuntimeExecutor(createDiscoveryRunner, coordinator);

  const expansionProvider: IKeywordExpansionProvider =
    overrides.expansionProvider ??
    (overrides.groqApiKey
      ? new GroqKeywordExpansionProvider(overrides.groqApiKey)
      : new NoopKeywordExpansionProvider());

  const expansionService = new KeywordExpansionService(expansionProvider);

  // -- Query engine ----------------------------------------------------------
  const __dirname = fileURLToPath(new URL(".", import.meta.url));
  const dictionariesBase = resolvePath(
    __dirname,
    "../query-engine/dictionaries",
  );
  const queryEngineConfig = buildQueryEngineConfig({
    nicheDictionariesDir: dictionariesBase,
    geoDictionariesDir: dictionariesBase,
  });

  // Build the geo resolver once and share it with both QueryEngine and
  // RuntimeFacade so both resolution call sites behave identically.
  const nominatimOpts = overrides.nominatim;
  const geoResolver: IGeoResolver =
    nominatimOpts?.enabled === true
      ? new NominatimGeoResolver(queryEngineConfig.geoResolver, {
          userAgent: nominatimOpts.userAgent,
        })
      : new PassthroughGeoResolver(queryEngineConfig.geoResolver);

  const assembled = createQueryEngine({
    config: queryEngineConfig,
    geoResolver,
    ...(overrides.staticCoordinates !== undefined
      ? { staticCoordinates: overrides.staticCoordinates }
      : {}),
  });
  const queryEngine = assembled.engine;
  const resolvedQueryFactory = new ResolvedQueryFactory();

  const runtimeFacade = new RuntimeFacade(
    runService,
    runtimeExecutor,
    expansionService,
    queryEngine,
    geoResolver,
    resolvedQueryFactory,
  );

  const shutdown = async (): Promise<void> => {
    if (hasClose(normalizationQueue)) {
      await normalizationQueue.close();
    }
  };

  return {
    lifecycle, rawResultStore, normalizationQueue, coordinator,
    proposalProductionQueue, proposalProductionStage, proposalProductionCoordinator,
    runService, createDiscoveryRunner, runtimeExecutor,
    expansionService, queryEngine, geoResolver, resolvedQueryFactory,
    runtimeFacade, shutdown,
  };
}

function createDefaultNormalizationQueue(
  queueConfig?: QueueConfig,
): IQueue<NormalizationJobPayload> {
  if (queueConfig?.backend === "bullmq" && queueConfig.connection !== undefined) {
    return new BullMQQueue<NormalizationJobPayload>(
      "normalization",
      queueConfig.connection,
      queueConfig.options ?? {},
    );
  }
  return new InMemoryQueue<NormalizationJobPayload>("normalization");
}

function hasClose(q: unknown): q is { close: () => Promise<void> } {
  return (
    typeof q === "object" &&
    q !== null &&
    "close" in q &&
    typeof (q as { close?: unknown }).close === "function"
  );
}



