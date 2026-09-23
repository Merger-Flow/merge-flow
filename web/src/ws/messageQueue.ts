export class OutboundMessageQueue<T> {
    private pending: T[] = [];

    enqueue(message: T): void {
        this.pending.push(message);
    }

    flush(): T[] {
        const messages = this.pending;
        this.pending = [];
        return messages;
    }
}
