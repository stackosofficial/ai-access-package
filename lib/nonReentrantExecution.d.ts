export declare class NonReentrantExecution {
    isRunning: boolean;
    funcToRun: () => Promise<any>;
    constructor(funcToRun: () => Promise<any>);
    execute: () => Promise<void>;
}
