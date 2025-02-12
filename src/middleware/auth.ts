import { Request, Response, NextFunction } from "express";
import { ethers } from "ethers";

const SIGNATURE_EXPIRES_IN_MILLISECONDS = 15 * 60 * 1000;

export const protect = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userAuthPayload = req.body.userAuthPayload;

    if (!userAuthPayload) {
      return res.json({
        success: false,
        data: new Error("Not authorized to access this route"),
      });
    }

    const { message, signature, userAddress } = userAuthPayload;
    const timestamp = Number(message);

    if (isSignatureExpired(Number(timestamp))) {
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
      return res.json({
        success: false,
        data: new Error("Signature is invalid").toString(),
      });
    }

    next();
  } catch (err: any) {
    const error: Error = err;
    return res.json({
      success: false,
      data: error.toString(),
    });
  }
};

export const isSignatureExpired = (timestamp: number) => {
  const signatureExpiresAt = timestamp + SIGNATURE_EXPIRES_IN_MILLISECONDS;

  return signatureExpiresAt <= Date.now();
};
