"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseAuth = void 0;
const parseAuth = (req, res, next) => {
    try {
        const userAuthPayloadStr = req.body.userAuthPayload;
        const accountNFTStr = req.body.accountNFT;
        if (!userAuthPayloadStr || !accountNFTStr) {
            return res.status(400).json({
                success: false,
                data: "Missing userAuthPayload or accountNFT in form data",
            });
        }
        let userAuthPayload;
        let accountNFT;
        try {
            userAuthPayload = JSON.parse(userAuthPayloadStr);
            accountNFT = JSON.parse(accountNFTStr);
        }
        catch (parseError) {
            return res.status(400).json({
                success: false,
                data: "Invalid JSON format in userAuthPayload or accountNFT",
            });
        }
        // Validate parsed objects have required fields
        if (!userAuthPayload.message ||
            !userAuthPayload.signature ||
            !userAuthPayload.userAddress) {
            return res.status(400).json({
                success: false,
                data: "Missing required fields in userAuthPayload",
            });
        }
        if (!accountNFT.collectionID || !accountNFT.nftID) {
            return res.status(400).json({
                success: false,
                data: "Missing required fields in accountNFT",
            });
        }
        // Update request body with parsed objects
        req.body = {
            ...req.body,
            userAuthPayload,
            accountNFT,
            files: req.files, // Preserve uploaded files
        };
        next();
    }
    catch (error) {
        return res.status(400).json({
            success: false,
            data: `Failed to parse authentication data: ${error.message}`,
        });
    }
};
exports.parseAuth = parseAuth;
