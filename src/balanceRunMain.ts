import { ENVDefinition } from "./types/types";
import { APICallReturn } from "@decloudlabs/skynet/lib/types/types";
import { sleep } from "@decloudlabs/skynet/lib/utils/utils";
import balanceExtractService from "./balanceExtractService";
import BalanceSettleService from "./balanceSettleService";
import ServerBalanceDatabaseService from "./serverBalanceDatabaseService";
import { NFTCosts } from "./types/types";
import ENVConfig from "./envConfig";
import express from "express";
import cors from "cors";
import CostApplierService from "./CostApplierService";
import { ethers } from "ethers";


export default class BalanceRunMain {
    RUN_DURATION: number;
    nextRunTime: number;
    envConfig: ENVConfig;
    balanceSettleService: BalanceSettleService;
    balanceExtractService: balanceExtractService;
    serverBalanceDatabaseService: ServerBalanceDatabaseService;
    costApplierService: CostApplierService
    signer: ethers.Wallet;
    jsonProvider: ethers.providers.JsonRpcProvider;

    constructor(env: ENVDefinition, checkBalanceCondition: (nftCosts: NFTCosts) => Promise<APICallReturn<boolean>>, applyCosts: (nftCosts: NFTCosts) => Promise<APICallReturn<NFTCosts>>, extractCostTime: number) {
        this.RUN_DURATION = 5000;
        this.envConfig = new ENVConfig(env);
        this.nextRunTime = new Date().getTime();


        this.jsonProvider = new ethers.providers.JsonRpcProvider(
            this.envConfig.env.JSON_RPC_PROVIDER,
            undefined,
            // option,
        );
        console.log("json rpc: ", this.envConfig.env.JSON_RPC_PROVIDER);

        this.signer = new ethers.Wallet(
            this.envConfig.env.WALLET_PRIVATE_KEY,
            this.jsonProvider,
        );

        // this.contractService = new ContractService(
        //     this.web3Service,
        //     this.envConfig,
        // );
        // this.databaseService = new DatabaseService(this.envConfig);
        // this.systemLogService = new SystemLogService(
        //     this.databaseService,
        //     this.envConfig,
        // );
        // this.nftLogService = new NFTLogService(
        //     this.databaseService,
        //     this.systemLogService,
        //     this.envConfig,
        // );
        // this.eventProcessor = new NFTEventProcessor(this.contractService);
        // this.nftBalanceAPIService = new NFTBalanceAPIService(this.envConfig);
        // this.bootupEventCollectService = new BootEventCollectService(
        //     this.databaseService,
        //     this.contractService,
        //     this.eventProcessor,
        //     this.web3Service,
        //     this.systemLogService,
        //     this.envConfig,
        // );
        // this.appStatusLogService = new AppStatusService(
        //     this.nftLogService,
        //     this.envConfig,
        // );
        // this.eventAction = new EventAction(
        //     this.contractService,
        //     this.web3Service,
        //     this.nftLogService,
        //     this.nftBalanceAPIService,
        //     this.systemLogService,
        //     this.appStatusLogService,
        //     this.envConfig,
        //     this.appFunctions,
        // );
        // this.heartBeatService = new HeartBeatService(
        //     this.databaseService,
        //     this.systemLogService,
        //     this.envConfig,
        // );
        // this.processCheckService = new ProcessCheckService(
        //     this.systemLogService,
        // );

        // this.eventFetcherService = new EventFetcherService(
        //     this.databaseService,
        //     this.systemLogService,
        //     this.eventProcessor,
        //     this.envConfig,
        // );

        this.serverBalanceDatabaseService = new ServerBalanceDatabaseService();
        this.balanceSettleService = new BalanceSettleService(
            this.envConfig,
            this.serverBalanceDatabaseService,
            this.signer, 
            checkBalanceCondition
        );

        this.balanceExtractService = new balanceExtractService(this.envConfig);

        this.costApplierService = new CostApplierService(
            this.serverBalanceDatabaseService,
            this.envConfig,
            this.signer,
            applyCosts,
            extractCostTime,
        );
        // setEventAction(this.eventAction);
        // this.eventProcessor.setRunTick(true);
    }

    // addSetupLog = async (type: SystemLog["logType"], message: string) => {
    //     await this.systemLogService.addSystemLog({
    //         timestamp: new Date(),
    //         operation: "main.setup",
    //         message: message,
    //         logType: type,
    //     });
    // };

    // addUpdateLog = async (type: SystemLog["logType"], message: string) => {
    //     await this.systemLogService.addSystemLog({
    //         timestamp: new Date(),
    //         operation: "main.update",
    //         message: message,
    //         logType: type,
    //     });
    // };

    setup = async () => {
        try {

            // await this.systemLogService.setup();

            // process.on("uncaughtException", async (caughtException) => {
            //     console.log("inside uncaught exception: " + caughtException);
            //     try {
            //         await this.systemLogService.addSystemLog({
            //             timestamp: new Date(),
            //             operation: "main.update",
            //             message:
            //                 caughtException.message +
            //                 ": " +
            //                 caughtException.stack,
            //             logType: "error",
            //         });
            //         await this.systemLogService.pushSysLogsToDatabase();

            //         process.exit(0);
            //     } catch (err) {
            //         console.error(
            //             "failed to push system logs to database: ",
            //             err,
            //         );
            //     }
            // });

            // this.addSetupLog(
            //     "operation",
            //     `ENV: ${stringifyTryCatch(this.envConfig)}`,
            // );

            const UPDATE_DURATION = 10 * 1000;
            this.RUN_DURATION = UPDATE_DURATION;

            // await this.nftLogService.setup();

            // await this.heartBeatService.setup();

            // await this.databaseService.setup();

            // await this.web3Service.setup();

            // await this.contractService.setup();

            // await this.eventProcessor.setup();

            // await this.bootupEventCollectService.setup();

            // await this.eventAction.setup();

            // await this.appStatusLogService.setup();

            // await this.processCheckService.setup();

            // await this.eventFetcherService.setup();

            await this.serverBalanceDatabaseService.setup();

            await this.balanceSettleService.setup();

            await this.balanceExtractService.setup();

            await this.costApplierService.setup();

            // initExpress(this);

            return true;
        } catch (err: any) {
            const error: Error = err;
            console.log("main setup error: ", error);
            return false;
        }
    };

    update = async () => {
        while (true) {
            {
                const curTime = new Date().getTime();
                const sleepDur = this.nextRunTime - curTime;
                await sleep(sleepDur);
                this.nextRunTime = new Date().getTime() + this.RUN_DURATION;
            }

            try {
                // await this.eventFetcherService.update();

                // await this.eventProcessor.update();
                // await this.bootupEventCollectService.update();
                // await this.nftLogService.update();
                // await this.appStatusLogService.update();
                // await this.processCheckService.update();
                // await this.systemLogService.update();
                // await this.heartBeatService.update();
                await this.balanceSettleService.update();

                await this.balanceExtractService.update();

                await this.costApplierService.update();
            } catch (err: any) {
                const error: Error = err;
                console.error("error in update: ", error);
                // await this.addUpdateLog("error", error.message);
            }
        }
    };
}
