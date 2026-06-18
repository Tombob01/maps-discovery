/**
 * tests/unit/ui/RunProgressRow.test.ts
 *
 * Unit tests for RunProgressRow's pure, status-derived rendering helpers.
 * No DOM/render environment required (none exists in this project) --
 * these functions are extracted specifically so the stalled-running fix
 * can be tested without introducing jsdom/RTL.
 */

import { describe, it, expect } from "vitest";
import {
  getStatusDisplay,
  getExtractionHeading,
  getProgressBarColorClass,
  shouldAnimateProgressBar,
} from "../../../src/ui/components/RunProgressRow";

describe("getStatusDisplay", () => {
  it("returns the stalled config for running + isPollingStalled=true", () => {
    const result = getStatusDisplay("running", true);
    expect(result.label).toBe("stalled");
  });

  it("returns the normal running config for running + isPollingStalled=false", () => {
    const result = getStatusDisplay("running", false);
    expect(result.label).toBe("running");
  });

  it("returns the complete config regardless of isPollingStalled", () => {
    expect(getStatusDisplay("complete", false).label).toBe("complete");
    expect(getStatusDisplay("complete", true).label).toBe("complete");
  });

  it("returns the failed config regardless of isPollingStalled", () => {
    expect(getStatusDisplay("failed", false).label).toBe("failed");
    expect(getStatusDisplay("failed", true).label).toBe("failed");
  });

  it("returns the pending config regardless of isPollingStalled", () => {
    expect(getStatusDisplay("pending", false).label).toBe("pending");
    expect(getStatusDisplay("pending", true).label).toBe("pending");
  });

  it("stalled status is visually distinct from healthy running status", () => {
    const stalled = getStatusDisplay("running", true);
    const healthy = getStatusDisplay("running", false);
    expect(stalled.label).not.toBe(healthy.label);
    expect(stalled.dotClass).not.toBe(healthy.dotClass);
    expect(stalled.badgeClass).not.toBe(healthy.badgeClass);
  });
});

describe("getExtractionHeading", () => {
  it("returns 'Updates paused' for running + isPollingStalled=true", () => {
    expect(getExtractionHeading("running", true)).toBe("Updates paused");
  });

  it("returns 'Extraction in progress' for healthy running", () => {
    expect(getExtractionHeading("running", false)).toBe("Extraction in progress");
  });

  it("returns 'Extraction complete' for complete, regardless of stalled flag", () => {
    expect(getExtractionHeading("complete", false)).toBe("Extraction complete");
    expect(getExtractionHeading("complete", true)).toBe("Extraction complete");
  });

  it("returns 'Extraction in progress' for failed", () => {
    expect(getExtractionHeading("failed", false)).toBe("Extraction in progress");
  });
});

describe("getProgressBarColorClass", () => {
  it("returns red for failed", () => {
    expect(getProgressBarColorClass("failed", false)).toBe("bg-red-500");
  });

  it("returns amber for running + isPollingStalled=true", () => {
    expect(getProgressBarColorClass("running", true)).toBe("bg-amber-500");
  });

  it("returns violet for healthy running", () => {
    expect(getProgressBarColorClass("running", false)).toBe("bg-violet-600");
  });

  it("returns violet for complete", () => {
    expect(getProgressBarColorClass("complete", false)).toBe("bg-violet-600");
  });

  it("stalled color is distinct from both healthy and failed colors", () => {
    const stalled = getProgressBarColorClass("running", true);
    const healthy = getProgressBarColorClass("running", false);
    const failed = getProgressBarColorClass("failed", false);
    expect(stalled).not.toBe(healthy);
    expect(stalled).not.toBe(failed);
  });
});

describe("shouldAnimateProgressBar", () => {
  it("returns false for running + isPollingStalled=true", () => {
    expect(shouldAnimateProgressBar("running", true)).toBe(false);
  });

  it("returns true for healthy running", () => {
    expect(shouldAnimateProgressBar("running", false)).toBe(true);
  });

  it("returns true for complete", () => {
    expect(shouldAnimateProgressBar("complete", false)).toBe(true);
  });

  it("returns true for failed", () => {
    expect(shouldAnimateProgressBar("failed", false)).toBe(true);
  });
});