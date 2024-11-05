import SkyMainNodeJS from "@decloudlabs/skynet/lib/services/SkyMainNodeJS";
import { APICallReturn } from "@decloudlabs/skynet/lib/types/types";
import { CreateAppEnvVariables } from "@decloudlabs/skynet/lib/types/types";
import { AppComputePayload, AppModifier, DripRateFactors, STORAGE_TYPE, SubscriptionParam } from "@decloudlabs/skynet/lib/types/types";
import { ContractApp } from "@decloudlabs/skynet/lib/types/types";
import { getSkyNode } from "./clients/skynet";
import { ethers } from "ethers";

export const createApp = async (skyNode: SkyMainNodeJS, appName: string, dockerImageName: string, containerPort: number, resourceType: number[], resourceCount: number[], multiplier: number[], balance: number, environmentVariables: CreateAppEnvVariables[] = []): Promise<APICallReturn<string>> => {
    console.log("createApp: ", appName, dockerImageName, containerPort, resourceType, resourceCount, multiplier, balance, environmentVariables);

    const projectId = await mintProject();
    if (!projectId.success) {
        return {
            success: false,
            data: new Error(projectId.data.toString())
        };
    }

    const contractApp: ContractApp = {
        nftID: projectId.data,
        appID: "",
        appName: `${appName}`,
        appPath: Buffer.from(STORAGE_TYPE.LIGHTHOUSE + '/').toString('hex'),
        modPath: Buffer.from(STORAGE_TYPE.LIGHTHOUSE + '/').toString('hex'),
        appSubnetConfig: [{
            resourceType: resourceType,
            resourceCount: resourceCount,
            multiplier: multiplier
        }],
        subnetList: ["0"],
        cidLock: false,
        nftRange: [[projectId.data, projectId.data]]
    }

    let subscriptionParam: SubscriptionParam = {
        licenseAddress: "0x0000000000000000000000000000000000000000",
        supportAddress: "0x3C904a5f23f868f309a6DB2a428529F33848f517",
        platformAddress: "0xBC6200490F4bFC9092eA2987Ddb1Df478997e0cd",
        referralAddress: "0x0000000000000000000000000000000000000000",
        createTime: 0
    }

    const createTimeResp = await skyNode.dripRateManager.getSubscriptionParam(projectId.data);

    if (createTimeResp && createTimeResp.success) {
        if (createTimeResp.data.createTime > 0) {
            subscriptionParam.createTime = createTimeResp.data.createTime;
        }
    }

    const dripRateFactors: DripRateFactors = {
        licenseFactor: 0,
        supportFactor: 0,
        platformFactor: 0,
        referralFactor: 0,
        discountFactor: 0,
        referralExpiryDuration: 0,
        createTime: 0,
        daoRate: 0
    }

    const appPayload: AppComputePayload = {
        appName: `${appName}`,
        nftID: `${projectId.data}`,
        namespace: `n${projectId.data}`,
        persistence: [],
        containers: [
            {
                name: `${appName}`,
                // image: `${dockerImageName}:${dockerTag}`,
                image: `${dockerImageName}`,
                tcpPorts: [],
                httpPorts: [
                    {
                        hostURL: {
                            urlString: `${appName}-n${projectId.data}.stackos.io`,
                            createMode: 'CREATE',
                        },
                        containerPort: containerPort.toString(),
                        servicePort: "80"
                    },
                ],
                args: [],
                envVariables: environmentVariables,
                resourceLimits: {
                    cpu: 300,
                    memory: 300,
                },
                resourceRequests: {
                    cpu: 300,
                    memory: 300,
                },
                volumeMounts: [],
            },
        ],
        replicaCount: 1,
        whitelistedIps: ['0.0.0.0/0'],
        status: ""
    }

    const appModifier: AppModifier = {
        modAttribVar: {},
        contractParam: {},
        loggerURL: "https://appsender.skynet.io/api/appStatus"
    }

    const balanceInWei = await skyNode.dripRateManager.estimateBalance([contractApp], balance);

    if (!balanceInWei.success) {
        return {
            success: false,
            data: new Error(balanceInWei.data.toString())
        };
    }

    const createAppResponse = await skyNode.appManager.createApp(
        contractApp,
        subscriptionParam,
        dripRateFactors,
        [balanceInWei.data.subnetBalances[0]],
        appPayload,
        appModifier,
        async (status) => {
            console.log('status', status);
        },
        { fetchAppList: true, fetchSubscriptionParam: true, fetchBalanceForSubscription: true, getDeploymentStatus: true }
    );

    if (createAppResponse.success) {
        return {
            success: true,
            data: `https://${appName}-n${projectId.data}.stackos.io`
        };
    }
    return {
        success: false,
        data: new Error(createAppResponse.data.toString())
    };
}

const mintProject = async (): Promise<APICallReturn<string>> => {
    const skyNode: SkyMainNodeJS = await getSkyNode();
    const tx = await skyNode.contractService.AppNFTMinter.mint(process.env.OPERATOR_PUBLIC_KEY!, {
        value: ethers.utils.parseUnits("200", 'gwei')
    });
    if (tx) {
        const ProjectId = await getProjectID();
        console.log('Project id', ProjectId);
        return {
            success: true,
            data: ProjectId.toString()
        }
    }
    return {
        success: false,
        data: new Error("Failed to mint Project")
    }
}

const getProjectID = async () => {
    try {
        const skyNode: SkyMainNodeJS = await getSkyNode();
        const balanceOf = await skyNode.contractService.AppNFT.balanceOf(process.env.OPERATOR_PUBLIC_KEY!);
        const ProjectId = await skyNode.contractService.AppNFT.tokenOfOwnerByIndex(process.env.OPERATOR_PUBLIC_KEY!, parseInt(balanceOf) - 1);
        return ProjectId;
    } catch (error) {
        return 0;
    }
};