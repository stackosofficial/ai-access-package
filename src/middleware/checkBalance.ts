import { Request, Response, NextFunction } from "express";
import SkynetFractionalPaymentService from "../services/payment/skynetFractionalPaymentService";
import { Pool } from "pg";

export const checkBalance = async (
  req: Request,
  res: Response,
  next: NextFunction,
  pool: Pool
) => {
  try {
    const walletAddress = req.body.walletAddress;

    if (!walletAddress) {
      return res.status(401).json({
        success: false,
        error: "Authentication data not available"
      });
    }

    // Initialize fractional payment service
    const paymentService = new SkynetFractionalPaymentService();

    // Check user's total balance (deposits + credits) in the fractional escrow contract
    const totalBalanceResponse = await paymentService.getUserTotalBalance(walletAddress);
    
    if (!totalBalanceResponse.success) {
      console.log(`❌ Failed to get user total balance for ${walletAddress}:`, totalBalanceResponse.data);
      return res.json({
        success: false,
        data: new Error("Failed to check user balance").toString(),
      });
    }

    const { depositBalance, creditBalance, totalBalance } = totalBalanceResponse.data;

    const walletAddressLower = walletAddress.toLowerCase();
    const pendingCostsQuery = `
      SELECT COALESCE(SUM(CAST(amount AS BIGINT)), 0) as total_pending
      FROM fractional_payments 
      WHERE wallet_address = $1
    `;
    
    const pendingCostsResult = await pool.query(pendingCostsQuery, [walletAddressLower]);
    const totalPendingCosts = BigInt(pendingCostsResult.rows[0].total_pending || "0");
    
    console.log(`🔍 checkBalance - Query result: total_pending=${totalPendingCosts} wei`);

    // Calculate available balance in wei: (depositBalance + creditBalance) - databaseCosts
    const availableBalanceWei = totalBalance - totalPendingCosts;

    // Convert balances from wei to sUSD for comparison
    // 1 sUSD = 10^18 wei (18 decimals, same as ETH)
    const WEI_TO_SUSD = BigInt(10 ** 18);
    const availableBalanceSUSD = Number(availableBalanceWei) / Number(WEI_TO_SUSD);
    const depositBalanceSUSD = Number(depositBalance) / Number(WEI_TO_SUSD);
    const creditBalanceSUSD = Number(creditBalance) / Number(WEI_TO_SUSD);
    const totalBalanceSUSD = Number(totalBalance) / Number(WEI_TO_SUSD);
    const pendingCostsSUSD = Number(totalPendingCosts) / Number(WEI_TO_SUSD);

    // Check minimum balance requirement (MINIMUM_BALANCE is in sUSD)
    const minimumBalanceSUSD = parseFloat(process.env.MINIMUM_BALANCE || "0");
    if (minimumBalanceSUSD > 0) {
      if (availableBalanceSUSD < minimumBalanceSUSD) {
        console.log(`❌ Insufficient available balance: User ${walletAddress} has ${availableBalanceSUSD.toFixed(6)} sUSD available (deposits: ${depositBalanceSUSD.toFixed(6)} sUSD, credits: ${creditBalanceSUSD.toFixed(6)} sUSD, pending: ${pendingCostsSUSD.toFixed(6)} sUSD) but minimum required is ${minimumBalanceSUSD} sUSD`);
        return res.json({
          success: false,
          data: new Error("Insufficient available balance").toString(),
        });
      }

      console.log(`✅ Balance check passed: User ${walletAddress} has ${availableBalanceSUSD.toFixed(6)} sUSD available (deposits: ${depositBalanceSUSD.toFixed(6)} sUSD, credits: ${creditBalanceSUSD.toFixed(6)} sUSD, pending: ${pendingCostsSUSD.toFixed(6)} sUSD) (minimum required: ${minimumBalanceSUSD} sUSD)`);
    } else {
      console.log(`ℹ️ Balance check skipped: MINIMUM_BALANCE is 0 or not set. User ${walletAddress} has ${availableBalanceSUSD.toFixed(6)} sUSD available (deposits: ${depositBalanceSUSD.toFixed(6)} sUSD, credits: ${creditBalanceSUSD.toFixed(6)} sUSD, pending: ${pendingCostsSUSD.toFixed(6)} sUSD)`);
    }

    // Add balance information to request for potential use in route handlers (in wei)
    req.body.userDepositBalance = depositBalance.toString();
    req.body.userCreditBalance = creditBalance.toString();
    req.body.userTotalBalance = totalBalance.toString();
    req.body.availableBalance = availableBalanceWei.toString();
    req.body.pendingCosts = totalPendingCosts.toString();
    
    // Also add sUSD formatted values for convenience
    req.body.userDepositBalanceSUSD = depositBalanceSUSD.toFixed(6);
    req.body.userCreditBalanceSUSD = creditBalanceSUSD.toFixed(6);
    req.body.userTotalBalanceSUSD = totalBalanceSUSD.toFixed(6);
    req.body.availableBalanceSUSD = availableBalanceSUSD.toFixed(6);
    req.body.pendingCostsSUSD = pendingCostsSUSD.toFixed(6);

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