/**
 * @module core/errors/PipelineError
 * Errors arising in pipeline orchestration (coordinator, worker lifecycle).
 */
import { AppError } from "./BaseError.js";
export class PipelineError extends AppError {
    code;
    stage;
    queue;
    jobId;
    constructor(options) {
        const _o = {};
        if (options.cause !== undefined)
            _o.cause = options.cause;
        if (options.context !== undefined)
            _o.context = options.context;
        super(options.message, _o);
        this.code = options.code;
        if (options.stage !== undefined)
            this.stage = options.stage;
        if (options.queue !== undefined)
            this.queue = options.queue;
        if (options.jobId !== undefined)
            this.jobId = options.jobId;
    }
}
export class QueryEngineError extends AppError {
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
export class GeoResolutionError extends AppError {
    code;
    constructor(options) {
        const _o = {};
        if (options.cause !== undefined)
            _o.cause = options.cause;
        if (options.context !== undefined)
            _o.context = options.context;
        super(options.message, _o);
        this.code = options.code;
    }
}
//# sourceMappingURL=PipelineError.js.map