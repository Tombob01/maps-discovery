/**
 * @module core/errors/ExportError
 * Errors arising during the export stage.
 */
import { AppError } from "./BaseError.js";
export class ExportError extends AppError {
    code;
    format;
    destination;
    constructor(options) {
        const _o = {};
        if (options.cause !== undefined)
            _o.cause = options.cause;
        if (options.context !== undefined)
            _o.context = options.context;
        super(options.message, _o);
        this.code = options.code;
        this.format = options.format;
        this.destination = options.destination;
    }
}
//# sourceMappingURL=ExportError.js.map