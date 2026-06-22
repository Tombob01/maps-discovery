/**
 * tests/unit/ui/useDiscoveryFlow.test.ts
 *
 * Unit tests for useDiscoveryFlow's reducer, focused on the
 * SET_POLLING_STALLED action introduced to fix the stalled-running
 * rendering bug: a state where MAX_POLL_MS has stopped polling but
 * runStatus remains "running" with no further updates arriving.
 *
 * Tests the reducer directly (exported for testability) rather than
 * through the hook itself, since this project has no jsdom/RTL setup
 * for full hook-render testing.
 */

import { describe, it, expect } from "vitest";
import { reducer } from "../../../src/ui/hooks/useDiscoveryFlow.js";
import type { DiscoveryFlowState } from "../../../src/ui/types/ui.js";

function makeState(overrides: Partial<DiscoveryFlowState> = {}): DiscoveryFlowState {
  return {
    step: "run",
    phase: "loading",
    keyword: "plumbers",
    location: "Austin TX",
    suggestions: [],
    selectedKeywords: [],
    expansionStrategy: "commercial",
    runId: "run-1",
    runStatus: "running",
    progress: 50,
    events: [],
    records: [],
    stats: null,
    error: null,
    exportPhase: "idle",
    exportError: null,
    currentSeed: null,
    isPollingStalled: false,
    ...overrides,
  };
}

describe("reducer — SET_POLLING_STALLED", () => {
  it("sets isPollingStalled to true", () => {
    const state = makeState({ isPollingStalled: false });
    const next = reducer(state, { type: "SET_POLLING_STALLED", stalled: true });
    expect(next.isPollingStalled).toBe(true);
  });

  it("sets isPollingStalled to false", () => {
    const state = makeState({ isPollingStalled: true });
    const next = reducer(state, { type: "SET_POLLING_STALLED", stalled: false });
    expect(next.isPollingStalled).toBe(false);
  });

  it("does not alter runStatus when setting isPollingStalled", () => {
    const state = makeState({ runStatus: "running", isPollingStalled: false });
    const next = reducer(state, { type: "SET_POLLING_STALLED", stalled: true });
    expect(next.runStatus).toBe("running");
  });

  it("does not alter unrelated state fields", () => {
    const state = makeState({ progress: 42, currentSeed: "plumbers near me" });
    const next = reducer(state, { type: "SET_POLLING_STALLED", stalled: true });
    expect(next.progress).toBe(42);
    expect(next.currentSeed).toBe("plumbers near me");
  });
});

describe("reducer — MAX_POLL_MS timeout transition (simulated)", () => {
  it("a stalled-running state is reachable: SET_POLLING_STALLED true while runStatus stays running", () => {
    // This directly models the MAX_POLL_MS timeout branch in beginPolling:
    // stopPolling() + dispatch SET_POLLING_STALLED true, with no
    // SET_RUN_STATUS dispatch alongside it (confirmed removed by the
    // earlier MAX_POLL_MS false-failure fix).
    let state = makeState({ runStatus: "running", isPollingStalled: false });
    state = reducer(state, { type: "SET_POLLING_STALLED", stalled: true });
    expect(state.runStatus).toBe("running");
    expect(state.isPollingStalled).toBe(true);
  });
});

describe("reducer — reset to non-stalled on a new polling cycle", () => {
  it("a fresh SET_POLLING_STALLED false reset clears a prior stalled flag", () => {
    // Models beginPolling()'s reset dispatch at the start of every call --
    // including the case where a stalled run is later refreshed and a
    // new polling cycle begins.
    let state = makeState({ isPollingStalled: true });
    state = reducer(state, { type: "SET_POLLING_STALLED", stalled: false });
    expect(state.isPollingStalled).toBe(false);
  });

  it("reset does not depend on or alter runStatus", () => {
    let state = makeState({ runStatus: "failed", isPollingStalled: true });
    state = reducer(state, { type: "SET_POLLING_STALLED", stalled: false });
    expect(state.isPollingStalled).toBe(false);
    expect(state.runStatus).toBe("failed");
  });
});