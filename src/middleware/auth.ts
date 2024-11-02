import { Request, Response, NextFunction } from "express";
import { ethers } from "ethers";


const SIGNATURE_EXPIRES_IN_MILLISECONDS = 15 * 60 * 1000;

export const protect = async (req: Request, res: Response, next: NextFunction) => {
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
                data: new Error("Signature expired"),
            });
        }
        const extractedAddress = ethers.utils.verifyMessage(
            ethers.utils.arrayify(Array.from(Buffer.from(message))),
            signature
        );

        if (userAddress.toLowerCase() !== extractedAddress.toLowerCase()) {
            return res.json({
                success: false,
                data: new Error("Signature is invalid"),
            });
        }

        next()
    } catch (err: any) {
        const error: Error = err;
        return res.json({
            success: false,
            data: error,
        });
    }
};

export const isSignatureExpired = (timestamp: number) => {
    const signatureExpiresAt =
        timestamp + SIGNATURE_EXPIRES_IN_MILLISECONDS;

    return signatureExpiresAt <= Date.now();
};