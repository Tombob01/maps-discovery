/**
 * @module core/errors/DeduplicationError
 * Errors arising during the deduplication stage.
 */
import { AppError } from "./BaseError.js";
export class DeduplicationError extends AppError {
    code;
    strategyId;
    constructor(options) {
        const _o = {};
        if (options.cause !== undefined)
            _o.cause = options.cause;
        if (options.context !== undefined)
            _o.context = options.context;
        super(options.message, _o);
        this.code = options.code;
        if (options.strategyId !== undefined)
            this.strategyId = options.strategyId;
    }
}
//# sourceMappingURL=DeduplicationError.js.map