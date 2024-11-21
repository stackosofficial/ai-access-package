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
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var ethers_1 = require("ethers");
var ServerCostCalculator_1 = __importDefault(require("./ABI/ServerCostCalculator"));
var init_1 = require("./init");
var databaseWriterExecution_1 = require("@decloudlabs/sky-cluster-operator/lib/utils/databaseWriterExecution");
var NFT_UPDATE_INTERVAL = 1 * 60 * 1000;
var batchSize = 100;
var balanceExtractService = /** @class */ (function () {
    function balanceExtractService(envConfig, databaseService) {
        var _this = this;
        this.addNFTCostsToWriteInternal = function (nftCosts) {
            _this.nftCostsToWriteList = __spreadArray(__spreadArray([], _this.nftCostsToWriteList, true), nftCosts, true);
        };
        this.addNFTCostsToWrite = function (nftCosts) { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/];
            });
        }); };
        this.scanNFTBalancesInternal = function () { return __awaiter(_this, void 0, void 0, function () {
            var cursor, _a, cursor_1, cursor_1_1, nftCosts, resp, e_1_1, error_1;
            var _b, e_1, _c, _d;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        _e.trys.push([0, 17, , 18]);
                        cursor = this.databaseService.getNFTExtractCursor();
                        cursor.batchSize(batchSize);
                        _e.label = 1;
                    case 1:
                        _e.trys.push([1, 10, 11, 16]);
                        _a = true, cursor_1 = __asyncValues(cursor);
                        _e.label = 2;
                    case 2: return [4 /*yield*/, cursor_1.next()];
                    case 3:
                        if (!(cursor_1_1 = _e.sent(), _b = cursor_1_1.done, !_b)) return [3 /*break*/, 9];
                        _d = cursor_1_1.value;
                        _a = false;
                        nftCosts = _d;
                        console.log("nftCosts: ", nftCosts);
                        if (!(nftCosts.costs !== '0')) return [3 /*break*/, 8];
                        return [4 /*yield*/, addCostToContract(nftCosts.nftID, nftCosts.costs, this.envConfig)];
                    case 4:
                        resp = _e.sent();
                        if (!resp.success) return [3 /*break*/, 6];
                        console.log("setting extract balance to 0: ", nftCosts.nftID);
                        return [4 /*yield*/, this.databaseService.setExtractBalance(nftCosts.nftID, '0')];
                    case 5:
                        _e.sent();
                        _e.label = 6;
                    case 6: return [4 /*yield*/, updateBalanceInContract(nftCosts.nftID, this.envConfig)];
                    case 7:
                        _e.sent();
                        _e.label = 8;
                    case 8:
                        _a = true;
                        return [3 /*break*/, 2];
                    case 9: return [3 /*break*/, 16];
                    case 10:
                        e_1_1 = _e.sent();
                        e_1 = { error: e_1_1 };
                        return [3 /*break*/, 16];
                    case 11:
                        _e.trys.push([11, , 14, 15]);
                        if (!(!_a && !_b && (_c = cursor_1.return))) return [3 /*break*/, 13];
                        return [4 /*yield*/, _c.call(cursor_1)];
                    case 12:
                        _e.sent();
                        _e.label = 13;
                    case 13: return [3 /*break*/, 15];
                    case 14:
                        if (e_1) throw e_1.error;
                        return [7 /*endfinally*/];
                    case 15: return [7 /*endfinally*/];
                    case 16: return [3 /*break*/, 18];
                    case 17:
                        error_1 = _e.sent();
                        console.error(error_1);
                        return [3 /*break*/, 18];
                    case 18: return [2 /*return*/];
                }
            });
        }); };
        this.setup = function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/];
            });
        }); };
        this.update = function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.databaseWriter.execute()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); };
        this.nftCostsToWriteList = [];
        this.databaseWriter = new databaseWriterExecution_1.DatabaseWriterExecution("nftCostsWriter", this.scanNFTBalancesInternal, this.addNFTCostsToWrite, NFT_UPDATE_INTERVAL);
        this.envConfig = envConfig;
        this.databaseService = databaseService;
    }
    return balanceExtractService;
}());
exports.default = balanceExtractService;
var addCostToContract = function (nftID, price, envConfig) { return __awaiter(void 0, void 0, void 0, function () {
    var skyNode, address, subnetID, abi, provider, wallet, serverCostCalculator, response;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                skyNode = (0, init_1.getSkyNode)();
                address = '0x099B69911207bE7a2A18C2a2878F9b267838e388';
                subnetID = envConfig.env.SUBNET_ID || '';
                abi = ServerCostCalculator_1.default;
                provider = new ethers_1.ethers.providers.JsonRpcProvider(envConfig.env.JSON_RPC_PROVIDER);
                wallet = new ethers_1.ethers.Wallet(envConfig.env.WALLET_PRIVATE_KEY || '', provider);
                serverCostCalculator = new ethers_1.ethers.Contract(address, abi, wallet);
                console.log("adding costs to contract: ", nftID, price);
                return [4 /*yield*/, skyNode.contractService.callContractWrite(serverCostCalculator.addNFTCosts(subnetID, nftID, price))];
            case 1:
                response = _a.sent();
                console.log("response: ", response);
                return [2 /*return*/, response];
        }
    });
}); };
var updateBalanceInContract = function (nftID, envConfig) { return __awaiter(void 0, void 0, void 0, function () {
    var skyNode, subnetID, resp;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                skyNode = (0, init_1.getSkyNode)();
                subnetID = envConfig.env.SUBNET_ID || '';
                return [4 /*yield*/, skyNode.contractService.callContractWrite(skyNode.contractService.SubscriptionBalance.updateBalance(nftID, [subnetID]))];
            case 1:
                resp = _a.sent();
                return [2 /*return*/, resp];
        }
    });
}); };
