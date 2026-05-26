/**
 * @module core/errors/ProviderError
 * Errors originating inside a discovery provider.
 */
import { AppError } from "./BaseError.js";
export class ProviderError extends AppError {
    code;
    providerId;
    /** True if the worker should retry the job; false if it should give up. */
    isRetryable;
    constructor(options) {
        const _o = {};
        if (options.cause !== undefined)
            _o.cause = options.cause;
        if (options.context !== undefined)
            _o.context = options.context;
        super(options.message, _o);
        this.code = options.code;
        this.providerId = options.providerId;
        this.isRetryable = options.isRetryable;
    }
    static retryable(code, providerId, message, cause) {
        return new ProviderError({ code, providerId, message, isRetryable: true, cause });
    }
    static fatal(code, providerId, message, cause) {
        return new ProviderError({ code, providerId, message, isRetryable: false, cause });
    }
}
//# sourceMappingURL=ProviderError.js.map