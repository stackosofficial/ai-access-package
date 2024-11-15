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
var nftCostsCollection;
var NFT_UPDATE_INTERVAL = 30000;
var batchSize = 100;
var ServerBalanceDatabaseService = /** @class */ (function () {
    function ServerBalanceDatabaseService() {
        var _this = this;
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
        this.setBalance = function (nftID, price) { return __awaiter(_this, void 0, void 0, function () {
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
        this.getBalance = function (nftID) { return __awaiter(_this, void 0, void 0, function () {
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
        this.addBalance = function (nftID, price) { return __awaiter(_this, void 0, void 0, function () {
            var balance, newBalance;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.getBalance(nftID)];
                    case 1:
                        balance = _b.sent();
                        if (balance.success == false)
                            return [2 /*return*/, balance];
                        if (!balance.data) return [3 /*break*/, 3];
                        newBalance = ethers_1.ethers.BigNumber.from(((_a = balance.data) === null || _a === void 0 ? void 0 : _a.costs) || 0).add(ethers_1.ethers.BigNumber.from(price));
                        return [4 /*yield*/, this.setBalance(nftID, newBalance.toString())];
                    case 2: return [2 /*return*/, _b.sent()];
                    case 3: return [4 /*yield*/, this.setBalance(nftID, price)];
                    case 4: return [2 /*return*/, _b.sent()];
                }
            });
        }); };
        this.getNFTCostCursor = function (batchSize) {
            if (batchSize === void 0) { batchSize = 1000; }
            var cursor = nftCostsCollection.find({});
            cursor.batchSize(batchSize);
            return cursor;
        };
        this.deleteNFTCosts = function (nftIDs) { return __awaiter(_this, void 0, void 0, function () {
            var resp;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, utils_1.apiCallWrapper)(nftCostsCollection.deleteMany({ nftID: { $in: nftIDs } }), function (res) { return res.deletedCount; })];
                    case 1:
                        resp = _a.sent();
                        return [2 /*return*/, resp];
                }
            });
        }); };
        this.setupDatabase = function () { return __awaiter(_this, void 0, void 0, function () {
            var MONGODB_URL, MONGODB_DBNAME, client, database;
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
                        nftCostsCollection = database.collection("nftCosts");
                        return [2 /*return*/];
                }
            });
        }); };
        this.update = function () { return __awaiter(_this, void 0, void 0, function () { return __generator(this, function (_a) {
            return [2 /*return*/];
        }); }); };
    }
    return ServerBalanceDatabaseService;
}());
exports.default = ServerBalanceDatabaseService;
