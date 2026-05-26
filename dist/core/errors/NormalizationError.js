/**
 * @module core/errors/NormalizationError
 * Errors arising during ProviderResult → BusinessRecord conversion.
 */
import { AppError } from "./BaseError.js";
export class NormalizationError extends AppError {
    code;
    providerId;
    rawResultId;
    constructor(options) {
        const _o = {};
        if (options.cause !== undefined)
            _o.cause = options.cause;
        if (options.context !== undefined)
            _o.context = options.context;
        super(options.message, _o);
        this.code = options.code;
        this.providerId = options.providerId;
        this.rawResultId = options.rawResultId;
    }
}
//# sourceMappingURL=NormalizationError.js.map