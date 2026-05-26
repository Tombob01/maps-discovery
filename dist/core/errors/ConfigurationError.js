/**
 * @module core/errors/ConfigurationError
 * Errors arising from invalid configuration at startup or runtime.
 */
import { AppError } from "./BaseError.js";
export class ConfigurationError extends AppError {
    code;
    key;
    constructor(options) {
        const _o = {};
        if (options.cause !== undefined)
            _o.cause = options.cause;
        if (options.context !== undefined)
            _o.context = options.context;
        super(options.message, _o);
        this.code = options.code;
        if (options.key !== undefined)
            this.key = options.key;
    }
}
export class ValidationError extends AppError {
    code = "VALIDATION_FAILED";
    violations;
    constructor(options) {
        super(options.message, { cause: options.cause });
        this.violations = options.violations;
    }
}
//# sourceMappingURL=ConfigurationError.js.map