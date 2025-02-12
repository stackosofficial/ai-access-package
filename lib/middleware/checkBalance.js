"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkBalance = void 0;
const init_1 = require("../init");
const utils_1 = require("../utils");
const checkBalance = async (req, res, next, SERVER_COST_CONTRACT_ADDRESS) => {
    try {
        const readByte32 = "0x917ec7ea41e5f357223d15148fe9b320af36ca576055af433ea3445b39221799";
        const contractBasedDeploymentByte32 = "0x503cf060389b91af8851125bd70ce66d16d12330718b103fc7674ef6d27e70c9";
        const { accountNFT, userAuthPayload } = req.body;
        const { message, signature, userAddress } = userAuthPayload;
        if (!accountNFT) {
            return res.json({
                success: false,
                data: new Error("Not authorized to access this route").toString(),
            });
        }
        // check the owner of nft is the userAddress
        const skyNode = await (0, init_1.getSkyNode)();
        const ownerAddress = await skyNode.contractService.CollectionNFT.ownerOf(accountNFT);
        console.log("ownerAddress", ownerAddress);
        console.log("userAddress", userAddress);
        if (ownerAddress.toLowerCase() !== userAddress.toLowerCase()) {
            console.log("inside if");
            const callHasRole = async (roleValue) => await hasRole(accountNFT, roleValue, userAddress, skyNode.contractService);
            console.log("callHasRole", callHasRole);
            const [hasReadRoleResp, hasDeployerRoleResp] = await Promise.all([
                callHasRole(readByte32),
                callHasRole(contractBasedDeploymentByte32),
            ]);
            console.log("hasReadRoleResp", hasReadRoleResp);
            console.log("hasDeployerRoleResp", hasDeployerRoleResp);
            if (!hasReadRoleResp && !hasDeployerRoleResp) {
                return res.json({
                    success: false,
                    data: new Error("Not authorized to access this route").toString(),
                });
            }
        }
        const serverCostContract = (0, utils_1.getServerCostCalculator)(SERVER_COST_CONTRACT_ADDRESS, skyNode.contractService.signer);
        const isEnabledResp = await skyNode.contractService.callContractRead(serverCostContract.isEnabled(accountNFT), (res) => res);
        console.log("isEnabledResp", isEnabledResp, SERVER_COST_CONTRACT_ADDRESS);
        if (!isEnabledResp.success) {
            return res.json({
                success: false,
                data: new Error("Not authorized to access this route").toString(),
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
exports.checkBalance = checkBalance;
const hasRole = async (accountNFT, roleValue, requester, contractService) => {
    const result = await contractService.callContractRead(contractService.NFTRoles.hasRole(accountNFT, roleValue, requester), (res) => res);
    return result;
};
