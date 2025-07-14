import { Request, Response, NextFunction } from "express";
import { getSkyNode } from "../core/init";
import {
  AccountNFT,
  ETHAddress,
  SkyContractService,
} from "@decloudlabs/skynet/lib/types/types";
import { getServerCostCalculator } from "../utils/utils";
import SkyMainNodeJS from "@decloudlabs/skynet/lib/services/SkyMainNodeJS";

export const checkBalance = async (
  req: Request,
  res: Response,
  next: NextFunction,
  SERVER_COST_CONTRACT_ADDRESS: string,
  skyNode: SkyMainNodeJS
) => {
  try {
    const readByte32 =
      "0x917ec7ea41e5f357223d15148fe9b320af36ca576055af433ea3445b39221799";
    const contractBasedDeploymentByte32 =
      "0x503cf060389b91af8851125bd70ce66d16d12330718b103fc7674ef6d27e70c9";
    const { accountNFT, walletAddress } = req.body;

    if (!accountNFT) {
      return res.json({
        success: false,
        data: new Error("Not authorized to access this route").toString(),
      });
    }

    const ownerAddress = await skyNode.contractService.CollectionNFT.ownerOf(
      accountNFT
    );

    if (ownerAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      const callHasRole = async (roleValue: string) =>
        await hasRole(
          accountNFT,
          roleValue,
          walletAddress,
          skyNode.contractService
        );

      const [hasReadRoleResp, hasDeployerRoleResp] = await Promise.all([
        callHasRole(readByte32),
        callHasRole(contractBasedDeploymentByte32),
      ]);

      if (!hasReadRoleResp && !hasDeployerRoleResp) {
        console.log(`❌ Access denied: User ${walletAddress} lacks required roles for NFT ${accountNFT.collectionID}:${accountNFT.nftID}`);
        return res.json({
          success: false,
          data: new Error("Not authorized to access this route").toString(),
        });
      }
    }

    const serverCostContract = getServerCostCalculator(
      SERVER_COST_CONTRACT_ADDRESS,
      skyNode.contractService.signer
    );

    const isEnabledResp = await skyNode.contractService.callContractRead<
      boolean,
      boolean
    >(serverCostContract.isEnabled(accountNFT), (res) => res);

    console.log("isEnabledResp", isEnabledResp);

    if (!isEnabledResp.success) {
      console.log(`❌ Balance check failed: NFT ${accountNFT.collectionID}:${accountNFT.nftID} is not enabled`);
      return res.json({
        success: false,
        data: new Error("Not authorized to access this route").toString(),
      });
    }

    next();
  } catch (err: any) {
    const error: Error = err;
    console.error("❌ Error in checkBalance middleware:", error);
    return res.json({
      success: false,
      data: error.toString(),
    });
  }
};

const hasRole = async (
  accountNFT: AccountNFT,
  roleValue: string,
  requester: ETHAddress,
  contractService: SkyContractService
) => {
  const result = await contractService.callContractRead<boolean, boolean>(
    contractService.NFTRoles.hasRole(accountNFT, roleValue, requester),
    (res) => res
  );
  return result;
};
