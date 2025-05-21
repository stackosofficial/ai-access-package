"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("@decloudlabs/skynet/lib/utils/utils");
const balanceExtractService_1 = __importDefault(require("./balanceExtractService"));
const serverBalanceDatabaseService_1 = __importDefault(require("./serverBalanceDatabaseService"));
const envConfig_1 = __importDefault(require("./envConfig"));
const ethers_1 = require("ethers");
const axios_1 = __importDefault(require("axios"));
class BalanceRunMain {
    constructor(env, extractCostTime) {
        this.setup = async () => {
            try {
                const UPDATE_DURATION = 10 * 1000;
                this.RUN_DURATION = UPDATE_DURATION;
                await this.serverBalanceDatabaseService.setup();
                await this.balanceExtractService.setup();
                return true;
            }
            catch (err) {
                const error = err;
                console.log("main setup error: ", error);
                return false;
            }
        };
        this.update = async () => {
            while (true) {
                {
                    const curTime = new Date().getTime();
                    const sleepDur = this.nextRunTime - curTime;
                    await (0, utils_1.sleep)(sleepDur);
                    this.nextRunTime = new Date().getTime() + this.RUN_DURATION;
                }
                try {
                    await this.balanceExtractService.update();
                }
                catch (err) {
                    const error = err;
                    console.error("error in update: ", error);
                }
            }
        };
        this.addCost = async (accountNFT, cost) => {
            const extractBalanceResp = await this.serverBalanceDatabaseService.getExtractBalance(accountNFT);
            if (!extractBalanceResp.success) {
                console.error("failed to get extract balance: ", extractBalanceResp.data);
                return extractBalanceResp;
            }
            console.log("extract balance: ", extractBalanceResp.data);
            const resp = await this.serverBalanceDatabaseService.setExtractBalance(accountNFT, (BigInt(extractBalanceResp.data?.costs || 0) + BigInt(cost)).toString());
            if (!resp.success) {
                return {
                    success: false,
                    data: new Error("Failed to set extract balance"),
                };
            }
            return { success: true, data: true };
        };
        this.RUN_DURATION = 5000;
        this.envConfig = new envConfig_1.default(env);
        this.nextRunTime = new Date().getTime();
        this.jsonProvider = new ethers_1.ethers.JsonRpcProvider(this.envConfig.env.JSON_RPC_PROVIDER, undefined);
        console.log("json rpc: ", this.envConfig.env.JSON_RPC_PROVIDER);
        this.signer = new ethers_1.ethers.Wallet(this.envConfig.env.WALLET_PRIVATE_KEY, this.jsonProvider);
        this.serverBalanceDatabaseService = new serverBalanceDatabaseService_1.default(this.envConfig);
        this.balanceExtractService = new balanceExtractService_1.default(this.envConfig, this.serverBalanceDatabaseService);
    }
    async callAIModel(prompt, userAuthPayload, accountNFT) {
        const response = await (0, axios_1.default)({
            method: "POST",
            url: `https://openaiservice-c0n1.stackos.io/natural-request`,
            data: {
<<<<<<< HEAD
                prompt: prompt,
=======
                prompt,
>>>>>>> 48743b5 (Initial commit with modified SDK With API Feature)
                userAuthPayload,
                accountNFT,
            },
            headers: {
                "Content-Type": "application/json",
            },
        });
        return response.data;
    }
}
exports.default = BalanceRunMain;
