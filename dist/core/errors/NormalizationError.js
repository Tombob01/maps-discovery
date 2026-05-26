/**
 * @module core/errors/NormalizationError
 */
import { AppError } from "./BaseError.js";
export class NormalizationError extends AppError {
    code;
    providerId;
    rawResultId;
    constructor(options) {
        super(options.message, {
            cause: options.cause,
            ...(options.context !== undefined && { context: options.context }),
        });
        this.code = options.code;
        this.providerId = options.providerId;
        this.rawResultId = options.rawResultId;
    }
}
//# sourceMappingURL=NormalizationError.js.map