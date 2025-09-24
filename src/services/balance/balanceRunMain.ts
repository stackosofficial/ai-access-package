import { AIModelResponse, ENVDefinition, JsonSchema } from "../../types/types";
import { AccountNFT, APICallReturn, UrsulaAuth } from "@decloudlabs/skynet/lib/types/types";
import { sleep } from "@decloudlabs/skynet/lib/utils/utils";
import BalanceExtractService from "./balanceExtractService";
import ENVConfig from "../../core/envConfig";
import { ethers } from "ethers";
import axios from "axios";
import SkyMainNodeJS from "@decloudlabs/skynet/lib/services/SkyMainNodeJS";
import { getSkyNode } from "../../core/init";
import { Pool } from "pg";

export default class BalanceRunMain {
  RUN_DURATION: number;
  nextRunTime: number;
  envConfig: ENVConfig;
  balanceExtractService: BalanceExtractService;
  signer: ethers.Wallet;
  jsonProvider: ethers.JsonRpcProvider;
  skyNode: SkyMainNodeJS;

  constructor(env: ENVDefinition, extractCostTime: number, skyNode: SkyMainNodeJS, pool: Pool) {
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

    this.balanceExtractService = new BalanceExtractService(
      this.envConfig,
      pool
    );
    this.skyNode = skyNode;
  }

  setup = async () => {
    try {
      const UPDATE_DURATION = 10 * 1000;
      this.RUN_DURATION = UPDATE_DURATION;

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
    apiKeyId: string,
    cost: string
  ): Promise<APICallReturn<boolean>> => {
    try {
      // Add cost to database using the new fractional payment system
      // We store costs by API key ID, not wallet address
      const result = await this.balanceExtractService.addCost(
        apiKeyId,
        this.envConfig.env.SUBNET_ID,
        cost
      );

      if (!result.success) {
        console.error("❌ Failed to add cost to database:", result.data);
        return result;
      }

      console.log(`✅ Added cost ${cost} wei for API key ${apiKeyId}`);
      return { success: true, data: true };
    } catch (error) {
      console.error("❌ Error in addCost:", error);
      return {
        success: false,
        data: error as Error
      };
    }
  };

  async callAIModel(
    prompt: string,
    accountNFT: AccountNFT,
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
