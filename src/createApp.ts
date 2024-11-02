import SkyMainNodeJS from "@decloudlabs/skynet/lib/services/SkyMainNodeJS";
import { APICallReturn } from "@decloudlabs/skynet/lib/types/types";
import { CreateAppEnvVariables } from "@decloudlabs/skynet/lib/types/types";
import { AppComputePayload, AppModifier, DripRateFactors, STORAGE_TYPE, SubscriptionParam } from "@decloudlabs/skynet/lib/types/types";
import { ContractApp } from "@decloudlabs/skynet/lib/types/types";
import { getSkyNode } from "./clients/skynet";

export const createApp = async (projectId: string, appName: string, dockerImageName: string, dockerTag: string, containerPort: number, resourceType: number[], resourceCount: number[], multiplier: number[], balance: string, subnetId: string, environmentVariables: CreateAppEnvVariables[] = []): Promise<APICallReturn<string>> => {
    const skyNode: SkyMainNodeJS = await getSkyNode();

    const contractApp: ContractApp = {
        nftID: projectId,
        appID: "",
        appName: `${appName}`,
        appPath: Buffer.from(STORAGE_TYPE.LIGHTHOUSE + '/').toString('hex'),
        modPath: Buffer.from(STORAGE_TYPE.LIGHTHOUSE + '/').toString('hex'),
        appSubnetConfig: [{
            resourceType: resourceType,
            resourceCount: resourceCount,
            multiplier: multiplier
        }],
        subnetList: [subnetId],
        cidLock: false,
        nftRange: [[projectId, projectId]]
    }

    let subscriptionParam: SubscriptionParam = {
        licenseAddress: "0x0000000000000000000000000000000000000000",
        supportAddress: "0x3C904a5f23f868f309a6DB2a428529F33848f517",
        platformAddress: "0xBC6200490F4bFC9092eA2987Ddb1Df478997e0cd",
        referralAddress: "0x0000000000000000000000000000000000000000",
        createTime: 0
    }

    const createTimeResp = await skyNode.dripRateManager.getSubscriptionParam(projectId);

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
        nftID: `${projectId}`,
        namespace: `n${projectId}`,
        persistence: [],
        containers: [
            {
                name: `${appName}`,
                image: `${dockerImageName}:${dockerTag}`,
                tcpPorts: [],
                httpPorts: [
                    {
                        hostURL: {
                            urlString: `${appName}-n${projectId}.stackos.io`,
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

    const createAppResponse = await skyNode.appManager.createApp(
        contractApp,
        subscriptionParam,
        dripRateFactors,
        [balance],
        appPayload,
        appModifier,
        async (status) => {
            console.log('status', status);
        },
        { fetchAppList: true, fetchSubscriptionParam: true, fetchBalanceForSubscription: true, getDeploymentStatus: false }
    );

    if (createAppResponse.success) {
        return {
            success: true,
            data: `https://${appName}-n${projectId}.stackos.io`
        };
    }
    return {
        success: false,
        data: new Error(createAppResponse.data.toString())
    };
}