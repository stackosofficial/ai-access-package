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
exports.addBalance = void 0;
var utils_1 = require("@decloudlabs/skynet/lib/utils/utils");
var ethers_1 = require("ethers");
var mongodb_1 = require("mongodb");
var ServerCostCalculator_1 = __importDefault(require("./ABI/ServerCostCalculator"));
var init_1 = require("./init");
var databaseWriterExecution_1 = require("@decloudlabs/sky-cluster-operator/lib/utils/databaseWriterExecution");
var nftCostsCollection;
var NFT_UPDATE_INTERVAL = 60 * 60 * 1000;
var batchSize = 100;
var balanceExtractService = /** @class */ (function () {
    function balanceExtractService() {
        var _this = this;
        this.addNFTCostsToWriteInternal = function (nftCosts) {
            _this.nftCostsToWriteList = __spreadArray(__spreadArray([], _this.nftCostsToWriteList, true), nftCosts, true);
        };
        this.addNFTCostsToWrite = function (nftCosts) { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.databaseWriter.insert(nftCosts)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); };
        this.setupDatabase = function () { return __awaiter(_this, void 0, void 0, function () {
            var MONGODB_URL, MONGODB_DBNAME, client, database, collectionName;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        MONGODB_URL = process.env.MONGODB_URL || '';
                        MONGODB_DBNAME = process.env.MONGODB_DBNAME || '';
                        return [4 /*yield*/, mongodb_1.MongoClient.connect(MONGODB_URL)];
                    case 1:
                        client = _a.sent();
                        console.log("created database client: ".concat(MONGODB_URL));
                        database = client.db(MONGODB_DBNAME);
                        console.log("connected to database: ".concat(MONGODB_DBNAME));
                        collectionName = process.env.MONGODB_COLLECTION_NAME || '';
                        console.log("checking mongodb cred:", MONGODB_URL, MONGODB_DBNAME, collectionName);
                        nftCostsCollection = database.collection(collectionName);
                        return [2 /*return*/];
                }
            });
        }); };
        this.scanNFTBalancesInternal = function () { return __awaiter(_this, void 0, void 0, function () {
            var balances, cursor, _a, cursor_1, cursor_1_1, nftCosts, resp, e_1_1, error_1;
            var _b, e_1, _c, _d;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        _e.trys.push([0, 18, , 19]);
                        return [4 /*yield*/, nftCostsCollection.find({}).toArray()];
                    case 1:
                        balances = _e.sent();
                        console.log(balances);
                        cursor = nftCostsCollection.find({});
                        cursor.batchSize(batchSize);
                        _e.label = 2;
                    case 2:
                        _e.trys.push([2, 11, 12, 17]);
                        _a = true, cursor_1 = __asyncValues(cursor);
                        _e.label = 3;
                    case 3: return [4 /*yield*/, cursor_1.next()];
                    case 4:
                        if (!(cursor_1_1 = _e.sent(), _b = cursor_1_1.done, !_b)) return [3 /*break*/, 10];
                        _d = cursor_1_1.value;
                        _a = false;
                        nftCosts = _d;
                        if (!(nftCosts.costs !== '0')) return [3 /*break*/, 9];
                        return [4 /*yield*/, addCostToContract(nftCosts.nftID, nftCosts.costs)];
                    case 5:
                        resp = _e.sent();
                        if (!resp.success) return [3 /*break*/, 7];
                        return [4 /*yield*/, setBalance(nftCosts.nftID, '0')];
                    case 6:
                        _e.sent();
                        _e.label = 7;
                    case 7: return [4 /*yield*/, updateBalanceInContract(nftCosts.nftID)];
                    case 8:
                        _e.sent();
                        _e.label = 9;
                    case 9:
                        _a = true;
                        return [3 /*break*/, 3];
                    case 10: return [3 /*break*/, 17];
                    case 11:
                        e_1_1 = _e.sent();
                        e_1 = { error: e_1_1 };
                        return [3 /*break*/, 17];
                    case 12:
                        _e.trys.push([12, , 15, 16]);
                        if (!(!_a && !_b && (_c = cursor_1.return))) return [3 /*break*/, 14];
                        return [4 /*yield*/, _c.call(cursor_1)];
                    case 13:
                        _e.sent();
                        _e.label = 14;
                    case 14: return [3 /*break*/, 16];
                    case 15:
                        if (e_1) throw e_1.error;
                        return [7 /*endfinally*/];
                    case 16: return [7 /*endfinally*/];
                    case 17: return [3 /*break*/, 19];
                    case 18:
                        error_1 = _e.sent();
                        console.error(error_1);
                        return [3 /*break*/, 19];
                    case 19: return [2 /*return*/];
                }
            });
        }); };
        this.setup = function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.setupDatabase()];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
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
    }
    return balanceExtractService;
}());
exports.default = balanceExtractService;
var setBalance = function (nftID, price) { return __awaiter(void 0, void 0, void 0, function () {
    var result;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, (0, utils_1.apiCallWrapper)(nftCostsCollection.updateOne({}, {
                    $set: { nftID: nftID, costs: price },
                }, {
                    upsert: true,
                }), function (res) { return res.upsertedCount + res.modifiedCount; })];
            case 1:
                result = _a.sent();
                return [2 /*return*/, result];
        }
    });
}); };
var getBalance = function (nftID) { return __awaiter(void 0, void 0, void 0, function () {
    var result;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, (0, utils_1.apiCallWrapper)(nftCostsCollection.findOne({ nftID: nftID }), function (res) { return res; })];
            case 1:
                result = _a.sent();
                return [2 /*return*/, result];
        }
    });
}); };
var addBalance = function (nftID, price) { return __awaiter(void 0, void 0, void 0, function () {
    var balance, newBalance;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0: return [4 /*yield*/, getBalance(nftID)];
            case 1:
                balance = _b.sent();
                if (balance.success == false)
                    return [2 /*return*/, balance];
                if (!balance.data) return [3 /*break*/, 3];
                newBalance = ethers_1.ethers.BigNumber.from(((_a = balance.data) === null || _a === void 0 ? void 0 : _a.costs) || 0).add(ethers_1.ethers.BigNumber.from(price));
                return [4 /*yield*/, setBalance(nftID, newBalance.toString())];
            case 2: return [2 /*return*/, _b.sent()];
            case 3: return [4 /*yield*/, setBalance(nftID, price)];
            case 4: return [2 /*return*/, _b.sent()];
        }
    });
}); };
exports.addBalance = addBalance;
var addCostToContract = function (nftID, price) { return __awaiter(void 0, void 0, void 0, function () {
    var skyNode, address, subnetID, abi, provider, wallet, serverCostCalculator, response;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                skyNode = (0, init_1.getSkyNode)();
                address = '0x099B69911207bE7a2A18C2a2878F9b267838e388';
                subnetID = process.env.SUBNET_ID || '';
                abi = ServerCostCalculator_1.default;
                provider = new ethers_1.ethers.providers.JsonRpcProvider(process.env.PROVIDER_RPC);
                wallet = new ethers_1.ethers.Wallet(process.env.OPERATOR_PRIVATE_KEY || '', provider);
                serverCostCalculator = new ethers_1.ethers.Contract(address, abi, wallet);
                return [4 /*yield*/, skyNode.contractService.callContractWrite(serverCostCalculator.addNFTCosts(subnetID, nftID, price))];
            case 1:
                response = _a.sent();
                console.log("response: ", response);
                return [2 /*return*/, response];
        }
    });
}); };
var updateBalanceInContract = function (nftID) { return __awaiter(void 0, void 0, void 0, function () {
    var skyNode, subnetID, resp;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                skyNode = (0, init_1.getSkyNode)();
                subnetID = process.env.SUBNET_ID || '';
                return [4 /*yield*/, skyNode.contractService.callContractWrite(skyNode.contractService.SubscriptionBalance.updateBalance(nftID, [subnetID]))];
            case 1:
                resp = _a.sent();
                return [2 /*return*/, resp];
        }
    });
}); };
