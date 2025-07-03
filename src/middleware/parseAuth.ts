declare module "express-serve-static-core" {
  interface Request {
    authInfo?: {
      apiKey: string;
      type: string;
    };
  }
}

import { Request, Response, NextFunction } from "express";
import "../types/types"; // Import types for global declarations

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

    // ✅ CORRECTED: Handle both JSON strings and objects
    const userAuthPayloadRaw = req.body.userAuthPayload;
    const accountNFTRaw = req.body.accountNFT;

    if (!userAuthPayloadRaw || !accountNFTRaw) {
      return res.status(400).json({
        success: false,
        data: "Missing userAuthPayload or accountNFT",
      });
    }

    let userAuthPayload, accountNFT;
    
    // Handle userAuthPayload - can be string or object
    if (typeof userAuthPayloadRaw === 'string') {
      try {
        userAuthPayload = JSON.parse(userAuthPayloadRaw);
      } catch {
        return res.status(400).json({
          success: false,
          data: "Invalid JSON format in userAuthPayload",
        });
      }
    } else if (typeof userAuthPayloadRaw === 'object') {
      userAuthPayload = userAuthPayloadRaw;
    } else {
      return res.status(400).json({
        success: false,
        data: "userAuthPayload must be a JSON object or string",
      });
    }

    // Handle accountNFT - can be string or object
    if (typeof accountNFTRaw === 'string') {
      try {
        accountNFT = JSON.parse(accountNFTRaw);
      } catch {
        return res.status(400).json({
          success: false,
          data: "Invalid JSON format in accountNFT",
        });
      }
    } else if (typeof accountNFTRaw === 'object') {
      accountNFT = accountNFTRaw;
    } else {
      return res.status(400).json({
        success: false,
        data: "accountNFT must be a JSON object or string",
      });
    }

    // Validate userAuthPayload structure
    if (
      !userAuthPayload.message ||
      !userAuthPayload.signature ||
      !userAuthPayload.userAddress
    ) {
      return res.status(400).json({
        success: false,
        data: "Missing fields in userAuthPayload (message, signature, userAddress required)",
      });
    }

    // Validate accountNFT structure
    if (!accountNFT.collectionID || !accountNFT.nftID) {
      return res.status(400).json({
        success: false,
        data: "Missing fields in accountNFT (collectionID, nftID required)",
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