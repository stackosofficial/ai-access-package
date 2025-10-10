import { AIModelResponse, ENVDefinition, JsonSchema } from "../../types/types";
import { AccountNFT, APICallReturn, UrsulaAuth } from "@decloudlabs/skynet/lib/types/types";
import { sleep } from "@decloudlabs/skynet/lib/utils/utils";
import BalanceExtractService from "./balanceExtractService";
import ServerBalanceDatabaseService from "./serverBalanceDatabaseService";
import ENVConfig from "../../core/envConfig";
import { ethers } from "ethers";
import axios from "axios";
import SkyMainNodeJS from "@decloudlabs/skynet/lib/services/SkyMainNodeJS";
import { validatePayload, validateStructuredOutput, AIModelCallParams } from "./aiModelValidation";

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

  /**
   * Call AI Model with validation
   * @param params - AI model call parameters (typed for autocomplete and validation)
   * @param accountNFT - Account NFT for authentication
   * @returns Promise<any> - AI model response
   * 
   * @example
   * ```typescript
   * const response = await balanceRunMain.callAIModel({
   *   prompt: "What is AI?",
   *   model: "qwen/qwen3-14b",  // Optional, defaults to "qwen/qwen3-14b"
   *   system_prompt: "You are a helpful assistant",
   *   temperature: 0.7,
   *   response_type: "json_object",
   *   max_tokens: 1000
   * }, accountNFT);
   * ```
   */
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
      url: `http://localhost:3000/natural-request`,
      data: requestData,
      headers: {
        "Content-Type": "application/json",
      },
    });
    return response.data;
  }
}
