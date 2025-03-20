import SkyMainNodeJS from "@decloudlabs/skynet/lib/services/SkyMainNodeJS";
import BalanceRunMain from "./balanceRunMain";
import { ENVDefinition, NFTCosts } from "./types/types";
import { APICallReturn } from "@decloudlabs/skynet/lib/types/types";
import { checkBalance } from "./middleware/checkBalance";
import { protect } from "./middleware/auth";
import { parseAuth } from "./middleware/parseAuth";
import express, { Request, Response, NextFunction } from "express";
import multer from "multer";

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
  runUpdate: boolean,
  upload?: multer.Multer
): Promise<APICallReturn<BalanceRunMain>> => {
  try {
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

    // Setup routes
    if (upload) {
      app.post(
        "/natural-request",
        upload.array("files"),
        parseAuth,
        protect,
        (req: Request, res: Response, next: NextFunction) =>
          checkBalance(req, res, next, contractAddress),
        (req: Request, res: Response, next: NextFunction) =>
          runNaturalFunction(req, res, balanceRunMain).catch(next)
      );
    } else {
      app.post(
        "/natural-request",
        protect,
        (req: Request, res: Response, next: NextFunction) =>
          checkBalance(req, res, next, contractAddress),
        (req: Request, res: Response, next: NextFunction) =>
          runNaturalFunction(req, res, balanceRunMain).catch(next)
      );
    }

    // Create API endpoint for index creation instructions
    app.get("/firebase-indexes", (req: Request, res: Response) => {
      const subnetId = balanceRunMain.envConfig.env.SUBNET_ID;
      const indexes = [
        {
          collection: `nft_extract_costs_${subnetId}`,
          fields: [
            { fieldPath: "collection_id", order: "ASCENDING" },
            { fieldPath: "nft_id", order: "ASCENDING" },
            { fieldPath: "created_at", order: "DESCENDING" },
          ],
        },
        {
          collection: `nft_extract_costs_history_${subnetId}`,
          fields: [
            { fieldPath: "applied", order: "ASCENDING" },
            { fieldPath: "created_at", order: "DESCENDING" },
          ],
        },
      ];

      res.json({
        message: "Required Firebase indexes - create these in Firebase console",
        indexes,
        instructions:
          "Visit the Firebase console and manually create these indexes or use the links in the server logs.",
      });
    });

    return { success: true, data: balanceRunMain };
  } catch (error: any) {
    console.error("Error in initAIAccessPoint:", error);
    return {
      success: false,
      data: new Error(`Failed to initialize AI Access Point: ${error.message}`),
    };
  }
};
