import Mutex from "./mutex";
import { NonReentrantExecution } from "./nonReentrantExecution";
import { TimeIntervalExecution } from "./timeIntervalExecution";
export declare class DatabaseWriterExecution<I> {
    nonReentrantExecution: NonReentrantExecution;
    timeIntervalExecution: TimeIntervalExecution;
    insertFunc: (params: I) => any;
    mutex: Mutex;
    writerName: string;
    constructor(writerName: string, funcToRun: () => Promise<any>, insertFunc: (params: I) => any, interval: number);
    insert: (params: I) => Promise<void>;
    wrapFunc: (funcToWrap: () => any) => Promise<void>;
    execute: () => Promise<void>;
    getNextRunTime: () => Date;
    setNextRunTime: (nextDate: Date) => void;
    isLocked: () => boolean;
}
