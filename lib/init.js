"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initAIAccessPoint = exports.ResponseHandlerImpl = exports.getSkyNode = exports.setupSkyNode = void 0;
exports.adaptLegacyFunction = adaptLegacyFunction;
const balanceRunMain_1 = __importDefault(require("./balanceRunMain"));
const apiKeyService_1 = require("./apiKeyService");
let skyNode;
const setupSkyNode = async (skyNodeParam) => {
    skyNode = skyNodeParam;
};
exports.setupSkyNode = setupSkyNode;
const getSkyNode = () => {
    return skyNode;
};
exports.getSkyNode = getSkyNode;
// Response handler class to unify regular and streaming responses
class ResponseHandlerImpl {
    constructor(req, res) {
        this.req = req;
        this.res = res;
        this.isStreaming = req.query.stream === 'true';
        this.hasStarted = false;
        this.hasEnded = false;
        // Setup streaming headers if needed
        if (this.isStreaming) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
        }
    }
    // Send partial update (only in streaming mode)
    sendUpdate(data) {
        if (!this.isStreaming || this.hasEnded)
            return;
        this.hasStarted = true;
        this.res.write(`data: ${JSON.stringify(data)}\n\n`);
        // Check if flush exists (some Express response objects include it via compression middleware)
        if (typeof this.res.flush === 'function') {
            this.res.flush();
        }
    }
    // Send final response and end
    sendFinalResponse(data) {
        if (this.hasEnded)
            return;
        this.hasEnded = true;
        if (this.isStreaming) {
            // Final message for streaming
            this.res.write(`data: ${JSON.stringify({ ...data, done: true })}\n\n`);
            this.res.end();
        }
        else {
            // Regular JSON response
            this.res.json(data);
        }
    }
    // Send an error response
    sendError(error, statusCode = 500) {
        if (this.hasEnded)
            return;
        this.hasEnded = true;
        const errorMessage = typeof error === 'string' ? error : error.message;
        if (this.isStreaming) {
            this.res.write(`data: ${JSON.stringify({ error: errorMessage, done: true })}\n\n`);
            this.res.end();
        }
        else {
            this.res.status(statusCode).json({ error: errorMessage });
        }
    }
    // Check if this is a streaming request
    isStreamingRequest() {
        return this.isStreaming;
    }
}
exports.ResponseHandlerImpl = ResponseHandlerImpl;
// Adapter function to convert legacy function to new function signature
function adaptLegacyFunction(legacyFn) {
    return async (req, res, balanceRunMain, responseHandler) => {
        // Legacy functions handle the response directly through res
        return legacyFn(req, res, balanceRunMain);
    };
}
const initAIAccessPoint = async (env, skyNodeParam, config) => {
    try {
        await (0, exports.setupSkyNode)(skyNodeParam);
        const balanceRunMain = new balanceRunMain_1.default(env, 60 * 1000);
        // Initialize API key service if config is provided
        let apiKeyService;
        if (config?.apiKeyConfig?.enabled) {
            apiKeyService = new apiKeyService_1.ApiKeyService(config.apiKeyConfig);
            await apiKeyService.setupTables();
        }
        return { balanceRunMain, apiKeyService };
    }
    catch (error) {
        console.error('Error initializing AI Access Point:', error);
        throw error;
    }
};
exports.initAIAccessPoint = initAIAccessPoint;
