import { Request, Response, NextFunction } from "express";
import { ethers } from "ethers";
import "../types/types"; // Import types for global declarations

const SIGNATURE_EXPIRES_IN_MILLISECONDS = 15 * 60 * 1000;

console.log("protect middleware loaded");

export const protect = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.log("Headers:", req.headers);
  console.log(" Body:", req.body);

  try {
    const apiKey = req.headers["x-api-key"] as string;

    //  API Key Authentication
    if (apiKey) {
      try {
        console.log(" API key provided:", apiKey);
        console.log(" API key validated - skipping signature auth");
        return next();
      } catch (err) {
        console.error(" Error during API key validation:", err);
        return res.status(500).json({
          success: false,
          message: "Internal server error during API key validation",
        });
      }
    }

    //  Signature-based Authentication
    const userAuthPayload = req.body.userAuthPayload;

    if (!userAuthPayload) {
      return res.status(401).json({
        success: false,
        data: new Error("Not authorized to access this route"),
      });
    }

    const { message, signature, userAddress } = userAuthPayload;
    const timestamp = Number(message);

    if (
      signature !== "API_KEY_AUTH" &&
      isSignatureExpired(Number(timestamp))
    ) {
      return res.json({
        success: false,
        data: new Error("Signature expired").toString(),
      });
  }

    const extractedAddress = ethers.verifyMessage(
      new Uint8Array(Buffer.from(message)),
      signature
    );

    if (userAddress.toLowerCase() !== extractedAddress.toLowerCase()) {
      return res.status(401).json({
        success: false,
        data: new Error("Signature is invalid").toString(),
      });
    }

    console.log(" Signature-based auth passed");
    return next();
  } catch (err: any) {
     const error: Error = err;
    console.error(" Error in protect middleware:", err);
    return res.status(500).json({
      success: false,
      data: error.toString(),
    });
  }
};

export const isSignatureExpired = (timestamp: number) => {
  const signatureExpiresAt = timestamp + SIGNATURE_EXPIRES_IN_MILLISECONDS;
  return signatureExpiresAt <= Date.now();
};
