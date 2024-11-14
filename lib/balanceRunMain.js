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
var utils_1 = require("@decloudlabs/skynet/lib/utils/utils");
var balanceExtractService_1 = __importDefault(require("./balanceExtractService"));
var balanceSettleService_1 = __importDefault(require("./balanceSettleService"));
var serverBalanceDatabaseService_1 = __importDefault(require("./serverBalanceDatabaseService"));
var ethersConfig_1 = require("@decloudlabs/sky-cluster-operator/lib/config/ethersConfig");
var envConfig_1 = require("@decloudlabs/sky-cluster-operator/lib/config/envConfig");
var express_1 = __importDefault(require("express"));
var cors_1 = __importDefault(require("cors"));
var nftEventRouter_1 = require("@decloudlabs/sky-cluster-operator/lib/express/modules/nftEvent/nftEventRouter");
var CostApplierService_1 = __importDefault(require("./CostApplierService"));
var initExpress = function (operatorMain) {
    var app = (0, express_1.default)();
    var apiRouter = new nftEventRouter_1.NFTEventRouter(operatorMain.eventProcessor);
    apiRouter.setup();
    app.use((0, cors_1.default)());
    // body parser
    app.use(express_1.default.json());
    var PORT = process.env.PORT || 8000;
    app.get("/", function (req, res) {
        return res.status(200).send("welcome to the cluster operator service");
    });
    app.use("/api/nftevent", apiRouter.getRouter());
    app.listen(PORT, function () {
        console.log("Server listening on port ", PORT);
    });
};
var BalanceRunMain = /** @class */ (function () {
    function BalanceRunMain(appFunctions, checkBalanceCondition, applyCosts, extractCostTime) {
        var _this = this;
        // addSetupLog = async (type: SystemLog["logType"], message: string) => {
        //     await this.systemLogService.addSystemLog({
        //         timestamp: new Date(),
        //         operation: "main.setup",
        //         message: message,
        //         logType: type,
        //     });
        // };
        // addUpdateLog = async (type: SystemLog["logType"], message: string) => {
        //     await this.systemLogService.addSystemLog({
        //         timestamp: new Date(),
        //         operation: "main.update",
        //         message: message,
        //         logType: type,
        //     });
        // };
        this.setup = function () { return __awaiter(_this, void 0, void 0, function () {
            var UPDATE_DURATION, err_1, error;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 5, , 6]);
                        this.envConfig.setupENV();
                        UPDATE_DURATION = this.envConfig.SYSTEM_ENV.UPDATE_DURATION;
                        this.RUN_DURATION = UPDATE_DURATION;
                        // await this.nftLogService.setup();
                        // await this.heartBeatService.setup();
                        // await this.databaseService.setup();
                        // await this.web3Service.setup();
                        // await this.contractService.setup();
                        // await this.eventProcessor.setup();
                        // await this.bootupEventCollectService.setup();
                        // await this.eventAction.setup();
                        // await this.appStatusLogService.setup();
                        // await this.processCheckService.setup();
                        // await this.eventFetcherService.setup();
                        return [4 /*yield*/, this.serverBalanceDatabaseService.setup()];
                    case 1:
                        // await this.nftLogService.setup();
                        // await this.heartBeatService.setup();
                        // await this.databaseService.setup();
                        // await this.web3Service.setup();
                        // await this.contractService.setup();
                        // await this.eventProcessor.setup();
                        // await this.bootupEventCollectService.setup();
                        // await this.eventAction.setup();
                        // await this.appStatusLogService.setup();
                        // await this.processCheckService.setup();
                        // await this.eventFetcherService.setup();
                        _a.sent();
                        return [4 /*yield*/, this.balanceSettleService.setup()];
                    case 2:
                        _a.sent();
                        return [4 /*yield*/, this.balanceExtractService.setup()];
                    case 3:
                        _a.sent();
                        return [4 /*yield*/, this.costApplierService.setup()];
                    case 4:
                        _a.sent();
                        // initExpress(this);
                        return [2 /*return*/, true];
                    case 5:
                        err_1 = _a.sent();
                        error = err_1;
                        console.log("main setup error: ", error);
                        return [2 /*return*/, false];
                    case 6: return [2 /*return*/];
                }
            });
        }); };
        this.update = function () { return __awaiter(_this, void 0, void 0, function () {
            var curTime, sleepDur, err_2, error;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!true) return [3 /*break*/, 8];
                        curTime = new Date().getTime();
                        sleepDur = this.nextRunTime - curTime;
                        return [4 /*yield*/, (0, utils_1.sleep)(sleepDur)];
                    case 1:
                        _a.sent();
                        this.nextRunTime = new Date().getTime() + this.RUN_DURATION;
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 6, , 7]);
                        // await this.eventFetcherService.update();
                        // await this.eventProcessor.update();
                        // await this.bootupEventCollectService.update();
                        // await this.nftLogService.update();
                        // await this.appStatusLogService.update();
                        // await this.processCheckService.update();
                        // await this.systemLogService.update();
                        // await this.heartBeatService.update();
                        return [4 /*yield*/, this.balanceSettleService.update()];
                    case 3:
                        // await this.eventFetcherService.update();
                        // await this.eventProcessor.update();
                        // await this.bootupEventCollectService.update();
                        // await this.nftLogService.update();
                        // await this.appStatusLogService.update();
                        // await this.processCheckService.update();
                        // await this.systemLogService.update();
                        // await this.heartBeatService.update();
                        _a.sent();
                        return [4 /*yield*/, this.balanceExtractService.update()];
                    case 4:
                        _a.sent();
                        return [4 /*yield*/, this.costApplierService.update()];
                    case 5:
                        _a.sent();
                        return [3 /*break*/, 7];
                    case 6:
                        err_2 = _a.sent();
                        error = err_2;
                        console.error("error in update: ", error);
                        return [3 /*break*/, 7];
                    case 7: return [3 /*break*/, 0];
                    case 8: return [2 /*return*/];
                }
            });
        }); };
        this.RUN_DURATION = 5000;
        this.envConfig = new envConfig_1.ENVConfig();
        this.nextRunTime = new Date().getTime();
        this.appFunctions = appFunctions;
        this.web3Service = new ethersConfig_1.Web3Service(this.envConfig);
        // this.contractService = new ContractService(
        //     this.web3Service,
        //     this.envConfig,
        // );
        // this.databaseService = new DatabaseService(this.envConfig);
        // this.systemLogService = new SystemLogService(
        //     this.databaseService,
        //     this.envConfig,
        // );
        // this.nftLogService = new NFTLogService(
        //     this.databaseService,
        //     this.systemLogService,
        //     this.envConfig,
        // );
        // this.eventProcessor = new NFTEventProcessor(this.contractService);
        // this.nftBalanceAPIService = new NFTBalanceAPIService(this.envConfig);
        // this.bootupEventCollectService = new BootEventCollectService(
        //     this.databaseService,
        //     this.contractService,
        //     this.eventProcessor,
        //     this.web3Service,
        //     this.systemLogService,
        //     this.envConfig,
        // );
        // this.appStatusLogService = new AppStatusService(
        //     this.nftLogService,
        //     this.envConfig,
        // );
        // this.eventAction = new EventAction(
        //     this.contractService,
        //     this.web3Service,
        //     this.nftLogService,
        //     this.nftBalanceAPIService,
        //     this.systemLogService,
        //     this.appStatusLogService,
        //     this.envConfig,
        //     this.appFunctions,
        // );
        // this.heartBeatService = new HeartBeatService(
        //     this.databaseService,
        //     this.systemLogService,
        //     this.envConfig,
        // );
        // this.processCheckService = new ProcessCheckService(
        //     this.systemLogService,
        // );
        // this.eventFetcherService = new EventFetcherService(
        //     this.databaseService,
        //     this.systemLogService,
        //     this.eventProcessor,
        //     this.envConfig,
        // );
        this.serverBalanceDatabaseService = new serverBalanceDatabaseService_1.default();
        this.balanceSettleService = new balanceSettleService_1.default(this.serverBalanceDatabaseService, this.envConfig, this.web3Service, checkBalanceCondition);
        this.balanceExtractService = new balanceExtractService_1.default();
        this.costApplierService = new CostApplierService_1.default(this.serverBalanceDatabaseService, this.envConfig, this.web3Service, applyCosts, extractCostTime);
        // setEventAction(this.eventAction);
        // this.eventProcessor.setRunTick(true);
    }
    return BalanceRunMain;
}());
exports.default = BalanceRunMain;
