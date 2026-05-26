/**
 * Core error classes test suite.
 * Covers: AppError base class, all concrete subclasses, factory methods,
 * toJSON serialisation, cause chain preservation, and optional field handling.
 */

import { describe, it, expect } from "vitest";

import { AppError } from "../../src/core/errors/BaseError.js";
import {
  ConfigurationError,
  ValidationError,
} from "../../src/core/errors/ConfigurationError.js";
import { DeduplicationError } from "../../src/core/errors/DeduplicationError.js";
import { ExportError } from "../../src/core/errors/ExportError.js";
import { NormalizationError } from "../../src/core/errors/NormalizationError.js";
import {
  PipelineError,
  QueryEngineError,
  GeoResolutionError,
} from "../../src/core/errors/PipelineError.js";
import { ProviderError } from "../../src/core/errors/ProviderError.js";

// ---------------------------------------------------------------------------
// AppError — base behaviour via a minimal concrete subclass
// ---------------------------------------------------------------------------

class TestError extends AppError {
  override readonly code = "TEST_CODE" as const;
  constructor(
    message: string,
    options?: { cause?: unknown; context?: Record<string, unknown> },
  ) {
    super(message, options);
  }
}

describe("AppError", () => {
  it("is an instance of Error", () => {
    expect(new TestError("test")).toBeInstanceOf(Error);
  });

  it("sets the message correctly", () => {
    expect(new TestError("something went wrong").message).toBe(
      "something went wrong",
    );
  });

  it("sets name to the concrete class name (not 'AppError')", () => {
    expect(new TestError("x").name).toBe("TestError");
  });

  it("exposes the code property", () => {
    expect(new TestError("x").code).toBe("TEST_CODE");
  });

  it("context is frozen and empty by default", () => {
    const e = new TestError("x");
    expect(Object.isFrozen(e.context)).toBe(true);
    expect(e.context).toEqual({});
  });

  it("stores provided context", () => {
    const e = new TestError("x", { context: { key: "value" } });
    expect(e.context).toEqual({ key: "value" });
  });

  it("stores cause when provided", () => {
    const cause = new Error("root cause");
    const e = new TestError("wrapped", { cause });
    expect(e.cause).toBe(cause);
  });

  it("cause is undefined when not provided", () => {
    expect(new TestError("x").cause).toBeUndefined();
  });

  it("toJSON() includes name, code, message, context, cause", () => {
    const cause = new Error("inner");
    const e = new TestError("outer", { cause, context: { ref: "abc" } });
    const json = e.toJSON();
    expect(json.name).toBe("TestError");
    expect(json.code).toBe("TEST_CODE");
    expect(json.message).toBe("outer");
    expect(json.context).toEqual({ ref: "abc" });
    expect((json.cause as { message: string }).message).toBe("inner");
  });

  it("toJSON() cause is undefined when no cause set", () => {
    expect(new TestError("x").toJSON().cause).toBeUndefined();
  });

  it("prototype chain is correct (instanceof works)", () => {
    const e = new TestError("x");
    expect(e instanceof TestError).toBe(true);
    expect(e instanceof AppError).toBe(true);
    expect(e instanceof Error).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ProviderError
// ---------------------------------------------------------------------------

describe("ProviderError", () => {
  it("stores code and providerId", () => {
    const e = new ProviderError({
      code: "CAPTCHA_DETECTED",
      providerId: "google-maps",
      message: "captcha",
      isRetryable: true,
    });
    expect(e.code).toBe("CAPTCHA_DETECTED");
    expect(e.providerId).toBe("google-maps");
  });

  it("stores isRetryable correctly", () => {
    const retryable = ProviderError.retryable(
      "RATE_LIMITED",
      "gm",
      "rate limited",
    );
    const fatal = ProviderError.fatal("BLOCKED", "gm", "blocked");
    expect(retryable.isRetryable).toBe(true);
    expect(fatal.isRetryable).toBe(false);
  });

  it("static .retryable() factory sets isRetryable=true", () => {
    const e = ProviderError.retryable("PAGE_LOAD_TIMEOUT", "gm", "timeout");
    expect(e.isRetryable).toBe(true);
    expect(e.code).toBe("PAGE_LOAD_TIMEOUT");
  });

  it("static .fatal() factory sets isRetryable=false", () => {
    const e = ProviderError.fatal("BLOCKED", "gm", "blocked");
    expect(e.isRetryable).toBe(false);
    expect(e.code).toBe("BLOCKED");
  });

  it("preserves cause in factory methods", () => {
    const inner = new Error("inner");
    const e = ProviderError.retryable("UNEXPECTED", "gm", "wrap", inner);
    expect(e.cause).toBe(inner);
  });

  it("is instanceof AppError", () => {
    const e = ProviderError.retryable("RATE_LIMITED", "gm", "limited");
    expect(e instanceof AppError).toBe(true);
  });

  it("name is 'ProviderError'", () => {
    expect(ProviderError.retryable("RATE_LIMITED", "gm", "x").name).toBe(
      "ProviderError",
    );
  });

  it.each([
    "BROWSER_LAUNCH_FAILED",
    "BROWSER_CRASHED",
    "PAGE_LOAD_TIMEOUT",
    "PAGE_LOAD_FAILED",
    "SELECTOR_NOT_FOUND",
    "CAPTCHA_DETECTED",
    "RATE_LIMITED",
    "BLOCKED",
    "PARSE_FAILED",
    "PAGINATION_FAILED",
    "RESUME_TOKEN_STALE",
    "PROVIDER_UNAVAILABLE",
    "UNEXPECTED",
  ] as const)(
    "accepts code = %s",
    (
      code: import("../../src/core/errors/ProviderError.js").ProviderErrorCode,
    ) => {
      expect(() => ProviderError.retryable(code, "gm", "msg")).not.toThrow();
    },
  );
});

// ---------------------------------------------------------------------------
// NormalizationError
// ---------------------------------------------------------------------------

describe("NormalizationError", () => {
  it("stores code, providerId, rawResultId", () => {
    const e = new NormalizationError({
      code: "MISSING_REQUIRED_FIELD",
      providerId: "google-maps",
      rawResultId: "raw-123",
      message: "missing name",
    });
    expect(e.code).toBe("MISSING_REQUIRED_FIELD");
    expect(e.providerId).toBe("google-maps");
    expect(e.rawResultId).toBe("raw-123");
  });

  it("is instanceof AppError", () => {
    const e = new NormalizationError({
      code: "MAPPING_FAILED",
      providerId: "gm",
      rawResultId: "r1",
      message: "x",
    });
    expect(e instanceof AppError).toBe(true);
  });

  it("name is 'NormalizationError'", () => {
    const e = new NormalizationError({
      code: "INVALID_PAYLOAD",
      providerId: "gm",
      rawResultId: "r1",
      message: "x",
    });
    expect(e.name).toBe("NormalizationError");
  });
});

// ---------------------------------------------------------------------------
// DeduplicationError
// ---------------------------------------------------------------------------

describe("DeduplicationError", () => {
  it("stores code and optional strategyId", () => {
    const e = new DeduplicationError({
      code: "STRATEGY_FAILED",
      message: "failed",
      strategyId: "exact-match",
    });
    expect(e.code).toBe("STRATEGY_FAILED");
    expect(e.strategyId).toBe("exact-match");
  });

  it("strategyId is undefined when not provided", () => {
    const e = new DeduplicationError({
      code: "DB_UNAVAILABLE",
      message: "db down",
    });
    expect(e.strategyId).toBeUndefined();
  });

  it("is instanceof AppError", () => {
    expect(
      new DeduplicationError({
        code: "DB_UNAVAILABLE",
        message: "x",
      }) instanceof AppError,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ExportError
// ---------------------------------------------------------------------------

describe("ExportError", () => {
  it("stores code, format, and destination", () => {
    const e = new ExportError({
      code: "WRITE_FAILED",
      format: "csv",
      destination: "/tmp/out.csv",
      message: "disk full",
    });
    expect(e.code).toBe("WRITE_FAILED");
    expect(e.format).toBe("csv");
    expect(e.destination).toBe("/tmp/out.csv");
  });

  it("is instanceof AppError", () => {
    expect(
      new ExportError({
        code: "PERMISSION_DENIED",
        format: "json",
        destination: "/x",
        message: "denied",
      }) instanceof AppError,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PipelineError
// ---------------------------------------------------------------------------

describe("PipelineError", () => {
  it("stores code, optional stage, queue, jobId", () => {
    const e = new PipelineError({
      code: "JOB_ENQUEUE_FAILED",
      message: "queue unavailable",
      stage: "discovery",
      queue: "discovery",
      jobId: "job-42",
    });
    expect(e.code).toBe("JOB_ENQUEUE_FAILED");
    expect(e.stage).toBe("discovery");
    expect(e.queue).toBe("discovery");
    expect(e.jobId).toBe("job-42");
  });

  it("optional fields are undefined when not provided", () => {
    const e = new PipelineError({ code: "WORKER_CRASHED", message: "crashed" });
    expect(e.stage).toBeUndefined();
    expect(e.queue).toBeUndefined();
    expect(e.jobId).toBeUndefined();
  });

  it("is instanceof AppError", () => {
    expect(
      new PipelineError({ code: "RUN_NOT_FOUND", message: "x" }) instanceof
        AppError,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// QueryEngineError
// ---------------------------------------------------------------------------

describe("QueryEngineError", () => {
  it("stores code and optional strategyId", () => {
    const e = new QueryEngineError({
      code: "EXPANSION_STRATEGY_FAILED",
      message: "strategy failed",
      strategyId: "ai-llm",
    });
    expect(e.code).toBe("EXPANSION_STRATEGY_FAILED");
    expect(e.strategyId).toBe("ai-llm");
  });

  it("strategyId is undefined when not provided", () => {
    const e = new QueryEngineError({
      code: "INVALID_SEED",
      message: "no niche",
    });
    expect(e.strategyId).toBeUndefined();
  });

  it("is instanceof AppError", () => {
    expect(
      new QueryEngineError({ code: "INVALID_SEED", message: "x" }) instanceof
        AppError,
    ).toBe(true);
  });

  it("name is 'QueryEngineError'", () => {
    expect(
      new QueryEngineError({ code: "INVALID_SEED", message: "x" }).name,
    ).toBe("QueryEngineError");
  });
});

// ---------------------------------------------------------------------------
// GeoResolutionError
// ---------------------------------------------------------------------------

describe("GeoResolutionError", () => {
  it("stores code", () => {
    const e = new GeoResolutionError({
      code: "NOT_FOUND",
      message: "no coords for x",
    });
    expect(e.code).toBe("NOT_FOUND");
  });

  it("is instanceof AppError", () => {
    expect(
      new GeoResolutionError({ code: "AMBIGUOUS", message: "x" }) instanceof
        AppError,
    ).toBe(true);
  });

  it("name is 'GeoResolutionError'", () => {
    expect(
      new GeoResolutionError({ code: "NOT_FOUND", message: "x" }).name,
    ).toBe("GeoResolutionError");
  });
});

// ---------------------------------------------------------------------------
// ConfigurationError
// ---------------------------------------------------------------------------

describe("ConfigurationError", () => {
  it("stores code and optional key", () => {
    const e = new ConfigurationError({
      code: "MISSING_REQUIRED_VALUE",
      message: "missing API key",
      key: "API_KEY",
    });
    expect(e.code).toBe("MISSING_REQUIRED_VALUE");
    expect(e.key).toBe("API_KEY");
  });

  it("key is undefined when not provided", () => {
    const e = new ConfigurationError({ code: "INVALID_VALUE", message: "x" });
    expect(e.key).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// ValidationError
// ---------------------------------------------------------------------------

describe("ValidationError", () => {
  it("has code = VALIDATION_FAILED", () => {
    const e = new ValidationError({ message: "invalid input", violations: [] });
    expect(e.code).toBe("VALIDATION_FAILED");
  });

  it("stores violations array", () => {
    const violations = [
      {
        field: "niche",
        code: "REQUIRED_FIELD_MISSING" as const,
        message: "niche is required",
      },
    ];
    const e = new ValidationError({ message: "validation failed", violations });
    expect(e.violations).toHaveLength(1);
    expect(e.violations[0]!.field).toBe("niche");
    expect(e.violations[0]!.code).toBe("REQUIRED_FIELD_MISSING");
  });

  it("is instanceof AppError", () => {
    expect(
      new ValidationError({ message: "x", violations: [] }) instanceof AppError,
    ).toBe(true);
  });
});
