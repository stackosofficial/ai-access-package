import SkyMainNodeJS from "@decloudlabs/skynet/lib/services/SkyMainNodeJS";
import BalanceRunMain from "./balanceRunMain";
import { ENVDefinition, NFTCosts } from "./types/types";
import { APICallReturn } from "@decloudlabs/skynet/lib/types/types";
import { checkBalance } from "./middleware/checkBalance";
import { protect } from "./middleware/auth";
import express, { Request, Response, NextFunction } from "express";
let skyNode: SkyMainNodeJS;

export const setupSkyNode = async (skyNodeParam: SkyMainNodeJS) => {
  skyNode = skyNodeParam;
};

export const getSkyNode = () => {
  return skyNode;
};

export const initAIAccessPoint = async (
  env: ENVDefinition,
  skyNodeParam: SkyMainNodeJS,
  app: express.Application,
  runNaturalFunction: (
    req: Request,
    res: Response,
    balanceRunMain: BalanceRunMain
  ) => Promise<void>,
  runUpdate: boolean
) => {
  await setupSkyNode(skyNodeParam);
  const balanceRunMain = new BalanceRunMain(env, 60 * 1000);

  const contAddrResp = await skyNode.contractService.callContractRead<
    string,
    string
  >(
    skyNode.contractService.BalanceSettler.getSubnetPriceCalculator(
      balanceRunMain.envConfig.env.SUBNET_ID
    ),
    (res) => res
  );
  if (contAddrResp.success == false) return contAddrResp;
  const contractAddress = contAddrResp.data;
  console.log("contractAddress", contractAddress);
  balanceRunMain.envConfig.env.SERVER_COST_CONTRACT_ADDRESS = contractAddress;

  await balanceRunMain.setup();
  if (runUpdate) {
    balanceRunMain.update();
  }

  app.post(
    "/natural-request",
    protect,
    (req: Request, res: Response, next: NextFunction) =>
      checkBalance(req, res, next, contractAddress),
    (req: Request, res: Response, next: NextFunction) =>
      runNaturalFunction(req, res, balanceRunMain).catch(next)
  );
  return balanceRunMain;
};
