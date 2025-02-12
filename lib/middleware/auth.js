"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSignatureExpired = exports.protect = void 0;
const ethers_1 = require("ethers");
const SIGNATURE_EXPIRES_IN_MILLISECONDS = 15 * 60 * 1000;
const protect = async (req, res, next) => {
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
        if ((0, exports.isSignatureExpired)(Number(timestamp))) {
            return res.json({
                success: false,
                data: new Error("Signature expired").toString(),
            });
        }
        const extractedAddress = ethers_1.ethers.verifyMessage(new Uint8Array(Buffer.from(message)), signature);
        if (userAddress.toLowerCase() !== extractedAddress.toLowerCase()) {
            return res.json({
                success: false,
                data: new Error("Signature is invalid").toString(),
            });
        }
        next();
    }
    catch (err) {
        const error = err;
        return res.json({
            success: false,
            data: error.toString(),
        });
    }
};
exports.protect = protect;
const isSignatureExpired = (timestamp) => {
    const signatureExpiresAt = timestamp + SIGNATURE_EXPIRES_IN_MILLISECONDS;
    return signatureExpiresAt <= Date.now();
};
exports.isSignatureExpired = isSignatureExpired;
