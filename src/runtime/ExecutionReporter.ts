/**
 * @module runtime/ExecutionReporter
 *
 * Structured execution event system for runtime observability.
 *
 * Design:
 *   - IExecutionReporter is a synchronous, fire-and-forget interface.
 *   - ExecutionEvent is a discriminated union of four event types.
 *   - NoopExecutionReporter is the zero-cost default.
 *   - ExecutionReporter accumulates events in memory for consumers/tests.
 *
 * No persistence, no metrics backend, no side effects beyond event storage.
 */

import type { RunID } from "../core/types/common.js";
import type { DiscoveryStats } from "./DiscoveryRunner.js";
import type { RunStats } from "../core/models/Job.js";

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export interface ExecutionStartedEvent {
  readonly type: "execution_started";
  readonly runId: RunID;
  readonly providerId: string;
  readonly timestamp: number;
}

export interface DiscoveryCompletedEvent {
  readonly type: "discovery_completed";
  readonly runId: RunID;
  readonly providerId: string;
  readonly durationMs: number;
  readonly discoveryStats: DiscoveryStats;
  readonly timestamp: number;
}

export interface NormalizationCompletedEvent {
  readonly type: "normalization_completed";
  readonly runId: RunID;
  readonly providerId: string;
  readonly durationMs: number;
  readonly normalizationStats: RunStats;
  readonly timestamp: number;
}

export interface ExecutionFailedEvent {
  readonly type: "execution_failed";
  readonly runId: RunID;
  readonly providerId: string;
  readonly durationMs: number;
  readonly error: string;
  readonly timestamp: number;
}

export type ExecutionEvent =
  | ExecutionStartedEvent
  | DiscoveryCompletedEvent
  | NormalizationCompletedEvent
  | ExecutionFailedEvent;

// ---------------------------------------------------------------------------
// Reporter interface
// ---------------------------------------------------------------------------

export interface IExecutionReporter {
  /**
   * Receives a structured execution event.
   * Must not throw — implementations are responsible for their own error handling.
   */
  report(event: ExecutionEvent): void;
}

// ---------------------------------------------------------------------------
// NoopExecutionReporter — zero-cost default
// ---------------------------------------------------------------------------

export class NoopExecutionReporter implements IExecutionReporter {
  report(_event: ExecutionEvent): void {
    // intentional no-op
  }
}

// ---------------------------------------------------------------------------
// ExecutionReporter — accumulates events in memory
// ---------------------------------------------------------------------------

export class ExecutionReporter implements IExecutionReporter {
  private readonly _events: ExecutionEvent[] = [];

  report(event: ExecutionEvent): void {
    this._events.push(event);
  }

  /** All events received so far, in emission order. */
  get events(): readonly ExecutionEvent[] {
    return this._events;
  }

  /** Events filtered by type. */
  ofType<T extends ExecutionEvent["type"]>(
    type: T,
  ): readonly Extract<ExecutionEvent, { type: T }>[] {
    return this._events.filter(
      (e): e is Extract<ExecutionEvent, { type: T }> => e.type === type,
    );
  }

  /** Clears accumulated events. Useful between test cases. */
  clear(): void {
    this._events.length = 0;
  }
}