import { Request, Response, NextFunction } from "express";
import { getSkyNode } from "../core/init";
import {
  AccountNFT,
  ETHAddress,
  SkyContractService,
} from "@decloudlabs/skynet/lib/types/types";
import SkynetFractionalPaymentService from "../services/payment/skynetFractionalPaymentService";
import SkyMainNodeJS from "@decloudlabs/skynet/lib/services/SkyMainNodeJS";
import ENVConfig from "../core/envConfig";

export const checkBalance = async (
  req: Request,
  res: Response,
  next: NextFunction,
  envConfig: ENVConfig,
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

    // Initialize fractional payment service
    const paymentService = new SkynetFractionalPaymentService(envConfig);

    // Check user's deposit balance in the fractional escrow contract
    const balanceResponse = await paymentService.getUserDepositBalance(walletAddress);
    
    if (!balanceResponse.success) {
      console.log(`❌ Failed to get user deposit balance for ${walletAddress}:`, balanceResponse.data);
      return res.json({
        success: false,
        data: new Error("Failed to check user balance").toString(),
      });
    }

    const userBalance = balanceResponse.data;

    // Get total pending costs from database for this user across all subnets
    const { Pool } = await import("pg");
    const pool = new Pool({
      connectionString: process.env.POSTGRES_URL,
      ssl: { rejectUnauthorized: false }
    });

    const pendingCostsQuery = `
      SELECT COALESCE(SUM(CAST(amount AS BIGINT)), 0) as total_pending
      FROM fractional_payments 
      WHERE api_key = $1
    `;
    
    const pendingCostsResult = await pool.query(pendingCostsQuery, [walletAddress]);
    const totalPendingCosts = BigInt(pendingCostsResult.rows[0].total_pending || "0");

    // Calculate available balance: contractBalance - databaseCosts
    const availableBalance = userBalance - totalPendingCosts;

    // Check minimum balance requirement
    const minimumBalance = BigInt(process.env.MINIMUM_BALANCE || "0");
    if (minimumBalance > 0) {
      if (availableBalance < minimumBalance) {
        console.log(`❌ Insufficient available balance: User ${walletAddress} has ${availableBalance} wei available (contract: ${userBalance} wei, pending: ${totalPendingCosts} wei) but minimum required is ${minimumBalance}`);
        return res.json({
          success: false,
          data: new Error("Insufficient available balance").toString(),
        });
      }

      console.log(`✅ Balance check passed: User ${walletAddress} has ${availableBalance} wei available (contract: ${userBalance} wei, pending: ${totalPendingCosts} wei) (minimum required: ${minimumBalance})`);
    } else {
      console.log(`ℹ️ Balance check skipped: MINIMUM_BALANCE is 0 or not set. User ${walletAddress} has ${availableBalance} wei available (contract: ${userBalance} wei, pending: ${totalPendingCosts} wei)`);
    }

    // Add balance information to request for potential use in route handlers
    req.body.userDepositBalance = userBalance.toString();
    req.body.availableBalance = availableBalance.toString();
    req.body.pendingCosts = totalPendingCosts.toString();

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
