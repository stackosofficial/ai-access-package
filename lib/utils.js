"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getServerCostCalculator = void 0;
const contracts_1 = require("@decloudlabs/skynet/lib/types/contracts");
const getServerCostCalculator = (SERVER_COST_CONTRACT_ADDRESS, signer) => {
    return contracts_1.ServerCostCalculator__factory.connect(SERVER_COST_CONTRACT_ADDRESS, signer);
};
exports.getServerCostCalculator = getServerCostCalculator;
