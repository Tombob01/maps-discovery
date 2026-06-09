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
  ExportFormat,
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
  currentSeed?: string | null;
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

// ---------------------------------------------------------------------------
// Mappers: backend -> UI types
// ---------------------------------------------------------------------------

function toUISuggestions(backend: BackendExpansionResponse): ExpansionResponse {
  return {
    original: backend.original,
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
    ...(backend.currentSeed !== undefined ? { currentSeed: backend.currentSeed } : {}),
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
    await apiFetch<{ runId: string; status: string }>(`/api/runs/${params.runId}/execute`,
      {
        method: 'POST',
        body: JSON.stringify({
          provider: params.provider,
          seeds,
        }),
      },
    );
    return {
      discovery: { resultsFound: 0, pagesScraped: 0 },
      normalization: { processed: 0, failed: 0 },
    };
  },

  async getRun(runId: string): Promise<Run> {
    const data = await apiFetch<BackendRun>(`/api/runs/${runId}`);
    return toUIRun(data);
  },

  async listRecords(runId: string): Promise<BusinessRecord[]> {
    const allRecords: BusinessRecord[] = [];
    let page = 1;
    const pageSize = 100;
    let hasMore = true;
    while (hasMore) {
      const data = await apiFetch<BackendRecordPage>(`/api/runs/${runId}/records?page=${page}&pageSize=${pageSize}`);
      allRecords.push(...data.items.map(toUIRecord));
      hasMore = data.hasMore;
      page += 1;
    }
    return allRecords;
  },

  async exportRun(runId: string, format: ExportFormat): Promise<void> {
    const url = `${API_BASE}/api/runs/${runId}/export?format=${format}`;
    const res = await fetch(url);
    if (!res.ok) {
      let code = 'EXPORT_FAILED';
      let message = `Export failed with status `;
      try {
        const body = await res.json() as { ok: false; error: { code: string; message: string } };
        code = body.error.code;
        message = body.error.message;
      } catch { /* ignore parse failure */ }
      throw new ApiError(code, message, res.status);
    }
    const blob = await res.blob();
    const ext = format === 'csv' ? 'csv' : 'jsonl';
    const disposition = res.headers.get('Content-Disposition') ?? '';
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match?.[1] ?? `export-${runId}.${ext}`;
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
  },
};



