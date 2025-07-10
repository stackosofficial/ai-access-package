export class NonReentrantExecution {
  isRunning!: boolean;
  funcToRun: () => Promise<any>;

  constructor(funcToRun: () => Promise<any>) {
    this.funcToRun = funcToRun;
  }

  execute = async () => {
    if (this.isRunning) return;

    (async () => {
      this.isRunning = true;
      try {
        await this.funcToRun();
      } catch (err) {}
      this.isRunning = false;
    })();
  };
}
