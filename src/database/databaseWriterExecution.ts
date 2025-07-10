import Mutex from "../utils/mutex";
import { NonReentrantExecution } from "../utils/nonReentrantExecution";
import { TimeIntervalExecution } from "../utils/timeIntervalExecution";

export class DatabaseWriterExecution<I> {
  nonReentrantExecution: NonReentrantExecution;
  timeIntervalExecution: TimeIntervalExecution;
  insertFunc: (params: I) => any;
  mutex: Mutex;
  writerName: string;

  constructor(
    writerName: string,
    funcToRun: () => Promise<any>,
    insertFunc: (params: I) => any,
    interval: number
  ) {
    this.mutex = new Mutex();
    this.writerName = writerName;
    const mutexFunc = async () => {
      await this.mutex.lock();
      try {
        await funcToRun();
      } catch (err) {
        console.error("error in database ", writerName, err);
      }
      await this.mutex.release();
    };

    this.insertFunc = insertFunc;
    this.timeIntervalExecution = new TimeIntervalExecution(interval, mutexFunc);
    this.nonReentrantExecution = new NonReentrantExecution(
      this.timeIntervalExecution.execute
    );
  }

  insert = async (params: I) => {
    await this.mutex.lock();
    try {
      this.insertFunc(params);
    } catch (err) {
      console.error("error while inserting", this.writerName, err);
    }
    await this.mutex.release();
  };

  wrapFunc = async (funcToWrap: () => any) => {
    await this.mutex.lock();
    try {
      funcToWrap();
    } catch (err) {
      console.error("error while running", this.writerName, err);
    }
    await this.mutex.release();
  };

  execute = async () => {
    await this.nonReentrantExecution.execute();
  };

  getNextRunTime = () => {
    // return this.timeIntervalExecution.lastInvokeTime;
    const nextTime = new Date(
      this.timeIntervalExecution.lastInvokeTime.getTime() +
        this.timeIntervalExecution.duration
    );

    return nextTime;
  };

  setNextRunTime = (nextDate: Date) => {
    this.timeIntervalExecution.lastInvokeTime = new Date(
      nextDate.getTime() - this.timeIntervalExecution.duration
    );
  };

  isLocked = () => {
    return this.mutex.locked;
  };
}
