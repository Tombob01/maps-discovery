import { useCallback, useReducer } from 'react';
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
} from '../types/ui';

// ─── State shape & reducer ───────────────────────────────────────────────────

type Action =
  | { type: 'SET_KEYWORD'; keyword: string }
  | { type: 'SET_LOCATION'; location: string }
  | { type: 'SET_PHASE'; phase: Phase }
  | { type: 'SET_STEP'; step: FlowStep }
  | { type: 'SET_ERROR'; error: string }
  | { type: 'SET_SUGGESTIONS'; suggestions: string[] }
  | { type: 'TOGGLE_KEYWORD'; keyword: string }
  | { type: 'SET_RUN_ID'; runId: string }
  | { type: 'SET_RUN_STATUS'; status: RunStatus }
  | { type: 'SET_PROGRESS'; progress: number }
  | { type: 'ADD_EVENT'; entry: EventEntry }
  | { type: 'SET_RECORDS'; records: BusinessRecord[] }
  | { type: 'SET_STATS'; stats: RunStats };

const initialState: DiscoveryFlowState = {
  step: 'expand',
  phase: 'idle',
  keyword: '',
  location: 'Austin TX',
  suggestions: [],
  selectedKeywords: [],
  runId: null,
  runStatus: 'pending',
  progress: 0,
  events: [],
  records: [],
  stats: null,
  error: null,
};

function reducer(state: DiscoveryFlowState, action: Action): DiscoveryFlowState {
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
      return { ...state, suggestions: action.suggestions, phase: 'done', error: null };
    case 'TOGGLE_KEYWORD': {
      const has = state.selectedKeywords.includes(action.keyword);
      return {
        ...state,
        selectedKeywords: has
          ? state.selectedKeywords.filter(k => k !== action.keyword)
          : [...state.selectedKeywords, action.keyword],
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
    default:
      return state;
  }
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export interface DiscoveryFlowActions {
  setKeyword: (keyword: string) => void;
  setLocation: (location: string) => void;
  toggleKeyword: (keyword: string) => void;
  goToSelect: () => void;
  goToExpand: () => void;
  expandKeyword: () => void;
  startRun: () => void;
}

export interface UseDiscoveryFlowReturn {
  state: DiscoveryFlowState;
  actions: DiscoveryFlowActions;
}

export function useDiscoveryFlow(facade: IRuntimeFacade): UseDiscoveryFlowReturn {
  const [state, dispatch] = useReducer(reducer, initialState);

  // ── Helpers ──────────────────────────────────────────────────────────────

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

  // ── Actions ──────────────────────────────────────────────────────────────

  const setKeyword = useCallback((keyword: string) => {
    dispatch({ type: 'SET_KEYWORD', keyword });
  }, []);

  const setLocation = useCallback((location: string) => {
    dispatch({ type: 'SET_LOCATION', location });
  }, []);

  const toggleKeyword = useCallback((keyword: string) => {
    dispatch({ type: 'TOGGLE_KEYWORD', keyword });
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
    addEvent(`expanding keyword: "${state.keyword}"`, 'info');

    facade
      .expandKeyword({
        keyword: state.keyword,
        ...(state.location ? { location: state.location } : {}),
        limit: 8,
      })
      .then(res => {
        addEvent(`${res.suggestions.length} suggestions returned`, 'ok');
        dispatch({ type: 'SET_SUGGESTIONS', suggestions: res.suggestions });
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Expansion failed';
        addEvent(msg, 'err');
        dispatch({ type: 'SET_ERROR', error: msg });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facade, state.keyword, state.location]);

  // Expansion NEVER auto-runs discovery — startRun is an entirely separate action.
  const startRun = useCallback(() => {
    if (state.selectedKeywords.length === 0) return;

    dispatch({ type: 'SET_PHASE', phase: 'loading' });
    dispatch({ type: 'SET_RUN_STATUS', status: 'pending' });
    dispatch({ type: 'SET_PROGRESS', progress: 0 });
    addEvent('creating run…', 'info');

    facade
      .createRun({ niche: state.keyword, location: state.location })
      .then(({ runId }) => {
        console.log('[startRun] createRun resolved, runId:', runId);
        addEvent(`run created: ${runId}`, 'ok');
        dispatch({ type: 'SET_RUN_ID', runId });
        dispatch({ type: 'SET_RUN_STATUS', status: 'running' });
        dispatch({ type: 'SET_PROGRESS', progress: 20 });
        dispatch({ type: 'SET_STEP', step: 'run' });
        addEvent('executing discovery…', 'info');

        console.log('[startRun] calling executeRun, runId:', runId);
        return facade.executeRun({
          provider: 'google-maps',
          runId,
          query: {
            niche: state.keyword,
            location: state.location,
          },
        }).then(summary => {
          console.log('[startRun] executeRun resolved, resultsFound:', summary.discovery.resultsFound, 'normalized:', summary.normalization.processed);
          addEvent(
            `discovery done – ${summary.discovery.resultsFound} results, ` +
            `${summary.normalization.processed} normalized`,
            'ok',
          );
          dispatch({ type: 'SET_PROGRESS', progress: 70 });
          console.log('[startRun] calling getRun, runId:', runId);
          return facade.getRun(runId);
        });
      })
      .then(run => {
        console.log('[startRun] getRun resolved, status:', run.status, 'id:', run.id);
        dispatch({ type: 'SET_RUN_STATUS', status: run.status });
        dispatch({ type: 'SET_STATS', stats: run.stats });
        dispatch({ type: 'SET_PROGRESS', progress: 90 });
        addEvent('fetching records…', 'info');
        return facade.listRecords(run.id);
      })
      .then(records => {
        addEvent(`${records.length} records loaded`, 'ok');
        dispatch({ type: 'SET_RECORDS', records });
        dispatch({ type: 'SET_PHASE', phase: 'done' });
        dispatch({ type: 'SET_PROGRESS', progress: 100 });
        dispatch({ type: 'SET_STEP', step: 'results' });
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Run failed';
        addEvent(`run failed: ${msg}`, 'err');
        dispatch({ type: 'SET_RUN_STATUS', status: 'failed' });
        dispatch({ type: 'SET_ERROR', error: msg });
        // Still attempt to load whatever records were inserted before the failure.
        // runId is captured from createRun above — safe to use even after rejection.
        if (state.runId !== null) {
          facade.listRecords(state.runId).then(records => {
            if (records.length > 0) {
              addEvent(`${records.length} records loaded (partial run)`, 'ok');
              dispatch({ type: 'SET_RECORDS', records });
              dispatch({ type: 'SET_STEP', step: 'results' });
            }
          }).catch(() => { /* listRecords failed — no records to show */ });
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facade, state.keyword, state.location, state.selectedKeywords]);

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
    },
  };
}
