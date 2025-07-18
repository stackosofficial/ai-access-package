import { AIModelResponse, ENVDefinition, JsonSchema } from "../../types/types";
import { AccountNFT, APICallReturn, UrsulaAuth } from "@decloudlabs/skynet/lib/types/types";
import { sleep } from "@decloudlabs/skynet/lib/utils/utils";
import BalanceExtractService from "./balanceExtractService";
import ServerBalanceDatabaseService from "./serverBalanceDatabaseService";
import ENVConfig from "../../core/envConfig";
import { ethers } from "ethers";
import axios from "axios";
import SkyMainNodeJS from "@decloudlabs/skynet/lib/services/SkyMainNodeJS";

export default class BalanceRunMain {
  RUN_DURATION: number;
  nextRunTime: number;
  envConfig: ENVConfig;
  balanceExtractService: BalanceExtractService;
  serverBalanceDatabaseService: ServerBalanceDatabaseService;
  signer: ethers.Wallet;
  jsonProvider: ethers.JsonRpcProvider;
  skyNode: SkyMainNodeJS;

  constructor(env: ENVDefinition, extractCostTime: number, skyNode: SkyMainNodeJS) {
    this.RUN_DURATION = 5000;
    this.envConfig = new ENVConfig(env);
    this.nextRunTime = new Date().getTime();

    this.jsonProvider = new ethers.JsonRpcProvider(
      this.envConfig.env.JSON_RPC_PROVIDER,
      undefined
    );

    this.signer = new ethers.Wallet(
      this.envConfig.env.WALLET_PRIVATE_KEY,
      this.jsonProvider
    );

    this.serverBalanceDatabaseService = new ServerBalanceDatabaseService(
      this.envConfig
    );

    this.balanceExtractService = new BalanceExtractService(
      this.envConfig,
      this.serverBalanceDatabaseService
    );
    this.skyNode = skyNode;
  }

  setup = async () => {
    try {
      const UPDATE_DURATION = 10 * 1000;
      this.RUN_DURATION = UPDATE_DURATION;

      await this.serverBalanceDatabaseService.setup();
      await this.balanceExtractService.setup();

      return true;
    } catch (err: any) {
      const error: Error = err;
      console.error("❌ Main setup error:", error);
      return false;
    }
  };

  update = async () => {
    while (true) {
      {
        const curTime = new Date().getTime();
        const sleepDur = this.nextRunTime - curTime;
        await sleep(sleepDur);
        this.nextRunTime = new Date().getTime() + this.RUN_DURATION;
      }

      try {
        await this.balanceExtractService.update();
      } catch (err: any) {
        const error: Error = err;
        console.error("❌ Error in update:", error);
      }
    }
  };

  addCost = async (
    accountNFT: AccountNFT,
    cost: string
  ): Promise<APICallReturn<boolean>> => {
    const extractBalanceResp =
      await this.serverBalanceDatabaseService.getExtractBalance(accountNFT);
    if (!extractBalanceResp.success) {
      console.error("❌ Failed to get extract balance:", extractBalanceResp.data);
      return extractBalanceResp;
    }

    const resp = await this.serverBalanceDatabaseService.setExtractBalance(
      accountNFT,
      (BigInt(extractBalanceResp.data?.costs || 0) + BigInt(cost)).toString()
    );
    if (!resp.success) {
      return {
        success: false,
        data: new Error("Failed to set extract balance"),
      };
    }
    return { success: true, data: true };
  };

  async callAIModel(
    prompt: string,
    system_prompt?: string,
    model: string[] = ["qwen/qwen3-14b"],
    temperature?: number,
    response_type?: string,
    response_schema?: JsonSchema,
  ): Promise<any> {
    const skyNode = this.skyNode;
    if(!skyNode){
      return {
        success: false,
        data: new Error("SkyNode not initialized"),
      };
    }

    const userAuthPayload = await skyNode.appManager.getUrsulaAuth();
    const accountNFT: AccountNFT = {
      collectionID: "0",
      nftID: "622"
    }

    if(!userAuthPayload.success){
      return {
        success: false,
        data: new Error("Failed to get user auth payload"),
      };
    }

    // Prepare request data with optional parameters
    const requestData: any = {
      prompt,
      userAuthPayload: userAuthPayload.data,
      accountNFT,
      model,
      response_format: 'json_object'
    };

    // Add optional parameters if provided
    if (system_prompt) {
      requestData.system_prompt = system_prompt;
    }
    if (temperature !== undefined) {
      requestData.temperature = temperature;
    }
    if (response_type) {
      requestData.response_type = response_type;
    }
    if (response_schema) {
      requestData.response_schema = response_schema;
    }

    const response = await axios({
      method: "POST",
      url: `https://openrouter-c0n623.stackos.io/natural-request`,
      data: requestData,
      headers: {
        "Content-Type": "application/json",
      },
    });
    return response.data;
  }
}
