/**
 * @module ui/lib/httpClient
 * Implements IRuntimeFacade via fetch() against the Hono HTTP server.
 *
 * Maps between the UI's simplified types and the backend's richer shapes.
 * No business logic — pure adapter.
 */

import type {
  IRuntimeFacade,
  ExpandKeywordParams,
  ExpansionResponse,
  CreateRunParams,
  CreateRunResult,
  ExecuteRunParams,
  ExecutionSummary,
  Run,
  BusinessRecord,
} from '../types/ui';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const API_BASE: string = (import.meta as any).env?.['VITE_API_BASE'] ?? 'http://localhost:3001';

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ---------------------------------------------------------------------------
// Helper: fetch + parse + throw on non-2xx
// ---------------------------------------------------------------------------

interface ApiOkResponse<T> {
  ok: true;
  data: T;
}

interface ApiErrResponse {
  ok: false;
  error: { code: string; message: string };
}

type ApiResult<T> = ApiOkResponse<T> | ApiErrResponse;

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const body = (await res.json()) as ApiResult<T>;

  if (!body.ok) {
    throw new ApiError(body.error.code, body.error.message, res.status);
  }

  return body.data;
}

// ---------------------------------------------------------------------------
// Backend response shapes (richer than UI types — mapped below)
// ---------------------------------------------------------------------------

interface BackendExpandedKeyword {
  keyword: string;
  popularity: string;
  category: string;
}

interface BackendExpansionResponse {
  original: string;
  suggestions: BackendExpandedKeyword[];
}

interface BackendRun {
  id: string;
  status: string;
  niche: string;
  location: string;
  startedAt: string;
  completedAt: string | null;
  stats: {
    queriesGenerated: number;
    queriesDispatched: number;
    rawResultsFound: number;
    recordsNormalized: number;
    recordsUnique: number;
    recordsDuplicate: number;
    recordsExported: number;
    errors: number;
  };
}

interface BackendRecord {
  id: string;
  name: string;
  phone: string | null;
  normalizedPhone: string | null;
  website: string | null;
  city: string | null;
  country: string | null;
  primaryCategory: string | null;
  rating: number | null;
  sourceProvider: string;
}

interface BackendRecordPage {
  items: BackendRecord[];
  total: number;
  page: number;
  hasMore: boolean;
}

interface BackendExecutionSummary {
  discovery: { resultsSaved: number; jobsEnqueued: number };
  normalization: {
    queriesGenerated: number;
    queriesDispatched: number;
    rawResultsFound: number;
    recordsNormalized: number;
    recordsUnique: number;
    recordsDuplicate: number;
    recordsExported: number;
    errors: number;
  };
}

// ---------------------------------------------------------------------------
// Mappers: backend → UI types
// ---------------------------------------------------------------------------

function toUISuggestions(backend: BackendExpansionResponse): ExpansionResponse {
  return {
    original: backend.original,
    // UI expects string[] — extract just the keyword string
    suggestions: backend.suggestions.map((s) => s.keyword),
  };
}

function toUIRun(backend: BackendRun): Run {
  return {
    id: backend.id,
    status: backend.status as Run['status'],
    stats: {
      discovered: backend.stats.rawResultsFound,
      normalized: backend.stats.recordsNormalized,
      failed: backend.stats.errors,
    },
  };
}

function toUIRecord(backend: BackendRecord): BusinessRecord {
  return {
    name: backend.name,
    phone: backend.phone ?? '',
    rating: backend.rating != null ? String(backend.rating) : '',
    reviews: '',
    address: [backend.city, backend.country].filter(Boolean).join(', '),
    website: backend.website ?? '',
    category: backend.primaryCategory ?? '',
  };
}

function toUIExecutionSummary(backend: BackendExecutionSummary): ExecutionSummary {
  return {
    discovery: {
      resultsFound: backend.discovery.resultsSaved,
      pagesScraped: 0,
    },
    normalization: {
      processed: backend.normalization.recordsNormalized,
      failed: backend.normalization.errors,
    },
  };
}

// ---------------------------------------------------------------------------
// HTTP client
// ---------------------------------------------------------------------------

export const httpClient: IRuntimeFacade = {
  async expandKeyword(params: ExpandKeywordParams): Promise<ExpansionResponse> {
    const body: Record<string, unknown> = { keyword: params.keyword };
    if (params.location !== undefined) body['location'] = params.location;
    if (params.limit !== undefined) body['limit'] = params.limit;

    const data = await apiFetch<BackendExpansionResponse>('/api/expand', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return toUISuggestions(data);
  },

  async createRun(params: CreateRunParams): Promise<CreateRunResult> {
    const data = await apiFetch<{ runId: string; status: string }>('/api/runs', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    return { runId: data.runId };
  },

  async executeRun(params: ExecuteRunParams): Promise<ExecutionSummary> {
    const seeds = params.keywords.length > 0
      ? params.keywords.map(kw => ({ keyword: kw, location: params.query.location }))
      : [{ keyword: params.query.niche, location: params.query.location }];
    const data = await apiFetch<BackendExecutionSummary>(
      `/api/runs/${params.runId}/execute`,
      {
        method: 'POST',
        body: JSON.stringify({
          provider: params.provider,
          seeds,
        }),
      },
    );
    return toUIExecutionSummary(data);
  },

  async getRun(runId: string): Promise<Run> {
    const data = await apiFetch<BackendRun>(`/api/runs/${runId}`);
    return toUIRun(data);
  },

  async listRecords(runId: string): Promise<BusinessRecord[]> {
    const data = await apiFetch<BackendRecordPage>(
      `/api/runs/${runId}/records?page=1&pageSize=100`,
    );
    return data.items.map(toUIRecord);
  },
};

