"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NonReentrantExecution = void 0;
class NonReentrantExecution {
    constructor(funcToRun) {
        this.execute = async () => {
            if (this.isRunning)
                return;
            (async () => {
                this.isRunning = true;
                try {
                    await this.funcToRun();
                }
                catch (err) { }
                this.isRunning = false;
            })();
        };
        this.funcToRun = funcToRun;
    }
}
exports.NonReentrantExecution = NonReentrantExecution;
