import AppFunctions from "@decloudlabs/sky-cluster-operator/lib/services/appFunctions";
import { APICallReturn } from "@decloudlabs/sky-cluster-operator/lib/types/types";
import balanceExtractService from "./balanceExtractService";
import BalanceSettleService from "./balanceSettleService";
import ServerBalanceDatabaseService from "./serverBalanceDatabaseService";
import { NFTCosts } from "./types/types";
import { Web3Service } from "@decloudlabs/sky-cluster-operator/lib/config/ethersConfig";
import { ENVConfig } from "@decloudlabs/sky-cluster-operator/lib/config/envConfig";
import CostApplierService from "./CostApplierService";
export default class BalanceRunMain {
    RUN_DURATION: number;
    nextRunTime: number;
    web3Service: Web3Service;
    envConfig: ENVConfig;
    appFunctions: AppFunctions;
    balanceSettleService: BalanceSettleService;
    balanceExtractService: balanceExtractService;
    serverBalanceDatabaseService: ServerBalanceDatabaseService;
    costApplierService: CostApplierService;
    constructor(appFunctions: AppFunctions, checkBalanceCondition: (nftCosts: NFTCosts) => Promise<APICallReturn<boolean>>, applyCosts: (nftCosts: NFTCosts) => Promise<APICallReturn<NFTCosts>>, extractCostTime: number);
    setup: () => Promise<boolean>;
    update: () => Promise<never>;
}
