export default class Mutex {
  locked: boolean;
  queue: any[];

  constructor() {
    this.queue = [];
    this.locked = false;
  }

  lock() {
    return new Promise<void>((resolve, reject) => {
      if (this.locked) {
        this.queue.push([resolve, reject]);
      } else {
        this.locked = true;
        resolve();
      }
    });
  }

  release() {
    if (this.queue.length > 0) {
      const [resolve, reject] = this.queue.shift();
      resolve();
    } else {
      this.locked = false;
    }
  }
}
