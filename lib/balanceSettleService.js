"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var ethers_1 = require("ethers");
var databaseWriterExecution_1 = require("@decloudlabs/sky-cluster-operator/lib/utils/databaseWriterExecution");
var ServerCostCalculator_1 = __importDefault(require("./ABI/ServerCostCalculator"));
var SkyMainNodeJS_1 = __importDefault(require("@decloudlabs/skynet/lib/services/SkyMainNodeJS"));
var initializedAppCrypto;
var initializeSkyNodeCrypto = function () { return __awaiter(void 0, void 0, void 0, function () {
    var envConfig;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                if (!!initializedAppCrypto) return [3 /*break*/, 2];
                envConfig = {
                    JRPC_PROVIDER: process.env.JSON_RPC_PROVIDER,
                    WALLET_PRIVATE_KEY: process.env.ACCESSPOINT_PRIVATE_KEY,
                    STORAGE_API: {}
                };
                initializedAppCrypto = new SkyMainNodeJS_1.default(envConfig);
                return [4 /*yield*/, initializedAppCrypto.init(true)];
            case 1:
                _a.sent();
                _a.label = 2;
            case 2: return [2 /*return*/, initializedAppCrypto];
        }
    });
}); };
var getSkyNode = function () { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, initializeSkyNodeCrypto()];
            case 1: return [2 /*return*/, _a.sent()];
        }
    });
}); };
var BalanceSettleService = /** @class */ (function () {
    function BalanceSettleService(databaseService, envConfig, web3Service, checkBalanceCondition) {
        var _this = this;
        this.setup = function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/];
            });
        }); };
        this.addShortTermTrackerInternal = function (nftCosts) { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/];
            });
        }); };
        this.scanShortTermBalances = function () { return __awaiter(_this, void 0, void 0, function () {
            var skyNode, SUBNET_ID, serverCostContract, batchVal, cursor, shortTermList, nftCosts, deleteList, i, nftCosts, balanceResp, balance, costResp, finalBalance, resp;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        console.log("scanning short term balances");
                        return [4 /*yield*/, getSkyNode()];
                    case 1:
                        skyNode = _a.sent();
                        SUBNET_ID = this.envConfig.SUBNET_ID;
                        serverCostContract = new ethers_1.ethers.Contract("0x099B69911207bE7a2A18C2a2878F9b267838e388", ServerCostCalculator_1.default, skyNode.contractService.signer);
                        batchVal = 1000;
                        cursor = this.databaseService.getNFTCostCursor(batchVal);
                        shortTermList = [];
                        _a.label = 2;
                    case 2: return [4 /*yield*/, cursor.hasNext()];
                    case 3:
                        if (!_a.sent()) return [3 /*break*/, 5];
                        return [4 /*yield*/, cursor.next()];
                    case 4:
                        nftCosts = _a.sent();
                        if (nftCosts) {
                            shortTermList.push(nftCosts);
                        }
                        return [3 /*break*/, 2];
                    case 5: return [4 /*yield*/, cursor.close()];
                    case 6:
                        _a.sent();
                        console.log("short term list: ", shortTermList);
                        deleteList = [];
                        i = 0;
                        _a.label = 7;
                    case 7:
                        if (!(i < shortTermList.length)) return [3 /*break*/, 12];
                        nftCosts = shortTermList[i];
                        return [4 /*yield*/, skyNode.contractService.callContractRead(skyNode.contractService.SubscriptionBalance.getSubnetNFTBalances(nftCosts.nftID, [SUBNET_ID]), function (res) { return res.balanceList[0]; })];
                    case 8:
                        balanceResp = _a.sent();
                        if (balanceResp.success == false) {
                            console.log("error getting balance: ", balanceResp.data);
                            return [3 /*break*/, 11];
                        }
                        balance = ethers_1.ethers.BigNumber.from(balanceResp.data);
                        return [4 /*yield*/, skyNode.contractService.callContractRead(serverCostContract.getNFTCost(SUBNET_ID, nftCosts.nftID), function (res) { return res.toString(); })];
                    case 9:
                        costResp = _a.sent();
                        if (costResp.success == false) {
                            console.log("error getting cost: ", costResp.data);
                            return [3 /*break*/, 11];
                        }
                        finalBalance = balance.sub(ethers_1.ethers.BigNumber.from(costResp.data));
                        finalBalance = finalBalance.sub(ethers_1.ethers.BigNumber.from(nftCosts.costs));
                        console.log("final balance: ", finalBalance.toString());
                        console.log("checking costs", costResp.data.toString(), nftCosts.costs.toString(), balance.toString());
                        if (!finalBalance.lte(0)) return [3 /*break*/, 11];
                        return [4 /*yield*/, this.checkBalanceCondition(nftCosts)];
                    case 10:
                        resp = _a.sent();
                        if (resp.success) {
                            deleteList.push(nftCosts.nftID);
                        }
                        _a.label = 11;
                    case 11:
                        i++;
                        return [3 /*break*/, 7];
                    case 12: return [4 /*yield*/, this.databaseService.deleteNFTCosts(deleteList)];
                    case 13:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); };
        this.update = function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.shortTermDatabaseWriter.execute()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); };
        this.databaseService = databaseService;
        this.envConfig = envConfig;
        this.serverCostCalculator = new ethers_1.ethers.Contract("0x099B69911207bE7a2A18C2a2878F9b267838e388", ServerCostCalculator_1.default, web3Service.signer);
        this.shortTermDatabaseWriter = new databaseWriterExecution_1.DatabaseWriterExecution("shortTermNFTTracker", this.scanShortTermBalances, this.addShortTermTrackerInternal, 1 * 60 * 1000);
        this.checkBalanceCondition = checkBalanceCondition;
    }
    return BalanceSettleService;
}());
exports.default = BalanceSettleService;
