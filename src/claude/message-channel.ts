import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";

function toSDKUserMessage(text: string): SDKUserMessage {
    return {
        type: "user",
        message: {
            role: "user",
            content: text,
        },
        parent_tool_use_id: null,
        session_id: "",
    } as SDKUserMessage;
}

export class MessageChannel implements AsyncIterable<SDKUserMessage> {
    private queue: SDKUserMessage[] = [];
    private closed = false;
    private resolveNext: ((value: IteratorResult<SDKUserMessage>) => void) | null = null;

    send(text: string): void {
        if (this.closed) return;

        const message = toSDKUserMessage(text);

        if (this.resolveNext) {
            const resolve = this.resolveNext;
            this.resolveNext = null;
            resolve({ value: message, done: false });
        } else {
            this.queue.push(message);
        }
    }

    close(): void {
        this.closed = true;
        this.queue = [];
        if (this.resolveNext) {
            const resolve = this.resolveNext;
            this.resolveNext = null;
            resolve({ value: undefined as unknown as SDKUserMessage, done: true });
        }
    }

    [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
        return {
            next: (): Promise<IteratorResult<SDKUserMessage>> => {
                if (this.closed) {
                    return Promise.resolve({ value: undefined as unknown as SDKUserMessage, done: true });
                }

                if (this.queue.length > 0) {
                    return Promise.resolve({ value: this.queue.shift()!, done: false });
                }

                return new Promise((resolve) => {
                    this.resolveNext = resolve;
                });
            },
        };
    }
}
