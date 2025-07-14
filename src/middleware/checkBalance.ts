import { Request, Response, NextFunction } from "express";
import { getSkyNode } from "../core/init";
import {
  AccountNFT,
  ETHAddress,
  SkyContractService,
} from "@decloudlabs/skynet/lib/types/types";
import { getServerCostCalculator } from "../utils/utils";

export const checkBalance = async (
  req: Request,
  res: Response,
  next: NextFunction,
  SERVER_COST_CONTRACT_ADDRESS: string
) => {
  try {
    const readByte32 =
      "0x917ec7ea41e5f357223d15148fe9b320af36ca576055af433ea3445b39221799";
    const contractBasedDeploymentByte32 =
      "0x503cf060389b91af8851125bd70ce66d16d12330718b103fc7674ef6d27e70c9";
    const { accountNFT, userAuthPayload } = req.body;

    const { message, signature, userAddress } = userAuthPayload;

    if (!accountNFT) {
      return res.json({
        success: false,
        data: new Error("Not authorized to access this route").toString(),
      });
    }

    // check the owner of nft is the userAddress
    const skyNode = await getSkyNode();

    const ownerAddress = await skyNode.contractService.CollectionNFT.ownerOf(
      accountNFT
    );

    if (ownerAddress.toLowerCase() !== userAddress.toLowerCase()) {
      const callHasRole = async (roleValue: string) =>
        await hasRole(
          accountNFT,
          roleValue,
          userAddress,
          skyNode.contractService
        );

      const [hasReadRoleResp, hasDeployerRoleResp] = await Promise.all([
        callHasRole(readByte32),
        callHasRole(contractBasedDeploymentByte32),
      ]);

      if (!hasReadRoleResp && !hasDeployerRoleResp) {
        console.log(`❌ Access denied: User ${userAddress} lacks required roles for NFT ${accountNFT.collectionID}:${accountNFT.nftID}`);
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
