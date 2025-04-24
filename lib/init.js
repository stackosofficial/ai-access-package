"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initAIAccessPoint = exports.ResponseHandlerImpl = exports.getSkyNode = exports.setupSkyNode = void 0;
exports.adaptLegacyFunction = adaptLegacyFunction;
const balanceRunMain_1 = __importDefault(require("./balanceRunMain"));
const checkBalance_1 = require("./middleware/checkBalance");
const auth_1 = require("./middleware/auth");
const parseAuth_1 = require("./middleware/parseAuth");
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
const initAIAccessPoint = async (env, skyNodeParam, app, runNaturalFunction, runUpdate, upload) => {
    try {
        await (0, exports.setupSkyNode)(skyNodeParam);
        const balanceRunMain = new balanceRunMain_1.default(env, 60 * 1000);
        const contAddrResp = await skyNode.contractService.callContractRead(skyNode.contractService.BalanceSettler.getSubnetPriceCalculator(balanceRunMain.envConfig.env.SUBNET_ID), (res) => res);
        if (contAddrResp.success == false)
            return contAddrResp;
        const contractAddress = contAddrResp.data;
        console.log("contractAddress", contractAddress);
        balanceRunMain.envConfig.env.SERVER_COST_CONTRACT_ADDRESS = contractAddress;
        await balanceRunMain.setup();
        if (runUpdate) {
            balanceRunMain.update();
        }
        // Adapt the function if it's a legacy function (has 3 parameters)
        const adaptedFunction = runNaturalFunction.length <= 3
            ? adaptLegacyFunction(runNaturalFunction)
            : runNaturalFunction;
        // Handler function that wraps runNaturalFunction with ResponseHandler
        const handleRequest = async (req, res, next) => {
            try {
                const responseHandler = new ResponseHandlerImpl(req, res);
                await adaptedFunction(req, res, balanceRunMain, responseHandler);
            }
            catch (error) {
                console.error("Error in request handler:", error);
                if (!res.headersSent) {
                    res.status(500).json({ error: error.message || "Internal server error" });
                }
                next(error);
            }
        };
        // Setup routes
        if (upload) {
            app.post("/natural-request", upload.array("files"), parseAuth_1.parseAuth, auth_1.protect, (req, res, next) => (0, checkBalance_1.checkBalance)(req, res, next, contractAddress), handleRequest);
        }
        else {
            app.post("/natural-request", auth_1.protect, (req, res, next) => (0, checkBalance_1.checkBalance)(req, res, next, contractAddress), handleRequest);
        }
        // Create API endpoint for index creation instructions
        app.get("/firebase-indexes", (req, res) => {
            const subnetId = balanceRunMain.envConfig.env.SUBNET_ID;
            const indexes = [
                {
                    collection: `nft_extract_costs_${subnetId}`,
                    fields: [
                        { fieldPath: "collection_id", order: "ASCENDING" },
                        { fieldPath: "nft_id", order: "ASCENDING" },
                        { fieldPath: "created_at", order: "DESCENDING" },
                    ],
                },
                {
                    collection: `nft_extract_costs_history_${subnetId}`,
                    fields: [
                        { fieldPath: "applied", order: "ASCENDING" },
                        { fieldPath: "created_at", order: "DESCENDING" },
                    ],
                },
            ];
            res.json({
                message: "Required Firebase indexes - create these in Firebase console",
                indexes,
                instructions: "Visit the Firebase console and manually create these indexes or use the links in the server logs.",
            });
        });
        return { success: true, data: balanceRunMain };
    }
    catch (error) {
        console.error("Error in initAIAccessPoint:", error);
        return {
            success: false,
            data: new Error(`Failed to initialize AI Access Point: ${error.message}`),
        };
    }
};
exports.initAIAccessPoint = initAIAccessPoint;
