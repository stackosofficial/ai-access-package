"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimeIntervalExecution = void 0;
class TimeIntervalExecution {
    constructor(duration, funcToRun) {
        this.execute = async () => {
            if (this.lastInvokeTime.getTime() + this.duration > new Date().getTime()) {
                return;
            }
            this.lastInvokeTime = new Date();
            await this.funcToRun();
        };
        this.lastInvokeTime = new Date();
        this.duration = duration;
        this.funcToRun = funcToRun;
    }
}
exports.TimeIntervalExecution = TimeIntervalExecution;
