export default class Mutex {
    locked: boolean;
    queue: any[];
    constructor();
    lock(): Promise<void>;
    release(): void;
}
