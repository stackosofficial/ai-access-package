import { Request, Response, NextFunction } from "express";
import { getSkyNode } from "../core/init";
import {
  AccountNFT,
  ETHAddress,
  SkyContractService,
} from "@decloudlabs/skynet/lib/types/types";
import { getServerCostCalculator } from "../utils/utils";
import SkyMainNodeJS from "@decloudlabs/skynet/lib/services/SkyMainNodeJS";
import { SUBNET_COLLECTION_ID } from "@decloudlabs/skynet/lib/utils/constants";
import { ethers } from "ethers";

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

    const walletHandlerAddress = await serverCostContract.walletHandler();
    console.log("walletHandlerAddress", walletHandlerAddress);

    // Create wallet handler contract instance
    const walletHandlerContract = new ethers.Contract(
      walletHandlerAddress,
      [
        {
          "inputs": [
            {
              "components": [
                {
                  "internalType": "uint256",
                  "name": "collectionID",
                  "type": "uint256"
                },
                {
                  "internalType": "uint256",
                  "name": "nftID",
                  "type": "uint256"
                }
              ],
              "internalType": "struct IAccountNFT.AccountNFT",
              "name": "",
              "type": "tuple"
            },
            {
              "internalType": "uint256",
              "name": "",
              "type": "uint256"
            }
          ],
          "name": "getAccountBalance",
          "outputs": [
            {
              "internalType": "uint256",
              "name": "",
              "type": "uint256"
            }
          ],
          "stateMutability": "pure",
          "type": "function"
        }
      ],
      skyNode.contractService.signer
    );

    // Convert string values to BigInt for contract call
    const accountNFTForContract = {
      collectionID: BigInt(accountNFT.collectionID),
      nftID: BigInt(accountNFT.nftID)
    };
    const subnetID = BigInt(process.env.SUBNET_ID || "0");

    const availableBalance = await skyNode.contractService.callContractRead<
      bigint,
      bigint
    >(walletHandlerContract.getAccountBalance(accountNFTForContract, subnetID), (res) => res);

    if (!isEnabledResp.success) {
      console.log(`❌ Balance check failed: NFT ${accountNFT.collectionID}:${accountNFT.nftID} is not enabled`);
      return res.json({
        success: false,
        data: new Error("Not authorized to access this route").toString(),
      });
    }

    // Check minimum balance requirement
    const minimumBalance = BigInt(process.env.MINIMUM_BALANCE || "0");
    if (minimumBalance > 0) {
      if (!availableBalance.success) {
        console.log(`❌ Balance check failed: Could not retrieve balance for NFT ${accountNFT.collectionID}:${accountNFT.nftID}`);
        return res.json({
          success: false,
          data: new Error("Not authorized to access this route").toString(),
        });
      }

      if (availableBalance.data < minimumBalance) {
        console.log(`❌ Insufficient balance: NFT ${accountNFT.collectionID}:${accountNFT.nftID} has ${availableBalance.data} but minimum required is ${minimumBalance}`);
        return res.json({
          success: false,
          data: new Error("Insufficient balance").toString(),
        });
      }

      console.log(`✅ Balance check passed: NFT ${accountNFT.collectionID}:${accountNFT.nftID} has ${availableBalance.data} (minimum required: ${minimumBalance})`);
    } else {
      console.log(`ℹ️ Balance check skipped: MINIMUM_BALANCE is 0 or not set`);
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
