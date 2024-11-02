import { Request, Response, NextFunction } from "express";
import { getSkyNode } from "../clients/skynet";
import { ETHAddress, SkyContractService } from "@decloudlabs/skynet/lib/types/types";


export const checkBalance = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const readByte32 =
            "0x917ec7ea41e5f357223d15148fe9b320af36ca576055af433ea3445b39221799";
        const contractBasedDeploymentByte32 =
            "0x503cf060389b91af8851125bd70ce66d16d12330718b103fc7674ef6d27e70c9";
        const { nftId, userAuthPayload } = req.body;

        const { message, signature, userAddress } = userAuthPayload;

        if (!nftId) {
            return res.json({
                success: false,
                data: new Error("Not authorized to access this route"),
            });
        }

        // check the owner of nft is the userAddress
        const skyNode = await getSkyNode();


        const ownerAddress = await skyNode.contractService.AppNFT.ownerOf(nftId);
        console.log("ownerAddress", ownerAddress);
        console.log("userAddress", userAddress);

        if (ownerAddress.toLowerCase() !== userAddress.toLowerCase()) {
            console.log("inside if");
            const callHasRole = async (roleValue: string) =>
                await hasRole(nftId, roleValue, userAddress, skyNode.contractService);

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
                    data: new Error("Not authorized to access this route"),
                });
            }
        }

        console.log("before appList");
        console.log("nftId", nftId);
        const appList = await skyNode.appManager.contractCall.getAppList(nftId);
        console.log("after appList");
        if (!appList.success) {
            return res.json({
                success: false,
                data: new Error("Not enough balance"),
            });
        }
        console.log("app List", appList.data);
        for (const app of appList.data) {
            if (app.subnetList[0] === "6") {
                if (app.appSubnetConfig[0].multiplier[0] == 1) {
                    return next()
                } else {
                    return res.json({
                        success: false,
                        data: new Error("Not enough balance"),
                    });
                }
            }
        }
        return res.json({
            success: false,
            data: new Error("No valid subscription found"),
        });
    } catch (err: any) {
        const error: Error = err;
        return res.json({
            success: false,
            data: error,
        });
    }
};

const hasRole = async (
    nftID: string,
    roleValue: string,
    requester: ETHAddress,
    contractService: SkyContractService
) => {
    const result = await contractService.callContractRead<boolean, boolean>(
        contractService.AppNFT.hasRole(nftID, roleValue, requester),
        (res) => res
    );
    return result;
};