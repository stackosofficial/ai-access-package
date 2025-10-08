import { ethers } from "ethers";
import { APICallReturn } from "@decloudlabs/skynet/lib/types/types";
import ENVConfig from "../../core/envConfig";
import { SkynetContractABI } from "../../abi/skynetFractionalContract";
import { getSkyNode } from "../../core/init";

/**
 * SkynetFractionalPaymentService - Handles all payment operations with the SkynetFractionalEscrow contract
 * 
 * This service provides a complete interface for:
 * - Checking user deposit balances
 * - Charging users for services (backend only)
 * - Withdrawing user funds (backend only)
 * - Managing contract state and balances
 * 
 * All functions integrate with the existing authentication system and follow the same patterns
 * as the current balance management system.
 */
export default class SkynetFractionalPaymentService {
  private envConfig: ENVConfig;
  private contractAddress: string;
  private contract: ethers.Contract;

  // Hardcoded contract address for SkynetFractionalEscrow
  private static readonly CONTRACT_ADDRESS = "0x8c75166569A4c6Df0f68C8Cbd2BfE5993653e926";

  constructor(envConfig: ENVConfig) {
    this.envConfig = envConfig;
    this.contractAddress = SkynetFractionalPaymentService.CONTRACT_ADDRESS;
    
    const skyNode = getSkyNode();
    if (!skyNode) {
      throw new Error("SkyNode not initialized");
    }

    this.contract = new ethers.Contract(
      this.contractAddress,
      SkynetContractABI,
      skyNode.contractService.signer
    );
  }

  /**
   * Get user's deposited balance from the escrow contract
   * @param userAddress - The user's wallet address
   * @returns Promise<APICallReturn<bigint>> - User's deposit balance in wei
   */
  async getUserDepositBalance(userAddress: string): Promise<APICallReturn<bigint>> {
    try {
      const skyNode = getSkyNode();
      if (!skyNode) {
        return {
          success: false,
          data: new Error("SkyNode not initialized")
        };
      }

      const balance = await skyNode.contractService.callContractRead<bigint, bigint>(
        this.contract.getUserDepositBalance(userAddress),
        (res) => res
      );

      return balance;
    } catch (error) {
      console.error("❌ Error getting user deposit balance:", error);
      return {
        success: false,
        data: error as Error
      };
    }
  }

  /**
   * Get user's credit balance from the escrow contract
   * @param userAddress - The user's wallet address
   * @returns Promise<APICallReturn<bigint>> - User's credit balance in wei
   */
  async getUserCreditBalance(userAddress: string): Promise<APICallReturn<bigint>> {
    try {
      const skyNode = getSkyNode();
      if (!skyNode) {
        return {
          success: false,
          data: new Error("SkyNode not initialized")
        };
      }

      const balance = await skyNode.contractService.callContractRead<bigint, bigint>(
        this.contract.getUserCreditBalance(userAddress),
        (res) => res
      );

      return balance;
    } catch (error) {
      console.error("❌ Error getting user credit balance:", error);
      return {
        success: false,
        data: error as Error
      };
    }
  }

  /**
   * Get user's total balance (deposits + credits)
   * @param userAddress - The user's wallet address
   * @returns Promise<APICallReturn<{depositBalance: bigint, creditBalance: bigint, totalBalance: bigint}>>
   */
  async getUserTotalBalance(userAddress: string): Promise<APICallReturn<{depositBalance: bigint, creditBalance: bigint, totalBalance: bigint}>> {
    try {
      const depositResponse = await this.getUserDepositBalance(userAddress);
      if (!depositResponse.success) {
        return {
          success: false,
          data: new Error("Failed to get deposit balance")
        };
      }

      const creditResponse = await this.getUserCreditBalance(userAddress);
      if (!creditResponse.success) {
        return {
          success: false,
          data: new Error("Failed to get credit balance")
        };
      }

      const depositBalance = depositResponse.data;
      const creditBalance = creditResponse.data;
      const totalBalance = depositBalance + creditBalance;

      return {
        success: true,
        data: {
          depositBalance,
          creditBalance,
          totalBalance
        }
      };
    } catch (error) {
      console.error("❌ Error getting user total balance:", error);
      return {
        success: false,
        data: error as Error
      };
    }
  }

  /**
   * Charge user for compute services (backend only)
   * @param userAddress - The user's wallet address to charge
   * @param amount - Amount to charge in wei
   * @returns Promise<APICallReturn<any>> - Success status
   */
  async chargeForServices(userAddress: string, amount: string): Promise<APICallReturn<any>> {
    try {
      const skyNode = getSkyNode();
      if (!skyNode) {
        return {
          success: false,
          data: new Error("SkyNode not initialized")
        };
      }

      // Validate inputs
      if (!userAddress || userAddress === ethers.ZeroAddress) {
        return {
          success: false,
          data: new Error("Invalid user address")
        };
      }

      const amountBigInt = BigInt(amount);
      if (amountBigInt <= 0) {
        return {
          success: false,
          data: new Error("Amount must be greater than 0")
        };
      }

      // Check if user has sufficient balance before charging
      const balanceCheck = await this.getUserDepositBalance(userAddress);
      if (!balanceCheck.success) {
        return {
          success: false,
          data: new Error("Failed to check user balance")
        };
      }

      if (balanceCheck.data < amountBigInt) {
        return {
          success: false,
          data: new Error(`Insufficient balance. User has ${balanceCheck.data} wei but needs ${amountBigInt} wei`)
        };
      }

      // Charge the user
      const response = await skyNode.contractService.callContractWrite(
        this.contract.chargeForServices(userAddress, amountBigInt)
      );

      if (response.success) {
        console.log(`✅ Successfully charged ${amount} wei from user ${userAddress}`);
      } else {
        console.error(`❌ Failed to charge user ${userAddress}:`, response.data);
      }

      return response;
    } catch (error) {
      console.error("❌ Error charging user for services:", error);
      return {
        success: false,
        data: error as Error
      };
    }
  }

  /**
   * Withdraw remaining funds for user (backend only)
   * @param userAddress - The user's wallet address to withdraw for
   * @param amount - Amount to withdraw in wei
   * @returns Promise<APICallReturn<any>> - Success status
   */
  async withdrawUserFunds(userAddress: string, amount: string): Promise<APICallReturn<any>> {
    try {
      const skyNode = getSkyNode();
      if (!skyNode) {
        return {
          success: false,
          data: new Error("SkyNode not initialized")
        };
      }

      // Validate inputs
      if (!userAddress || userAddress === ethers.ZeroAddress) {
        return {
          success: false,
          data: new Error("Invalid user address")
        };
      }

      const amountBigInt = BigInt(amount);
      if (amountBigInt <= 0) {
        return {
          success: false,
          data: new Error("Amount must be greater than 0")
        };
      }

      // Check if user has sufficient balance before withdrawing
      const balanceCheck = await this.getUserDepositBalance(userAddress);
      if (!balanceCheck.success) {
        return {
          success: false,
          data: new Error("Failed to check user balance")
        };
      }

      if (balanceCheck.data < amountBigInt) {
        return {
          success: false,
          data: new Error(`Insufficient balance. User has ${balanceCheck.data} wei but trying to withdraw ${amountBigInt} wei`)
        };
      }

      // Withdraw funds for the user
      const response = await skyNode.contractService.callContractWrite(
        this.contract.withdrawUserFunds(userAddress, amountBigInt)
      );

      if (response.success) {
        console.log(`✅ Successfully withdrew ${amount} wei for user ${userAddress}`);
      } else {
        console.error(`❌ Failed to withdraw funds for user ${userAddress}:`, response.data);
      }

      return response;
    } catch (error) {
      console.error("❌ Error withdrawing user funds:", error);
      return {
        success: false,
        data: error as Error
      };
    }
  }

  /**
   * Get total escrow balance in the contract
   * @returns Promise<APICallReturn<bigint>> - Total contract balance in wei
   */
  async getEscrowBalance(): Promise<APICallReturn<bigint>> {
    try {
      const skyNode = getSkyNode();
      if (!skyNode) {
        return {
          success: false,
          data: new Error("SkyNode not initialized")
        };
      }

      const balance = await skyNode.contractService.callContractRead<bigint, bigint>(
        this.contract.getEscrowBalance(),
        (res) => res
      );

      return balance;
    } catch (error) {
      console.error("❌ Error getting escrow balance:", error);
      return {
        success: false,
        data: error as Error
      };
    }
  }

  /**
   * Get current backend wallet address
   * @returns Promise<APICallReturn<string>> - Backend wallet address
   */
  async getBackendWallet(): Promise<APICallReturn<string>> {
    try {
      const skyNode = getSkyNode();
      if (!skyNode) {
        return {
          success: false,
          data: new Error("SkyNode not initialized")
        };
      }

      const backendWallet = await skyNode.contractService.callContractRead<string, string>(
        this.contract.backendWallet(),
        (res) => res
      );

      return backendWallet;
    } catch (error) {
      console.error("❌ Error getting backend wallet:", error);
      return {
        success: false,
        data: error as Error
      };
    }
  }

  /**
   * Get contract owner address
   * @returns Promise<APICallReturn<string>> - Contract owner address
   */
  async getOwner(): Promise<APICallReturn<string>> {
    try {
      const skyNode = getSkyNode();
      if (!skyNode) {
        return {
          success: false,
          data: new Error("SkyNode not initialized")
        };
      }

      const owner = await skyNode.contractService.callContractRead<string, string>(
        this.contract.owner(),
        (res) => res
      );

      return owner;
    } catch (error) {
      console.error("❌ Error getting contract owner:", error);
      return {
        success: false,
        data: error as Error
      };
    }
  }

  /**
   * Get current credit manager address
   * @returns Promise<APICallReturn<string>> - Credit manager address
   */
  async getCreditManager(): Promise<APICallReturn<string>> {
    try {
      const skyNode = getSkyNode();
      if (!skyNode) {
        return {
          success: false,
          data: new Error("SkyNode not initialized")
        };
      }

      const creditManager = await skyNode.contractService.callContractRead<string, string>(
        this.contract.creditManager(),
        (res) => res
      );

      return creditManager;
    } catch (error) {
      console.error("❌ Error getting credit manager:", error);
      return {
        success: false,
        data: error as Error
      };
    }
  }

  /**
   * Check if the current signer is the backend wallet
   * @returns Promise<APICallReturn<boolean>> - True if current signer is backend wallet
   */
  async isCurrentSignerBackendWallet(): Promise<APICallReturn<boolean>> {
    try {
      const skyNode = getSkyNode();
      if (!skyNode) {
        return {
          success: false,
          data: new Error("SkyNode not initialized")
        };
      }

      const backendWalletResponse = await this.getBackendWallet();
      if (!backendWalletResponse.success) {
        return {
          success: false,
          data: new Error("Failed to get backend wallet")
        };
      }

      const currentSignerAddress = await skyNode.contractService.signer.getAddress();
      const isBackend = currentSignerAddress.toLowerCase() === backendWalletResponse.data.toLowerCase();

      return {
        success: true,
        data: isBackend
      };
    } catch (error) {
      console.error("❌ Error checking if current signer is backend wallet:", error);
      return {
        success: false,
        data: error as Error
      };
    }
  }

  /**
   * Check if user has sufficient balance for a given amount (deposits + credits)
   * @param userAddress - The user's wallet address
   * @param requiredAmount - Required amount in wei
   * @returns Promise<APICallReturn<boolean>> - True if user has sufficient balance
   */
  async hasSufficientBalance(userAddress: string, requiredAmount: string): Promise<APICallReturn<boolean>> {
    try {
      const totalBalanceResponse = await this.getUserTotalBalance(userAddress);
      if (!totalBalanceResponse.success) {
        return {
          success: false,
          data: new Error("Failed to check user balance")
        };
      }

      const requiredAmountBigInt = BigInt(requiredAmount);
      const hasSufficient = totalBalanceResponse.data.totalBalance >= requiredAmountBigInt;

      return {
        success: true,
        data: hasSufficient
      };
    } catch (error) {
      console.error("❌ Error checking sufficient balance:", error);
      return {
        success: false,
        data: error as Error
      };
    }
  }

  /**
   * Batch charge multiple users for services
   * @param charges - Array of {userAddress, amount} objects
   * @returns Promise<APICallReturn<{successful: number, failed: number, errors: string[]}>>
   */
  async batchChargeForServices(
    charges: Array<{userAddress: string, amount: string}>
  ): Promise<APICallReturn<{successful: number, failed: number, errors: string[]}>> {
    try {
      const results = {
        successful: 0,
        failed: 0,
        errors: [] as string[]
      };

      for (const charge of charges) {
        const response = await this.chargeForServices(charge.userAddress, charge.amount);
        if (response.success) {
          results.successful++;
        } else {
          results.failed++;
          results.errors.push(`Failed to charge ${charge.userAddress}: ${response.data}`);
        }
      }

      console.log(`✅ Batch charge completed: ${results.successful} successful, ${results.failed} failed`);
      return {
        success: true,
        data: results
      };
    } catch (error) {
      console.error("❌ Error in batch charge for services:", error);
      return {
        success: false,
        data: error as Error
      };
    }
  }

  /**
   * Get contract instance for direct access (advanced usage)
   * @returns ethers.Contract - The contract instance
   */
  getContract(): ethers.Contract {
    return this.contract;
  }

  /**
   * Get contract address
   * @returns string - The contract address
   */
  getContractAddress(): string {
    return this.contractAddress;
  }
}
