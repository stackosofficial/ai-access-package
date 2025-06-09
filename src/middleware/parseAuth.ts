
declare module "express-serve-static-core" {
  interface Request {
    authInfo?: {
      apiKey: string;
      type: string;
    };
  }
}

declare global {
  var apiKeyService: {
    validateApiKey: (apiKey: string) => Promise<boolean>;
    getApiKeyDetails: (apiKey: string) => Promise<any>;
  };
}
import { Request, Response, NextFunction } from "express";

console.log("parseAuth middleware triggered");

export const parseAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiKey = req.headers["x-api-key"];

    if (apiKey && typeof apiKey === "string") {
      req.authInfo = { apiKey, type: "apiKey" };

      if (global.apiKeyService) {
        try {
          const valid = await global.apiKeyService.validateApiKey(apiKey);
          if (!valid) {
            return res.status(401).json({
              success: false,
              data: "Invalid API key",
            });
          }
          
          // Get API key details
          const keyDetails = await global.apiKeyService.getApiKeyDetails(apiKey);
          if (!keyDetails) {
            return res.status(401).json({
              success: false,
              data: "Could not retrieve API key details",
            });
          }

          req.body.userAuthPayload = {
            userAddress: keyDetails.wallet_address,
            signature: "API_KEY_AUTH",
            message:Date.now().toString(),
          };

          req.body.accountNFT = {
            collectionID: keyDetails.nft_collection_id,
            nftID: keyDetails.nft_id,
          };
        } catch (error) {
          return res.status(401).json({ success: false, data: "Invalid API key" });
        }
      }

      return next();
    }

    // Existing behavior for userAuthPayload and accountNFT from body
    const userAuthPayloadStr = req.body.userAuthPayload;
    const accountNFTStr = req.body.accountNFT;

    if (!userAuthPayloadStr || !accountNFTStr) {
      return res.status(400).json({
        success: false,
        data: "Missing userAuthPayload or accountNFT",
      });
    }

    let userAuthPayload, accountNFT;
    try {
      userAuthPayload = JSON.parse(userAuthPayloadStr);
      accountNFT = JSON.parse(accountNFTStr);
    } catch {
      return res.status(400).json({
        success: false,
        data: "Invalid JSON format",
      });
    }

    if (
      !userAuthPayload.message ||
      !userAuthPayload.signature ||
      !userAuthPayload.userAddress
    ) {
      return res.status(400).json({
        success: false,
        data: "Missing fields in userAuthPayload",
      });
    }

    if (!accountNFT.collectionID || !accountNFT.nftID) {
      return res.status(400).json({
        success: false,
        data: "Missing fields in accountNFT",
      });
    }

    req.body.userAuthPayload = userAuthPayload;
    req.body.accountNFT = accountNFT;

    next();
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      data: `Failed to parse auth data: ${error.message}`,
    });
  }
};