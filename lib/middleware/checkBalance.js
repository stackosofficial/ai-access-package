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
exports.checkBalance = void 0;
var init_1 = require("../init");
var dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
var checkBalance = function (req, res, next) { return __awaiter(void 0, void 0, void 0, function () {
    var readByte32, contractBasedDeploymentByte32, _a, nftId_1, userAuthPayload, message, signature, userAddress_1, skyNode_1, ownerAddress, callHasRole, _b, hasReadRoleResp, hasDeployerRoleResp, appList, _i, _c, app, err_1, error;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                _d.trys.push([0, 6, , 7]);
                readByte32 = "0x917ec7ea41e5f357223d15148fe9b320af36ca576055af433ea3445b39221799";
                contractBasedDeploymentByte32 = "0x503cf060389b91af8851125bd70ce66d16d12330718b103fc7674ef6d27e70c9";
                _a = req.body, nftId_1 = _a.nftId, userAuthPayload = _a.userAuthPayload;
                message = userAuthPayload.message, signature = userAuthPayload.signature, userAddress_1 = userAuthPayload.userAddress;
                console.log("nftId: ", nftId_1);
                if (!nftId_1) {
                    return [2 /*return*/, res.json({
                            success: false,
                            data: new Error("Not authorized to access this route").toString(),
                        })];
                }
                return [4 /*yield*/, (0, init_1.getSkyNode)()];
            case 1:
                skyNode_1 = _d.sent();
                return [4 /*yield*/, skyNode_1.contractService.AppNFT.ownerOf(nftId_1)];
            case 2:
                ownerAddress = _d.sent();
                console.log("ownerAddress", ownerAddress);
                console.log("userAddress", userAddress_1);
                if (!(ownerAddress.toLowerCase() !== userAddress_1.toLowerCase())) return [3 /*break*/, 4];
                console.log("inside if");
                callHasRole = function (roleValue) { return __awaiter(void 0, void 0, void 0, function () { return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, hasRole(nftId_1, roleValue, userAddress_1, skyNode_1.contractService)];
                        case 1: return [2 /*return*/, _a.sent()];
                    }
                }); }); };
                console.log("callHasRole", callHasRole);
                return [4 /*yield*/, Promise.all([
                        callHasRole(readByte32),
                        callHasRole(contractBasedDeploymentByte32),
                    ])];
            case 3:
                _b = _d.sent(), hasReadRoleResp = _b[0], hasDeployerRoleResp = _b[1];
                console.log("hasReadRoleResp", hasReadRoleResp);
                console.log("hasDeployerRoleResp", hasDeployerRoleResp);
                if (!hasReadRoleResp && !hasDeployerRoleResp) {
                    return [2 /*return*/, res.json({
                            success: false,
                            data: new Error("Not authorized to access this route").toString(),
                        })];
                }
                _d.label = 4;
            case 4:
                console.log("before appList");
                console.log("nftId", nftId_1);
                return [4 /*yield*/, skyNode_1.appManager.contractCall.getAppList(nftId_1)];
            case 5:
                appList = _d.sent();
                console.log("after appList");
                if (!appList.success) {
                    return [2 /*return*/, res.json({
                            success: false,
                            data: new Error("Not enough balance").toString(),
                        })];
                }
                console.log("app List", appList.data);
                for (_i = 0, _c = appList.data; _i < _c.length; _i++) {
                    app = _c[_i];
                    if (app.subnetList[0] === process.env.SUBNET_ID) {
                        if (app.appSubnetConfig[0].multiplier[0] == 1) {
                            return [2 /*return*/, next()];
                        }
                        else {
                            return [2 /*return*/, res.json({
                                    success: false,
                                    data: new Error("Not enough balance").toString(),
                                })];
                        }
                    }
                }
                return [2 /*return*/, res.json({
                        success: false,
                        data: new Error("No valid subscription found").toString(),
                    })];
            case 6:
                err_1 = _d.sent();
                error = err_1;
                return [2 /*return*/, res.json({
                        success: false,
                        data: error.toString(),
                    })];
            case 7: return [2 /*return*/];
        }
    });
}); };
exports.checkBalance = checkBalance;
var hasRole = function (nftId, roleValue, requester, contractService) { return __awaiter(void 0, void 0, void 0, function () {
    var result;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, contractService.callContractRead(contractService.AppNFT.hasRole(nftId, roleValue, requester), function (res) { return res; })];
            case 1:
                result = _a.sent();
                return [2 /*return*/, result];
        }
    });
}); };
