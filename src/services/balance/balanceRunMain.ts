import { AIModelResponse, ENVDefinition, JsonSchema } from "../../types/types";
import { AccountNFT, APICallReturn, UrsulaAuth } from "@decloudlabs/skynet/lib/types/types";
import { sleep } from "@decloudlabs/skynet/lib/utils/utils";
import BalanceExtractService from "./balanceExtractService";
import ENVConfig from "../../core/envConfig";
import { ethers } from "ethers";
import axios from "axios";
import SkyMainNodeJS from "@decloudlabs/skynet/lib/services/SkyMainNodeJS";
import { validatePayload, validateStructuredOutput, AIModelCallParams } from "./aiModelValidation";
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
      pool
    );
    this.skyNode = skyNode;
  }

  setup = async () => {
    try {
      const UPDATE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
      this.RUN_DURATION = UPDATE_DURATION;

      // Initialize base cost for this backend during setup
      const backendId = process.env.BACKEND_ID || 'default';
      await this.balanceExtractService.setup(backendId);

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
    walletAddress: string,
    cost: string
  ): Promise<APICallReturn<boolean>> => {
    try {
      // Ensure walletAddress is a string
      const walletAddressStr = String(walletAddress);
      
      // Get backend_id from environment
      const backendId = process.env.BACKEND_ID || 'default';

      // Add cost to database using the new fractional payment system
      // We store costs by wallet address, base cost is added automatically
      const result = await this.balanceExtractService.addCost(
        walletAddressStr,
        cost,
        backendId
      );

      if (!result.success) {
        console.error("❌ Failed to add cost to database:", result.data);
        return result;
      }

      console.log(`✅ Added cost for wallet ${walletAddressStr} (backend: ${backendId})`);
      return { success: true, data: true };
    } catch (error) {
      console.error("❌ Error in addCost:", error);
      return {
        success: false,
        data: error as Error
      };
    }
  };

  /**
   * Set base cost for this service
   * @param baseCostWei - Base cost in wei to add to every request
   * @returns Promise<APICallReturn<boolean>>
   */
  setBaseCost = async (baseCostWei: string): Promise<APICallReturn<boolean>> => {
    const backendId = process.env.BACKEND_ID || 'default';
    return await this.balanceExtractService.setBaseCost(backendId, baseCostWei);
  };

  /**
   * Get current base cost for this service
   * @returns Promise<string> - Base cost in wei
   */
  getBaseCost = async (): Promise<string> => {
    const backendId = process.env.BACKEND_ID || 'default';
    return await this.balanceExtractService.getBaseCost(backendId);
  };

  async callAIModel(
    params: AIModelCallParams,
    accountNFT: AccountNFT
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

    // Prepare request data with validated parameters
    const requestData: any = {
      ...params,
      userAuthPayload: userAuthPayload.data,
      accountNFT,
      model: params.model || "Qwen/Qwen3-Next-80B-A3B-Thinking",
      response_format: 'json_object'
    };

    // Validate the request payload
    const validation = validatePayload(requestData);
    if (!validation.success) {
      console.error('❌ AI Model request validation failed:', validation.error);
      return {
        success: false,
        data: new Error(`Validation failed: ${validation.error}`),
      };
    }

    // Validate structured output if applicable
    const structuredValidation = validateStructuredOutput(requestData);
    if (!structuredValidation.success) {
      console.error('❌ Structured output validation failed:', structuredValidation.error);
      return {
        success: false,
        data: new Error(`Structured output validation failed: ${structuredValidation.error}`),
      };
    }

    console.log('✅ AI Model request validated successfully');

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
