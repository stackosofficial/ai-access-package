"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initAIAccessPoint = exports.getSkyNode = exports.setupSkyNode = void 0;
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
        // Setup routes
        if (upload) {
            app.post("/natural-request", upload.array("files"), parseAuth_1.parseAuth, auth_1.protect, (req, res, next) => (0, checkBalance_1.checkBalance)(req, res, next, contractAddress), (req, res, next) => runNaturalFunction(req, res, balanceRunMain).catch(next));
        }
        else {
            app.post("/natural-request", auth_1.protect, (req, res, next) => (0, checkBalance_1.checkBalance)(req, res, next, contractAddress), (req, res, next) => runNaturalFunction(req, res, balanceRunMain).catch(next));
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
