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

export const parseAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Set auth info if API key is present
    const apiKey = req.headers["x-api-key"];

    // Handle both JSON strings and objects for userAuthPayload and accountNFT
    const userAuthPayloadRaw = req.body.userAuthPayload;
    const accountNFTRaw = req.body.accountNFT;
    const agentCollectionRaw = req.body.agentCollection;

    // If no auth data provided and no API key, let masterValidation handle the error
    if (!userAuthPayloadRaw && !accountNFTRaw && !apiKey) {
      return next();
    }

    // Parse userAuthPayload if provided
    if (userAuthPayloadRaw) {
      let userAuthPayload;
      
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

      req.body.userAuthPayload = userAuthPayload;
    }

    // Parse accountNFT if provided
    if (accountNFTRaw) {
      let accountNFT;
      
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

      req.body.accountNFT = accountNFT;
    }

     // Parse agentCollection if provided
     if (agentCollectionRaw) {
      let agentCollection;
      
      if (typeof agentCollectionRaw === 'string') {
        try {
          agentCollection = JSON.parse(agentCollectionRaw);
        } catch {
          return res.status(400).json({
            success: false,
            data: "Invalid JSON format in accountNFT",
          });
        }
      } else if (typeof accountNFTRaw === 'object') {
        agentCollection = agentCollectionRaw;
      } else {
        return res.status(400).json({
          success: false,
          data: "accountNFT must be a JSON object or string",
        });
      }

      req.body.agentCollection = agentCollection;
    }

    next();
  } catch (error: any) {
    console.error("❌ Error in parseAuth middleware:", error);
    return res.status(400).json({
      success: false,
      data: `Failed to parse auth data: ${error.message}`,
    });
  }
};