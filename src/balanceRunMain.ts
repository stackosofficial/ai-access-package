import { AIModelResponse, ENVDefinition } from "./types/types";
import { AccountNFT, APICallReturn } from "@decloudlabs/skynet/lib/types/types";
import { sleep } from "@decloudlabs/skynet/lib/utils/utils";
import BalanceExtractService from "./balanceExtractService";
import ServerBalanceDatabaseService from "./serverBalanceDatabaseService";
import ENVConfig from "./envConfig";
import { ethers } from "ethers";
import { OpenAI } from "openai";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export default class BalanceRunMain {
  RUN_DURATION: number;
  nextRunTime: number;
  envConfig: ENVConfig;
  balanceExtractService: BalanceExtractService;
  serverBalanceDatabaseService: ServerBalanceDatabaseService;
  signer: ethers.Wallet;
  jsonProvider: ethers.JsonRpcProvider;
  openAI: OpenAI;

  constructor(env: ENVDefinition, extractCostTime: number) {
    this.RUN_DURATION = 5000;
    this.envConfig = new ENVConfig(env);
    this.nextRunTime = new Date().getTime();

    this.jsonProvider = new ethers.JsonRpcProvider(
      this.envConfig.env.JSON_RPC_PROVIDER,
      undefined
      // option,
    );
    console.log("json rpc: ", this.envConfig.env.JSON_RPC_PROVIDER);

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

    this.openAI = new OpenAI({
      apiKey: this.envConfig.env.OPENAI_API_KEY,
    });
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
      console.log("main setup error: ", error);
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
        console.error("error in update: ", error);
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
      console.error("failed to get extract balance: ", extractBalanceResp.data);
      return extractBalanceResp;
    }

    console.log("extract balance: ", extractBalanceResp.data);

    const resp = await this.serverBalanceDatabaseService.setExtractBalance(
      accountNFT,
      cost
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
    messages: ChatCompletionMessageParam[]
  ): Promise<AIModelResponse> {
    const completion = await this.openAI.chat.completions.create({
      messages,
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
    });

    return {
      content: completion.choices[0].message.content || "",
    };
  }
}
