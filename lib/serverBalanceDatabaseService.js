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
Object.defineProperty(exports, "__esModule", { value: true });
var utils_1 = require("@decloudlabs/skynet/lib/utils/utils");
var ethers_1 = require("ethers");
var mongodb_1 = require("mongodb");
var nftTrackerCollection;
var nftExtractCollection;
var NFT_UPDATE_INTERVAL = 30000;
var batchSize = 100;
var ServerBalanceDatabaseService = /** @class */ (function () {
    function ServerBalanceDatabaseService(envConfig) {
        var _this = this;
        this.client = null;
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
        this.setTrackerBalance = function (nftID, price) { return __awaiter(_this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, utils_1.apiCallWrapper)(nftTrackerCollection.updateOne({}, {
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
        this.getTrackerBalance = function (nftID) { return __awaiter(_this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, utils_1.apiCallWrapper)(nftTrackerCollection.findOne({ nftID: nftID }), function (res) { return res; })];
                    case 1:
                        result = _a.sent();
                        return [2 /*return*/, result];
                }
            });
        }); };
        this.addTrackerBalance = function (nftID, price) { return __awaiter(_this, void 0, void 0, function () {
            var balance, newBalance;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.getTrackerBalance(nftID)];
                    case 1:
                        balance = _b.sent();
                        if (balance.success == false)
                            return [2 /*return*/, balance];
                        if (!balance.data) return [3 /*break*/, 3];
                        newBalance = ethers_1.ethers.BigNumber.from(((_a = balance.data) === null || _a === void 0 ? void 0 : _a.costs) || 0).add(ethers_1.ethers.BigNumber.from(price));
                        return [4 /*yield*/, this.setTrackerBalance(nftID, newBalance.toString())];
                    case 2: return [2 /*return*/, _b.sent()];
                    case 3: return [4 /*yield*/, this.setTrackerBalance(nftID, price)];
                    case 4: return [2 /*return*/, _b.sent()];
                }
            });
        }); };
        this.getNFTTrackerCursor = function (batchSize) {
            if (batchSize === void 0) { batchSize = 1000; }
            var cursor = nftTrackerCollection.find({});
            cursor.batchSize(batchSize);
            return cursor;
        };
        this.deleteNFTTracker = function (nftIDs) { return __awaiter(_this, void 0, void 0, function () {
            var resp;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, utils_1.apiCallWrapper)(nftTrackerCollection.deleteMany({ nftID: { $in: nftIDs } }), function (res) { return res.deletedCount; })];
                    case 1:
                        resp = _a.sent();
                        return [2 /*return*/, resp];
                }
            });
        }); };
        this.setExtractBalance = function (nftID, price) { return __awaiter(_this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, utils_1.apiCallWrapper)(nftExtractCollection.updateOne({}, {
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
        this.getExtractBalance = function (nftID) { return __awaiter(_this, void 0, void 0, function () {
            var result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, utils_1.apiCallWrapper)(nftExtractCollection.findOne({ nftID: nftID }), function (res) { return res; })];
                    case 1:
                        result = _a.sent();
                        return [2 /*return*/, result];
                }
            });
        }); };
        this.addExtractBalance = function (nftID, price) { return __awaiter(_this, void 0, void 0, function () {
            var balance, newBalance;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.getExtractBalance(nftID)];
                    case 1:
                        balance = _b.sent();
                        if (balance.success == false)
                            return [2 /*return*/, balance];
                        if (!balance.data) return [3 /*break*/, 3];
                        newBalance = ethers_1.ethers.BigNumber.from(((_a = balance.data) === null || _a === void 0 ? void 0 : _a.costs) || 0).add(ethers_1.ethers.BigNumber.from(price));
                        return [4 /*yield*/, this.setExtractBalance(nftID, newBalance.toString())];
                    case 2: return [2 /*return*/, _b.sent()];
                    case 3: return [4 /*yield*/, this.setExtractBalance(nftID, price)];
                    case 4: return [2 /*return*/, _b.sent()];
                }
            });
        }); };
        this.getNFTExtractCursor = function (batchSize) {
            if (batchSize === void 0) { batchSize = 1000; }
            var cursor = nftExtractCollection.find({});
            cursor.batchSize(batchSize);
            return cursor;
        };
        this.deleteNFTExtract = function (nftIDs) { return __awaiter(_this, void 0, void 0, function () {
            var resp;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, utils_1.apiCallWrapper)(nftExtractCollection.deleteMany({ nftID: { $in: nftIDs } }), function (res) { return res.deletedCount; })];
                    case 1:
                        resp = _a.sent();
                        return [2 /*return*/, resp];
                }
            });
        }); };
        this.setupDatabase = function () { return __awaiter(_this, void 0, void 0, function () {
            var MONGODB_URL, MONGODB_DBNAME, _a, database, collectionName;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        MONGODB_URL = this.envConfig.env.MONGODB_URL || '';
                        MONGODB_DBNAME = this.envConfig.env.MONGODB_DBNAME || '';
                        _a = this;
                        return [4 /*yield*/, mongodb_1.MongoClient.connect(MONGODB_URL)];
                    case 1:
                        _a.client = _b.sent();
                        console.log("created database client: ".concat(MONGODB_URL));
                        database = this.client.db(MONGODB_DBNAME);
                        console.log("connected to database: ".concat(MONGODB_DBNAME));
                        collectionName = this.envConfig.env.MONGODB_COLLECTION_NAME || '';
                        console.log("checking mongodb cred:", MONGODB_URL, MONGODB_DBNAME, collectionName);
                        nftTrackerCollection = database.collection("".concat(collectionName, "_tracker"));
                        nftExtractCollection = database.collection("".concat(collectionName, "_extract"));
                        return [2 /*return*/];
                }
            });
        }); };
        this.update = function () { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
            return [2 /*return*/];
        }); }); };
        this.setTrackerAndExtractBalance = function (nftID, price) { return __awaiter(_this, void 0, void 0, function () {
            var session, error_1;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.client) {
                            return [2 /*return*/, { success: false, data: new Error('Database client not initialized') }];
                        }
                        session = this.client.startSession();
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, 4, 6]);
                        return [4 /*yield*/, session.withTransaction(function () { return __awaiter(_this, void 0, void 0, function () {
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0: 
                                        // Set both balances within the same transaction
                                        return [4 /*yield*/, nftTrackerCollection.updateOne({ nftID: nftID }, { $set: { nftID: nftID, costs: price } }, { upsert: true, session: session })];
                                        case 1:
                                            // Set both balances within the same transaction
                                            _a.sent();
                                            return [4 /*yield*/, nftExtractCollection.updateOne({ nftID: nftID }, { $set: { nftID: nftID, costs: price } }, { upsert: true, session: session })];
                                        case 2:
                                            _a.sent();
                                            return [2 /*return*/];
                                    }
                                });
                            }); })];
                    case 2:
                        _a.sent();
                        return [2 /*return*/, { success: true, data: true }];
                    case 3:
                        error_1 = _a.sent();
                        return [2 /*return*/, {
                                success: false,
                                data: new Error("unknown error")
                            }];
                    case 4: return [4 /*yield*/, session.endSession()];
                    case 5:
                        _a.sent();
                        return [7 /*endfinally*/];
                    case 6: return [2 /*return*/];
                }
            });
        }); };
        this.envConfig = envConfig;
    }
    return ServerBalanceDatabaseService;
}());
exports.default = ServerBalanceDatabaseService;
