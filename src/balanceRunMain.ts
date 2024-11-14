import OperatorMain from "@decloudlabs/sky-cluster-operator/lib/operatorMain";
import AppFunctions from "@decloudlabs/sky-cluster-operator/lib/services/appFunctions";
import { APICallReturn, SystemLog } from "@decloudlabs/sky-cluster-operator/lib/types/types";
import SkyMainNodeJS from "@decloudlabs/skynet/lib/services/SkyMainNodeJS";
import { sleep } from "@decloudlabs/skynet/lib/utils/utils";
import { stringifyTryCatch } from "@decloudlabs/sky-cluster-operator/lib/utils/utils";
import balanceExtractService from "./balanceExtractService";
import BalanceSettleService from "./balanceSettleService";
import ServerBalanceDatabaseService from "./serverBalanceDatabaseService";
import { NFTCosts } from "./types/types";
import { NFTEventProcessor } from "@decloudlabs/sky-cluster-operator/lib/events/eventProcessor";
import { Web3Service } from "@decloudlabs/sky-cluster-operator/lib/config/ethersConfig";
import { ENVConfig } from "@decloudlabs/sky-cluster-operator/lib/config/envConfig";
import { DatabaseService } from "@decloudlabs/sky-cluster-operator/lib/services/databaseService";
import { NFTLogService } from "@decloudlabs/sky-cluster-operator/lib/services/nftLogService";
import { BootEventCollectService } from "@decloudlabs/sky-cluster-operator/lib/services/bootEventCollectService";
import { SystemLogService } from "@decloudlabs/sky-cluster-operator/lib/services/systemLogService";
import { ContractService } from "@decloudlabs/sky-cluster-operator/lib/services/contractService";
import { EventAction, setEventAction } from "@decloudlabs/sky-cluster-operator/lib/events/eventAction";
import { HeartBeatService } from "@decloudlabs/sky-cluster-operator/lib/services/heartBeatService";
import { ProcessCheckService } from "@decloudlabs/sky-cluster-operator/lib/services/processCheckService";
import { AppStatusService } from "@decloudlabs/sky-cluster-operator/lib/services/appStatusService";
import { NFTBalanceAPIService } from "@decloudlabs/sky-cluster-operator/lib/services/nftBalanceAPIService";
import EventFetcherService from "@decloudlabs/sky-cluster-operator/lib/services/eventFetcherService";
import express from "express";
import cors from "cors";
import { NFTEventRouter } from "@decloudlabs/sky-cluster-operator/lib/express/modules/nftEvent/nftEventRouter";
import CostApplierService from "./CostApplierService";

const initExpress = (operatorMain: OperatorMain) => {
    const app = express();

    const apiRouter = new NFTEventRouter(operatorMain.eventProcessor);

    apiRouter.setup();

    app.use(cors());
    // body parser
    app.use(express.json());

    const PORT = process.env.PORT || 8000;

    app.get("/", (req: any, res: any) => {
        return res.status(200).send("welcome to the cluster operator service");
    });

    app.use("/api/nftevent", apiRouter.getRouter());

    app.listen(PORT, () => {
        console.log("Server listening on port ", PORT);
    });
};

export default class BalanceRunMain {
    RUN_DURATION: number;
    nextRunTime: number;
    web3Service: Web3Service;
    // contractService: ContractService;
    // eventProcessor: NFTEventProcessor;
    // nftBalanceAPIService: NFTBalanceAPIService;
    // databaseService: DatabaseService;
    // nftLogService: NFTLogService;
    // bootupEventCollectService: BootEventCollectService;
    // systemLogService: SystemLogService;
    // heartBeatService: HeartBeatService;
    // processCheckService: ProcessCheckService;
    // appStatusLogService: AppStatusService;
    // eventAction: EventAction;
    // eventFetcherService: EventFetcherService;
    envConfig: ENVConfig;
    appFunctions: AppFunctions;
    balanceSettleService: BalanceSettleService;
    balanceExtractService: balanceExtractService;
    serverBalanceDatabaseService: ServerBalanceDatabaseService;
    costApplierService: CostApplierService

    constructor(appFunctions: AppFunctions, checkBalanceCondition: (nftCosts: NFTCosts) => Promise<APICallReturn<boolean>>, applyCosts: (nftCosts: NFTCosts) => Promise<APICallReturn<NFTCosts>>, extractCostTime: number) {
        this.RUN_DURATION = 5000;
        this.envConfig = new ENVConfig();
        this.nextRunTime = new Date().getTime();
        this.appFunctions = appFunctions;
        this.web3Service = new Web3Service(this.envConfig);
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
            this.serverBalanceDatabaseService, 
            this.envConfig, 
            this.web3Service, 
            checkBalanceCondition
        );

        this.balanceExtractService = new balanceExtractService();

        this.costApplierService = new CostApplierService(
            this.serverBalanceDatabaseService,
            this.envConfig,
            this.web3Service,
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
            this.envConfig.setupENV();

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

            const { UPDATE_DURATION } = this.envConfig.SYSTEM_ENV;
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
