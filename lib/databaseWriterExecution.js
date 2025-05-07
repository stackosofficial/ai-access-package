"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseWriterExecution = void 0;
const mutex_1 = __importDefault(require("./mutex"));
const nonReentrantExecution_1 = require("./nonReentrantExecution");
const timeIntervalExecution_1 = require("./timeIntervalExecution");
class DatabaseWriterExecution {
    constructor(writerName, funcToRun, insertFunc, interval) {
        this.insert = async (params) => {
            await this.mutex.lock();
            try {
                this.insertFunc(params);
            }
            catch (err) {
                console.error("error while inserting", this.writerName, err);
            }
            await this.mutex.release();
        };
        this.wrapFunc = async (funcToWrap) => {
            await this.mutex.lock();
            try {
                funcToWrap();
            }
            catch (err) {
                console.error("error while running", this.writerName, err);
            }
            await this.mutex.release();
        };
        this.execute = async () => {
            await this.nonReentrantExecution.execute();
        };
        this.getNextRunTime = () => {
            // return this.timeIntervalExecution.lastInvokeTime;
            const nextTime = new Date(this.timeIntervalExecution.lastInvokeTime.getTime() +
                this.timeIntervalExecution.duration);
            return nextTime;
        };
        this.setNextRunTime = (nextDate) => {
            this.timeIntervalExecution.lastInvokeTime = new Date(nextDate.getTime() - this.timeIntervalExecution.duration);
        };
        this.isLocked = () => {
            return this.mutex.locked;
        };
        this.mutex = new mutex_1.default();
        this.writerName = writerName;
        const mutexFunc = async () => {
            await this.mutex.lock();
            try {
                await funcToRun();
            }
            catch (err) {
                console.error("error in database ", writerName, err);
            }
            await this.mutex.release();
        };
        this.insertFunc = insertFunc;
        this.timeIntervalExecution = new timeIntervalExecution_1.TimeIntervalExecution(interval, mutexFunc);
        this.nonReentrantExecution = new nonReentrantExecution_1.NonReentrantExecution(this.timeIntervalExecution.execute);
    }
}
exports.DatabaseWriterExecution = DatabaseWriterExecution;
