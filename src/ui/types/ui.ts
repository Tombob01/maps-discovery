// â”€â”€â”€ Domain value types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type RunStatus = 'pending' | 'running' | 'complete' | 'failed';
export type ExportFormat = 'csv' | 'jsonl';
export type FlowStep = 'expand' | 'select' | 'run' | 'results';
export type EventLevel = 'info' | 'ok' | 'warn' | 'err';

// â”€â”€â”€ RuntimeFacade shapes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type ExpansionStrategy = 'commercial' | 'discovery' | 'geographic';

export interface ExpandedSuggestion {
  keyword: string;
  strategy: ExpansionStrategy;
}

export interface ExpansionResponse {
  original: string;
  suggestions: ExpandedSuggestion[];
}

export interface ExpandKeywordParams {
  keyword: string;
  location?: string;
  limit?: number;
  strategy?: ExpansionStrategy;
}

export interface CreateRunParams {
  niche: string;
  location: string;
}

export interface CreateRunResult {
  runId: string;
}

/** Minimal seed shape the UI passes to executeRun.
 *  The backend resolves niche + location into a ResolvedQuery via QueryEngine. */
export interface UIResolvedQuery {
  niche: string;
  location: string;
}

export interface ExecuteRunParams {
  provider: string;
  runId: string;
  query: UIResolvedQuery;
  /** All selected keywords from Step 1 - first entry is the seed keyword */
  keywords: ExpandedSuggestion[];
}

export interface DiscoveryStats {
  resultsFound: number;
  pagesScraped: number;
}

export interface NormalizationStats {
  processed: number;
  failed: number;
}

export interface ExecutionSummary {
  discovery: DiscoveryStats;
  normalization: NormalizationStats;
}

export interface RunStats {
  discovered: number;
  normalized: number;
  failed: number;
}

export interface Run {
  id: string;
  status: RunStatus;
  stats: RunStats;
  currentSeed?: string | null;
}

export interface BusinessRecord {
  name: string;
  phone: string;
  rating: string;
  reviews: string;
  address: string;
  website: string;
  category: string;
}

// â”€â”€â”€ Facade interface â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface IRuntimeFacade {
  expandKeyword(params: ExpandKeywordParams): Promise<ExpansionResponse>;
  createRun(params: CreateRunParams): Promise<CreateRunResult>;
  executeRun(params: ExecuteRunParams): Promise<ExecutionSummary>;
  getRun(runId: string): Promise<Run>;
  listRecords(runId: string): Promise<BusinessRecord[]>;
  exportRun(runId: string, format: ExportFormat): Promise<void>;
}

// â”€â”€â”€ UI state types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type Phase = 'idle' | 'loading' | 'done' | 'error';

export interface EventEntry {
  time: string;
  msg: string;
  level: EventLevel;
}

export interface DiscoveryFlowState {
  step: FlowStep;
  phase: Phase;
  keyword: string;
  location: string;
  suggestions: ExpandedSuggestion[];
  selectedKeywords: ExpandedSuggestion[];
  expansionStrategy: ExpansionStrategy;
  runId: string | null;
  runStatus: RunStatus;
  progress: number;
  events: EventEntry[];
  records: BusinessRecord[];
  stats: RunStats | null;
  error: string | null;
  exportPhase: Phase;
  exportError: string | null;
  currentSeed: string | null;
  isPollingStalled: boolean;
}

// â”€â”€â”€ Mock facade (for development / Storybook) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Components never import this directly. DiscoveryPage uses it as the default
// prop value. Swap for a real HTTP client by passing facade={realClient}.

const MOCK_SUGGESTIONS: string[] = [
  'plumbers in Austin',
  'emergency plumber Austin TX',
  'licensed plumbing contractor Austin',
  'drain cleaning Austin',
  'water heater repair Austin',
  'residential plumber Austin',
  'commercial plumbing Austin',
  'Austin plumbing services 24hr',
];

const MOCK_RECORDS: BusinessRecord[] = [
  { name: 'Austin Plumbing Co.', phone: '(512) 555-0101', rating: '4.8', reviews: '312', address: '1200 S Lamar Blvd, Austin TX', website: 'austinplumbing.com', category: 'Plumber' },
  { name: 'FlowRight Plumbers',  phone: '(512) 555-0182', rating: '4.6', reviews: '198', address: '876 W 6th St, Austin TX',      website: 'flowrightplumbers.com', category: 'Plumber' },
  { name: 'Drain Masters ATX',   phone: '(512) 555-0234', rating: '4.5', reviews: '87',  address: '450 E Oltorf St, Austin TX',   website: 'drainmastersatx.com', category: 'Drain cleaning' },
  { name: 'Capitol Pipe & Drain',phone: '(512) 555-0309', rating: '4.7', reviews: '254', address: '2100 Manor Rd, Austin TX',     website: 'capitolpipe.com', category: 'Plumber' },
  { name: 'Pro Plumb ATX',       phone: '(512) 555-0411', rating: '4.4', reviews: '62',  address: '3300 Bee Cave Rd, Austin TX',  website: 'proplumbatx.com', category: 'Plumber' },
];

function delay<T>(ms: number, value: T): Promise<T> {
  return new Promise(resolve => setTimeout(() => resolve(value), ms));
}

export const mockFacade: IRuntimeFacade = {
  expandKeyword({ keyword, location, limit = 8 }) {
    const loc = location ?? 'Austin TX';
    const suggestions = MOCK_SUGGESTIONS
      .slice(0, limit)
      .map(s => ({ keyword: s.replace(/Austin( TX)?/g, loc), strategy: 'commercial' as ExpansionStrategy }));
    return delay(1400, { original: keyword, suggestions });
  },

  createRun(_params) {
    const runId = 'run_' + Math.random().toString(36).slice(2, 8);
    return delay(600, { runId });
  },

  executeRun(_params) {
    return delay(2200, {
      discovery: { resultsFound: MOCK_RECORDS.length, pagesScraped: 3 },
      normalization: { processed: MOCK_RECORDS.length, failed: 0 },
    });
  },

  getRun(runId) {
    return delay(300, {
      id: runId,
      status: 'complete' as RunStatus,
      stats: { discovered: MOCK_RECORDS.length, normalized: MOCK_RECORDS.length, failed: 0 },
    });
  },

  listRecords(_runId) {
    return delay(500, [...MOCK_RECORDS]);
  },

  exportRun(_runId: string, _format: ExportFormat) {
    return delay(800, undefined as void);
  },
};



