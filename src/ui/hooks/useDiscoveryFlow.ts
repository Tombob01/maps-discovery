import { useCallback, useEffect, useReducer } from 'react';
import type {
  IRuntimeFacade,
  DiscoveryFlowState,
  FlowStep,
  Phase,
  RunStatus,
  EventEntry,
  EventLevel,
  BusinessRecord,
  RunStats,
  ExportFormat,
  ExpandedSuggestion,
  ExpansionStrategy,
} from '../types/ui';

// --- State shape & reducer ---------------------------------------------------

// [MVP-3] Single key used for all localStorage reads and writes.
const ACTIVE_RUN_KEY = 'maps_discovery_active_run_id';

type Action =
  | { type: 'SET_KEYWORD'; keyword: string }
  | { type: 'SET_LOCATION'; location: string }
  | { type: 'SET_PHASE'; phase: Phase }
  | { type: 'SET_STEP'; step: FlowStep }
  | { type: 'SET_ERROR'; error: string }
  | { type: 'SET_SUGGESTIONS'; suggestions: ExpandedSuggestion[]; strategy: ExpansionStrategy }
  | { type: 'TOGGLE_KEYWORD'; suggestion: ExpandedSuggestion }
  | { type: 'SET_STRATEGY'; strategy: ExpansionStrategy }
  | { type: 'SET_RUN_ID'; runId: string }
  | { type: 'SET_RUN_STATUS'; status: RunStatus }
  | { type: 'SET_PROGRESS'; progress: number }
  | { type: 'ADD_EVENT'; entry: EventEntry }
  | { type: 'SET_RECORDS'; records: BusinessRecord[] }
  | { type: 'SET_STATS'; stats: RunStats }
  | { type: 'SET_EXPORT_PHASE'; phase: Phase }
  | { type: 'SET_EXPORT_ERROR'; error: string | null }
  | { type: 'SET_CURRENT_SEED'; seed: string | null }
  | { type: 'SET_POLLING_STALLED'; stalled: boolean };

const initialState: DiscoveryFlowState = {
  step: 'expand',
  phase: 'idle',
  keyword: '',
  location: 'Austin TX',
  suggestions: [],
  selectedKeywords: [],
  expansionStrategy: 'commercial',
  runId: null,
  runStatus: 'pending',
  progress: 0,
  events: [],
  records: [],
  stats: null,
  error: null,
  exportPhase: 'idle' as Phase,
  exportError: null,
  currentSeed: null,
  isPollingStalled: false,
};

export function reducer(state: DiscoveryFlowState, action: Action): DiscoveryFlowState {
  switch (action.type) {
    case 'SET_KEYWORD':
      return { ...state, keyword: action.keyword };
    case 'SET_LOCATION':
      return { ...state, location: action.location };
    case 'SET_PHASE':
      return { ...state, phase: action.phase };
    case 'SET_STEP':
      return { ...state, step: action.step };
    case 'SET_ERROR':
      return { ...state, phase: 'error', error: action.error };
    case 'SET_SUGGESTIONS':
      return {
        ...state,
        suggestions: [
          ...state.suggestions.filter(s => s.strategy !== action.strategy),
          ...action.suggestions,
        ],
        phase: 'done',
        error: null,
      };
    case 'TOGGLE_KEYWORD': {
      const has = state.selectedKeywords.some(
        s => s.keyword === action.suggestion.keyword && s.strategy === action.suggestion.strategy
      );
      return {
        ...state,
        selectedKeywords: has
          ? state.selectedKeywords.filter(
              s => !(s.keyword === action.suggestion.keyword && s.strategy === action.suggestion.strategy)
            )
          : [...state.selectedKeywords, action.suggestion],
      };
    }
    case 'SET_RUN_ID':
      return { ...state, runId: action.runId };
    case 'SET_RUN_STATUS':
      return { ...state, runStatus: action.status };
    case 'SET_PROGRESS':
      return { ...state, progress: action.progress };
    case 'ADD_EVENT':
      return { ...state, events: [...state.events, action.entry] };
    case 'SET_RECORDS':
      return { ...state, records: action.records };
    case 'SET_STATS':
      return { ...state, stats: action.stats };
    case 'SET_EXPORT_PHASE':
      return { ...state, exportPhase: action.phase };
    case 'SET_EXPORT_ERROR':
      return { ...state, exportError: action.error };
    case 'SET_CURRENT_SEED':
      return { ...state, currentSeed: action.seed };
    case 'SET_POLLING_STALLED':
      return { ...state, isPollingStalled: action.stalled };
    case 'SET_STRATEGY':
      return { ...state, expansionStrategy: action.strategy };
    default:
      return state;
  }
}

// --- Hook -------------------------------------------------------------------

export interface DiscoveryFlowActions {
  setKeyword: (keyword: string) => void;
  setLocation: (location: string) => void;
  toggleKeyword: (suggestion: ExpandedSuggestion) => void;
  setStrategy: (strategy: ExpansionStrategy) => void;
  goToSelect: () => void;
  goToExpand: () => void;
  expandKeyword: () => void;
  startRun: () => void;
  exportRecords: (format: ExportFormat) => void;
}

export interface UseDiscoveryFlowReturn {
  state: DiscoveryFlowState;
  actions: DiscoveryFlowActions;
}
export function useDiscoveryFlow(facade: IRuntimeFacade): UseDiscoveryFlowReturn {
  const [state, dispatch] = useReducer(reducer, initialState);

  function ts(): string {
    return new Date().toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  function addEvent(msg: string, level: EventLevel = 'info'): void {
    dispatch({ type: 'ADD_EVENT', entry: { time: ts(), msg, level } });
  }

  // [MVP-1] beginPolling hoisted to hook scope so both startRun and the
  // recovery useEffect below can call it. Body is verbatim from the
  // original inline implementation inside startRun's executeRun().then() --
  // only the enclosing scope changed, and runId is now a parameter
  // (activeRunId) instead of a closure variable.
  function beginPolling(activeRunId: string): void {
    dispatch({ type: 'SET_POLLING_STALLED', stalled: false });
    const POLL_INTERVAL_MS = 5_000;
    const MAX_POLL_MS = 90 * 60 * 1_000;
    const startedAt = Date.now();
    let intervalId: ReturnType<typeof setInterval>;
    let lastLoggedSeed: string | null = null;

    function stopPolling() { clearInterval(intervalId); }

    function onComplete(run: import('../types/ui').Run) {
      stopPolling();
      // [MVP-3] Backend confirmed completion -- clear the persisted key.
      try { localStorage.removeItem(ACTIVE_RUN_KEY); } catch { /* ignore */ }
      dispatch({ type: 'SET_RUN_STATUS', status: run.status });
      dispatch({ type: 'SET_STATS', stats: run.stats });
      dispatch({ type: 'SET_PROGRESS', progress: 90 });
      addEvent('fetching records...', 'info');
      facade.listRecords(activeRunId).then(records => {
        addEvent(records.length + ' records loaded', 'ok');
        dispatch({ type: 'SET_RECORDS', records });
        dispatch({ type: 'SET_PHASE', phase: 'done' });
        dispatch({ type: 'SET_PROGRESS', progress: 100 });
        dispatch({ type: 'SET_STEP', step: 'results' });
      }).catch(() => {
        dispatch({ type: 'SET_PHASE', phase: 'done' });
        dispatch({ type: 'SET_PROGRESS', progress: 100 });
        dispatch({ type: 'SET_STEP', step: 'results' });
      });
    }

    function onFailed(run: import('../types/ui').Run) {
      stopPolling();
      // [MVP-3] Backend confirmed failure -- clear the persisted key.
      try { localStorage.removeItem(ACTIVE_RUN_KEY); } catch { /* ignore */ }
      dispatch({ type: 'SET_RUN_STATUS', status: 'failed' });
      dispatch({ type: 'SET_STATS', stats: run.stats });
      dispatch({ type: 'SET_ERROR', error: 'Discovery run failed.' });
      addEvent('run failed -- loading partial records...', 'err');
      facade.listRecords(activeRunId).then(records => {
        if (records.length > 0) {
          addEvent(records.length + ' records loaded (partial run)', 'ok');
          dispatch({ type: 'SET_RECORDS', records });
          dispatch({ type: 'SET_STEP', step: 'results' });
        }
      }).catch(() => { /* no records to show */ });
    }

    intervalId = setInterval(() => {
      if (Date.now() - startedAt > MAX_POLL_MS) {
        stopPolling();
        dispatch({ type: 'SET_POLLING_STALLED', stalled: true });
        addEvent('Polling stopped after 90 minutes. The run may still be active on the server -- refresh the page to reconnect and see its current status.', 'warn');
        return;
      }
      facade.getRun(activeRunId).then(run => {
        dispatch({ type: 'SET_STATS', stats: run.stats });
        dispatch({ type: 'SET_CURRENT_SEED', seed: run.currentSeed ?? null });
        const pct = Math.min(85, 30 + Math.round(
          (run.stats.normalized / Math.max(1, run.stats.discovered)) * 55
        ));
        dispatch({ type: 'SET_PROGRESS', progress: pct });

        if (run.status === 'complete' && (run.currentSeed ?? null) === null) {
          // All seeds have finished -- this is true workflow completion.
          onComplete(run);
        } else if (run.status === 'complete' && (run.currentSeed ?? null) !== null) {
          // One seed finished but more are still running.
          // Refresh records so the UI reflects accumulated results,
          // then continue polling.
          if (run.currentSeed !== lastLoggedSeed) {
            addEvent('seed complete, continuing -- keyword: ' + (run.currentSeed ?? ''), 'info');
            lastLoggedSeed = run.currentSeed ?? null;
          }
          facade.listRecords(activeRunId).then(records => {
            dispatch({ type: 'SET_RECORDS', records });
          }).catch(() => { /* refresh failed -- will retry on next tick */ });
        } else if (run.status === 'failed') {
          onFailed(run);
        }
      }).catch(() => { /* poll tick failed -- will retry */ });
    }, POLL_INTERVAL_MS);
  }

  // [MVP-4] Mount-time recovery effect. Reads the persisted runId, validates
  // it against the backend, and resumes the appropriate UI state. No-ops
  // when no key is present. Does not call createRun or executeRun -- never
  // starts a new run.
  useEffect(() => {
    let storedRunId: string | null = null;
    try {
      storedRunId = localStorage.getItem(ACTIVE_RUN_KEY);
    } catch {
      return; // localStorage unavailable -- start normally
    }
    if (!storedRunId) return;

    dispatch({ type: 'SET_RUN_ID', runId: storedRunId });
    dispatch({ type: 'SET_STEP', step: 'run' });
    addEvent('recovering run: ' + storedRunId, 'info');

    facade.getRun(storedRunId).then(run => {
      dispatch({ type: 'SET_STATS', stats: run.stats });
      dispatch({ type: 'SET_CURRENT_SEED', seed: run.currentSeed ?? null });

      if (run.status === 'pending' || run.status === 'running') {
        dispatch({ type: 'SET_RUN_STATUS', status: run.status });
        dispatch({ type: 'SET_PROGRESS', progress: 30 });
        addEvent('run is active -- resuming polling...', 'info');
        beginPolling(storedRunId as string);
      } else if (run.status === 'complete' && (run.currentSeed ?? null) === null) {
        // Completed while tab was closed -- beginPolling then onComplete
        // (inside it) handles the localStorage clear and record fetch on
        // the next tick, since status is already complete.
        addEvent('run already complete -- loading results...', 'info');
        beginPolling(storedRunId as string);
      } else if (run.status === 'complete' && (run.currentSeed ?? null) !== null) {
        dispatch({ type: 'SET_RUN_STATUS', status: run.status });
        dispatch({ type: 'SET_PROGRESS', progress: 30 });
        addEvent('seed in progress -- resuming polling...', 'info');
        beginPolling(storedRunId as string);
      } else if (run.status === 'failed') {
        dispatch({ type: 'SET_RUN_STATUS', status: 'failed' });
        dispatch({ type: 'SET_STATS', stats: run.stats });
        dispatch({ type: 'SET_ERROR', error: 'Discovery run failed.' });
        addEvent('run failed -- loading partial records...', 'err');
        try { localStorage.removeItem(ACTIVE_RUN_KEY); } catch { /* ignore */ }
        facade.listRecords(storedRunId as string).then(records => {
          if (records.length > 0) {
            addEvent(records.length + ' records loaded (partial run)', 'ok');
            dispatch({ type: 'SET_RECORDS', records });
            dispatch({ type: 'SET_STEP', step: 'results' });
          }
        }).catch(() => { /* no records to show */ });
      }
    }).catch(() => {
      // getRun failed -- stale or invalid runId. Clear key and return to Step 1.
      try { localStorage.removeItem(ACTIVE_RUN_KEY); } catch { /* ignore */ }
      addEvent('stored run not found -- starting fresh', 'warn');
      dispatch({ type: 'SET_STEP', step: 'expand' });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facade]);

  const setKeyword = useCallback((keyword: string) => {
    dispatch({ type: 'SET_KEYWORD', keyword });
  }, []);

  const setLocation = useCallback((location: string) => {
    dispatch({ type: 'SET_LOCATION', location });
  }, []);

  const toggleKeyword = useCallback((suggestion: ExpandedSuggestion) => {
    dispatch({ type: 'TOGGLE_KEYWORD', suggestion });
  }, []);

  const setStrategy = useCallback((strategy: ExpansionStrategy) => {
    dispatch({ type: 'SET_STRATEGY', strategy });
  }, []);

  const goToSelect = useCallback(() => {
    dispatch({ type: 'SET_STEP', step: 'select' });
  }, []);

  const goToExpand = useCallback(() => {
    dispatch({ type: 'SET_STEP', step: 'expand' });
  }, []);

  const expandKeyword = useCallback(() => {
    if (!state.keyword.trim()) return;
    dispatch({ type: 'SET_PHASE', phase: 'loading' });
    dispatch({ type: 'SET_ERROR', error: '' });
    addEvent('expanding keyword: "' + state.keyword + '"', 'info');
    facade
      .expandKeyword({
        keyword: state.keyword,
        ...(state.location ? { location: state.location } : {}),
        limit: 8,
        strategy: state.expansionStrategy,
      })
      .then(res => {
        addEvent(res.suggestions.length + ' suggestions returned', 'ok');
        dispatch({ type: 'SET_SUGGESTIONS', suggestions: res.suggestions, strategy: state.expansionStrategy });
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Expansion failed';
        addEvent(msg, 'err');
        dispatch({ type: 'SET_ERROR', error: msg });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facade, state.keyword, state.location, state.expansionStrategy]);
  // Expansion NEVER auto-runs discovery -- startRun is an entirely separate action.
  const startRun = useCallback(() => {
    if (state.selectedKeywords.length === 0) return;

    dispatch({ type: 'SET_PHASE', phase: 'loading' });
    dispatch({ type: 'SET_RUN_STATUS', status: 'pending' });
    dispatch({ type: 'SET_PROGRESS', progress: 0 });
    addEvent('creating run...', 'info');

    facade
      .createRun({ niche: state.keyword, location: state.location })
      .then(({ runId }) => {
        addEvent('run created: ' + runId, 'ok');
        dispatch({ type: 'SET_RUN_ID', runId });
        // [MVP-3] Persist so mount-time recovery can find this run after refresh.
        try { localStorage.setItem(ACTIVE_RUN_KEY, runId); } catch { /* ignore */ }
        dispatch({ type: 'SET_RUN_STATUS', status: 'running' });
        dispatch({ type: 'SET_PROGRESS', progress: 20 });
        dispatch({ type: 'SET_STEP', step: 'run' });
        addEvent('executing discovery...', 'info');

        return facade.executeRun({
          provider: 'google-maps',
          runId,
          query: { niche: state.keyword, location: state.location },
          keywords: state.selectedKeywords,
        }).then(() => {
          addEvent('discovery started -- polling for status...', 'info');
          dispatch({ type: 'SET_PROGRESS', progress: 30 });
          // [MVP-1] Delegate to the hoisted beginPolling.
          beginPolling(runId);
        });
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Run failed';
        addEvent('run failed: ' + msg, 'err');
        dispatch({ type: 'SET_RUN_STATUS', status: 'failed' });
        dispatch({ type: 'SET_ERROR', error: msg });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facade, state.keyword, state.location, state.selectedKeywords]);
  const exportRecords = useCallback((format: ExportFormat) => {
    if (!state.runId) return;
    dispatch({ type: 'SET_EXPORT_PHASE', phase: 'loading' });
    dispatch({ type: 'SET_EXPORT_ERROR', error: null });
    addEvent('exporting records as ' + format.toUpperCase() + '...', 'info');
    facade
      .exportRun(state.runId, format)
      .then(() => {
        addEvent(format.toUpperCase() + ' export complete', 'ok');
        dispatch({ type: 'SET_EXPORT_PHASE', phase: 'done' });
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Export failed';
        addEvent('export failed: ' + msg, 'err');
        dispatch({ type: 'SET_EXPORT_PHASE', phase: 'error' });
        dispatch({ type: 'SET_EXPORT_ERROR', error: msg });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facade, state.runId]);

  return {
    state,
    actions: {
      setKeyword,
      setLocation,
      toggleKeyword,
      goToSelect,
      goToExpand,
      expandKeyword,
      startRun,
      exportRecords,
      setStrategy,
    },
  };
}