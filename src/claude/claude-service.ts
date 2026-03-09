import type { App } from "obsidian";
import { FileSystemAdapter } from "obsidian";
import { query as agentQuery } from "@anthropic-ai/claude-agent-sdk";
import type { CanUseTool, Options, Query } from "@anthropic-ai/claude-agent-sdk";

import type { ClaudeModel } from "../types";
import { MessageChannel } from "./message-channel";
import { findClaudeCLIPath, getEnhancedPath } from "./cli-resolver";
import { PermissionModal } from "./permission-modal";

export interface ChatCallbacks {
    onText: (text: string) => void;
    onToolUse: (toolName: string, summary: string) => void;
    onTurnComplete: () => void;
    onError: (error: string) => void;
}

export class ClaudeService {
    private app: App;
    private channel: MessageChannel | null = null;
    private response: Query | null = null;
    private abortController: AbortController | null = null;

    constructor(app: App) {
        this.app = app;
    }

    async startSession(
        prompt: string,
        model: ClaudeModel,
        callbacks: ChatCallbacks,
    ): Promise<void> {
        this.close();

        const vaultPath = (this.app.vault.adapter as FileSystemAdapter).getBasePath();

        this.channel = new MessageChannel();
        this.abortController = new AbortController();

        const cliPath = findClaudeCLIPath();
        if (!cliPath) {
            callbacks.onError("Claude CLI를 찾을 수 없습니다. claude를 설치해주세요.");
            return;
        }

        const enhancedPath = getEnhancedPath(cliPath);

        let autoApprove = false;

        const canUseTool: CanUseTool = async (toolName, input, { decisionReason }) => {
            if (autoApprove) {
                return { behavior: "allow", updatedInput: input };
            }

            const summary = this.getToolSummary(toolName, input);
            const modal = new PermissionModal(
                this.app,
                toolName,
                summary,
                decisionReason ?? "",
            );
            const choice = await modal.prompt();

            if (choice === "deny") {
                return { behavior: "deny", message: "사용자가 거부했습니다." };
            }
            if (choice === "allow-all") {
                autoApprove = true;
            }
            return { behavior: "allow", updatedInput: input };
        };

        const options: Options = {
            cwd: vaultPath,
            model,
            abortController: this.abortController,
            pathToClaudeCodeExecutable: cliPath,
            permissionMode: "acceptEdits",
            canUseTool,
            settingSources: ["user", "project"],
            maxTurns: 30,
            env: {
                ...process.env,
                PATH: enhancedPath,
            },
        };

        this.response = agentQuery({ prompt: this.channel, options });

        this.processResponses(callbacks);

        this.channel.send(prompt);
    }

    sendMessage(message: string): void {
        if (!this.channel) return;
        this.channel.send(message);
    }

    close(): void {
        this.abortController?.abort();
        this.channel?.close();
        this.channel = null;
        this.response = null;
        this.abortController = null;
    }

    private async processResponses(callbacks: ChatCallbacks): Promise<void> {
        if (!this.response) return;

        try {
            for await (const message of this.response) {
                if (this.abortController?.signal.aborted) break;

                if (message.type === "assistant" && message.message?.content) {
                    for (const block of message.message.content) {
                        if (block.type === "text" && block.text) {
                            callbacks.onText(block.text);
                        } else if (block.type === "tool_use") {
                            const summary = this.getToolSummary(block.name, block.input);
                            callbacks.onToolUse(block.name, summary);
                        }
                    }
                }

                if ((message as any).type === "result") {
                    callbacks.onTurnComplete();
                }
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : "Unknown error";
            callbacks.onError(msg);
        }
    }

    private getToolSummary(name: string, input: any): string {
        if (!input) return name;

        switch (name) {
            case "Read":
            case "Write":
            case "Edit":
                return input.file_path ?? `${name} file`;
            case "Glob":
                return input.pattern ? `${input.pattern}` : "Searching files";
            case "Grep":
                return input.pattern ? `"${input.pattern}"` : "Searching content";
            case "Bash":
                return input.command ? `${input.command.slice(0, 60)}` : "Running command";
            default:
                return name;
        }
    }
}
