export class TimeIntervalExecution {
  lastInvokeTime: Date;
  duration: number;
  funcToRun: () => Promise<any>;

  constructor(duration: number, funcToRun: () => Promise<any>) {
    this.lastInvokeTime = new Date();
    this.duration = duration;
    this.funcToRun = funcToRun;
  }

  execute = async () => {
    if (this.lastInvokeTime.getTime() + this.duration > new Date().getTime()) {
      return;
    }

    this.lastInvokeTime = new Date();

    await this.funcToRun();
  };
}
