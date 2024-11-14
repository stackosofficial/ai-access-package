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
var CostApplierService = /** @class */ (function () {
    function CostApplierService(databaseService, envConfig, web3Service, applyCosts, extractCostTime) {
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
            var batchVal, cursor, shortTermList, nftCosts, newCostList, i, nftCosts, result, i, nftCosts;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        console.log("scanning short term balances");
                        batchVal = 1000;
                        cursor = this.databaseService.getNFTCostCursor(batchVal);
                        shortTermList = [];
                        _a.label = 1;
                    case 1: return [4 /*yield*/, cursor.hasNext()];
                    case 2:
                        if (!_a.sent()) return [3 /*break*/, 4];
                        return [4 /*yield*/, cursor.next()];
                    case 3:
                        nftCosts = _a.sent();
                        if (nftCosts) {
                            shortTermList.push(nftCosts);
                        }
                        return [3 /*break*/, 1];
                    case 4: return [4 /*yield*/, cursor.close()];
                    case 5:
                        _a.sent();
                        console.log("short term list: ", shortTermList);
                        newCostList = [];
                        i = 0;
                        _a.label = 6;
                    case 6:
                        if (!(i < shortTermList.length)) return [3 /*break*/, 9];
                        nftCosts = shortTermList[i];
                        return [4 /*yield*/, this.applyCosts(nftCosts)];
                    case 7:
                        result = _a.sent();
                        if (result.success) {
                            newCostList.push(result.data);
                        }
                        _a.label = 8;
                    case 8:
                        i++;
                        return [3 /*break*/, 6];
                    case 9:
                        i = 0;
                        _a.label = 10;
                    case 10:
                        if (!(i < newCostList.length)) return [3 /*break*/, 13];
                        nftCosts = newCostList[i];
                        return [4 /*yield*/, this.databaseService.setBalance(nftCosts.nftID, nftCosts.costs)];
                    case 11:
                        _a.sent();
                        _a.label = 12;
                    case 12:
                        i++;
                        return [3 /*break*/, 10];
                    case 13: return [2 /*return*/];
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
        this.shortTermDatabaseWriter = new databaseWriterExecution_1.DatabaseWriterExecution("shortTermNFTTracker", this.scanShortTermBalances, this.addShortTermTrackerInternal, extractCostTime);
        this.applyCosts = applyCosts;
    }
    return CostApplierService;
}());
exports.default = CostApplierService;