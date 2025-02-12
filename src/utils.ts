import { ServerCostCalculator__factory } from "@decloudlabs/skynet/lib/types/contracts";
import ENVConfig from "./envConfig";
import { ethers } from "ethers";

export const getServerCostCalculator = (
  SERVER_COST_CONTRACT_ADDRESS: string,
  signer: ethers.Signer
) => {
  return ServerCostCalculator__factory.connect(
    SERVER_COST_CONTRACT_ADDRESS,
    signer
  );
};
