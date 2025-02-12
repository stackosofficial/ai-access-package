"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initAIAccessPoint = exports.getSkyNode = exports.setupSkyNode = void 0;
const balanceRunMain_1 = __importDefault(require("./balanceRunMain"));
const checkBalance_1 = require("./middleware/checkBalance");
const auth_1 = require("./middleware/auth");
let skyNode;
const setupSkyNode = async (skyNodeParam) => {
    skyNode = skyNodeParam;
};
exports.setupSkyNode = setupSkyNode;
const getSkyNode = () => {
    return skyNode;
};
exports.getSkyNode = getSkyNode;
const initAIAccessPoint = async (env, skyNodeParam, app, runNaturalFunction, runUpdate) => {
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
    app.post("/natural-request", auth_1.protect, (req, res, next) => (0, checkBalance_1.checkBalance)(req, res, next, contractAddress), (req, res, next) => runNaturalFunction(req, res, balanceRunMain).catch(next));
    return balanceRunMain;
};
exports.initAIAccessPoint = initAIAccessPoint;
