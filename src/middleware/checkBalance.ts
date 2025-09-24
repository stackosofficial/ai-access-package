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
import { Pool } from "pg";

export const checkBalance = async (
  req: Request,
  res: Response,
  next: NextFunction,
  envConfig: ENVConfig,
  skyNode: SkyMainNodeJS
) => {
  try {
    // Get values already set by protect middleware (no need for another database call)
    const apiKeyId = (req as any).apiKeyId;
    const walletAddress = req.body.walletAddress;

    if (!apiKeyId || !walletAddress) {
      return res.status(401).json({
        success: false,
        error: "Authentication data not available"
      });
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
    const pool = new Pool({
      connectionString: process.env.POSTGRES_URL,
      ssl: { rejectUnauthorized: false }
    });

    const pendingCostsQuery = `
      SELECT COALESCE(SUM(CAST(amount AS BIGINT)), 0) as total_pending
      FROM fractional_payments 
      WHERE api_key = $1
    `;
    
    const pendingCostsResult = await pool.query(pendingCostsQuery, [apiKeyId]);
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
