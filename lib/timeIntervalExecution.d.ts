export declare class TimeIntervalExecution {
    lastInvokeTime: Date;
    duration: number;
    funcToRun: () => Promise<any>;
    constructor(duration: number, funcToRun: () => Promise<any>);
    execute: () => Promise<void>;
}
