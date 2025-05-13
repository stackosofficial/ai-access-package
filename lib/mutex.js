"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class Mutex {
    constructor() {
        this.queue = [];
        this.locked = false;
    }
    lock() {
        return new Promise((resolve, reject) => {
            if (this.locked) {
                this.queue.push([resolve, reject]);
            }
            else {
                this.locked = true;
                resolve();
            }
        });
    }
    release() {
        if (this.queue.length > 0) {
            const [resolve, reject] = this.queue.shift();
            resolve();
        }
        else {
            this.locked = false;
        }
    }
}
exports.default = Mutex;
