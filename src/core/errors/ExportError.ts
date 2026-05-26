/**
 * @module core/errors/ExportError
 * Errors arising during the export stage.
 */

import { AppError } from "./BaseError.js";

import type { ExportFormat } from "../types/common.js";

export type ExportErrorCode =
  | "WRITE_FAILED"
  | "DESTINATION_NOT_FOUND"
  | "PERMISSION_DENIED"
  | "UNSUPPORTED_FIELD"
  | "SERIALIZATION_FAILED"
  | "APPEND_NOT_SUPPORTED"
  | "UNKNOWN_FORMAT";

export class ExportError extends AppError {
  override readonly code: ExportErrorCode;
  readonly format: ExportFormat;
  readonly destination: string;

  constructor(options: {
    code: ExportErrorCode;
    format: ExportFormat;
    destination: string;
    message: string;
    cause?: unknown;
    context?: Record<string, unknown>;
  }) {
    const _o: { cause?: unknown; context?: Record<string, unknown> } = {};
    if (options.cause !== undefined) _o.cause = options.cause;
    if (options.context !== undefined) _o.context = options.context;
    super(options.message, _o);
    this.code = options.code;
    this.format = options.format;
    this.destination = options.destination;
  }
}
