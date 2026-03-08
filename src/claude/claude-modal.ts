import type { App } from "obsidian";
import { Component, Modal, MarkdownRenderer } from "obsidian";

import type { ClaudeModel } from "../types";
import { ClaudeService } from "./claude-service";

export class ClaudeChatModal extends Modal {
    private promptName: string;
    private model: ClaudeModel;
    private prompt: string;
    private fileName: string;
    private inputValues: Record<string, string>;
    private claudeService: ClaudeService;

    private chatContainerEl: HTMLElement | null = null;
    private inputEl: HTMLTextAreaElement | null = null;
    private sendBtnEl: HTMLButtonElement | null = null;
    private currentAssistantEl: HTMLElement | null = null;
    private toolIndicatorEl: HTMLElement | null = null;
    private currentAssistantText = "";
    private isStreaming = false;
    private renderComponent = new Component();
    private spinnerEl: HTMLElement | null = null;

    constructor(
        app: App,
        promptName: string,
        model: ClaudeModel,
        prompt: string,
        fileName: string,
        inputValues: Record<string, string> = {},
    ) {
        super(app);
        this.promptName = promptName;
        this.model = model;
        this.prompt = prompt;
        this.fileName = fileName;
        this.inputValues = inputValues;
        this.claudeService = new ClaudeService(app);
    }

    async onOpen(): Promise<void> {
        const { contentEl, modalEl } = this;

        modalEl.addClass("sb-claude-modal");

        // Header
        const header = contentEl.createDiv({ cls: "sb-claude-header" });
        header.createSpan({
            text: this.promptName,
            cls: "sb-claude-header-title",
        });
        header.createSpan({
            text: this.fileName,
            cls: "sb-claude-header-file",
        });

        // Chat messages container
        this.chatContainerEl = contentEl.createDiv({ cls: "sb-claude-messages" });

        // Handle internal link clicks ([[link]]) inside the modal
        this.chatContainerEl.addEventListener("click", (e) => {
            const link = (e.target as HTMLElement).closest("a");
            if (!link) return;
            const href = link.getAttribute("data-href") || link.getAttribute("href");
            if (!href || href.startsWith("http://") || href.startsWith("https://")) return;
            e.preventDefault();
            e.stopPropagation();
            this.app.workspace.openLinkText(href, "", true);
        });

        // Input area
        const inputRow = contentEl.createDiv({ cls: "sb-claude-input-row" });

        this.inputEl = inputRow.createEl("textarea", {
            cls: "sb-claude-input",
            attr: { placeholder: "메시지를 입력하세요...", rows: "1" },
        });

        this.sendBtnEl = inputRow.createEl("button", {
            text: "전송",
            cls: "sb-claude-send-btn",
        });

        // Event handlers
        this.sendBtnEl.addEventListener("click", () => this.handleSend());
        this.inputEl.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                this.handleSend();
            }
            this.autoResize();
        });
        this.inputEl.addEventListener("input", () => this.autoResize());

        this.renderComponent.load();

        await this.startSession();
    }

    onClose(): void {
        this.claudeService.close();
        this.renderComponent.unload();
        this.contentEl.empty();
    }

    private async startSession(): Promise<void> {
        // Show input values as initial user message
        const inputLines = Object.entries(this.inputValues)
            .filter(([, v]) => v)
            .map(([, v]) => v);
        if (inputLines.length > 0) {
            this.addMessageEl("user", inputLines.join("\n"));
        }

        this.setStreaming(true);

        this.currentAssistantText = "";
        this.currentAssistantEl = this.addMessageEl("assistant", "");
        this.showLoadingIndicator();

        const prompt = this.prompt;
        this.prompt = "";

        await this.claudeService.startSession(
            prompt,
            this.model,
            this.createCallbacks(),
        );
    }

    private createCallbacks() {
        return {
            onText: (text: string) => {
                this.hideLoadingIndicator();
                this.removeToolIndicator();
                this.hideSpinner();
                this.currentAssistantText += text;
                this.updateAssistantMessage(this.currentAssistantText);
                this.showSpinner();
            },
            onToolUse: (toolName: string, summary: string) => {
                this.hideLoadingIndicator();
                this.hideSpinner();
                this.showToolIndicator(toolName, summary);
                this.showSpinner();
            },
            onTurnComplete: () => {
                this.removeToolIndicator();
                this.hideSpinner();
                const finalText = this.currentAssistantText;
                this.renderAssistantMarkdown(finalText);
                this.addCopyButton(finalText);
                this.currentAssistantEl = null;
                this.currentAssistantText = "";
                this.setStreaming(false);
            },
            onError: (error: string) => {
                this.hideLoadingIndicator();
                this.removeToolIndicator();
                this.hideSpinner();
                if (this.currentAssistantEl) {
                    this.currentAssistantEl.textContent = `오류: ${error}`;
                    this.currentAssistantEl.addClass("sb-claude-error");
                }
                this.setStreaming(false);
            },
        };
    }

    private async handleSend(): Promise<void> {
        if (!this.inputEl || this.isStreaming) return;

        const text = this.inputEl.value.trim();
        if (!text) return;

        this.addMessageEl("user", text);
        this.inputEl.value = "";
        this.autoResize();

        this.setStreaming(true);
        this.currentAssistantText = "";
        this.currentAssistantEl = this.addMessageEl("assistant", "");
        this.showLoadingIndicator();

        this.claudeService.sendMessage(text);
        this.showSpinner();
    }

    private addMessageEl(role: "user" | "assistant", content: string): HTMLElement {
        if (!this.chatContainerEl) return document.createElement("div");

        const messageEl = this.chatContainerEl.createDiv({
            cls: `sb-claude-message sb-claude-message--${role}`,
        });

        if (role === "user") {
            const labelEl = messageEl.createDiv({ cls: "sb-claude-message-label" });
            labelEl.textContent = "나";
        }

        const bodyEl = messageEl.createDiv({ cls: "sb-claude-message-body" });
        bodyEl.textContent = content;

        this.scrollToBottom();
        return bodyEl;
    }

    private updateAssistantMessage(text: string): void {
        if (!this.currentAssistantEl) return;
        this.currentAssistantEl.textContent = text;
        this.scrollToBottom();
    }

    private async renderAssistantMarkdown(text: string): Promise<void> {
        if (!this.currentAssistantEl) return;
        this.currentAssistantEl.empty();
        await MarkdownRenderer.render(this.app, text, this.currentAssistantEl, "", this.renderComponent);
        this.scrollToBottom();
    }

    private addCopyButton(text: string): void {
        const messageEl = this.currentAssistantEl?.parentElement;
        if (!messageEl) return;

        const actionsEl = messageEl.createDiv({ cls: "sb-claude-message-actions" });
        const copyBtn = actionsEl.createEl("button", {
            cls: "sb-claude-copy-btn",
            attr: { "aria-label": "복사" },
        });
        copyBtn.innerHTML =
            '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

        copyBtn.addEventListener("click", async () => {
            await navigator.clipboard.writeText(text);
            copyBtn.innerHTML =
                '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
            setTimeout(() => {
                copyBtn.innerHTML =
                    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
            }, 1500);
        });
    }

    private showLoadingIndicator(): void {
        if (!this.currentAssistantEl) return;
        this.currentAssistantEl.addClass("sb-claude-loading");
        this.currentAssistantEl.textContent = "생각하는 중...";
    }

    private hideLoadingIndicator(): void {
        if (!this.currentAssistantEl) return;
        this.currentAssistantEl.removeClass("sb-claude-loading");
    }

    private showSpinner(): void {
        if (!this.chatContainerEl) return;
        if (!this.spinnerEl) {
            this.spinnerEl = this.chatContainerEl.createDiv({ cls: "sb-claude-spinner" });
            this.spinnerEl.innerHTML =
                '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';
        }
        this.scrollToBottom();
    }

    private hideSpinner(): void {
        if (this.spinnerEl) {
            this.spinnerEl.remove();
            this.spinnerEl = null;
        }
    }

    private showToolIndicator(toolName: string, summary: string): void {
        if (!this.chatContainerEl) return;

        if (!this.toolIndicatorEl) {
            this.toolIndicatorEl = this.chatContainerEl.createDiv({ cls: "sb-claude-tool-indicator" });
        }

        this.toolIndicatorEl.empty();
        this.toolIndicatorEl.createSpan({ text: toolName, cls: "sb-claude-tool-name" });
        this.toolIndicatorEl.createSpan({ text: summary, cls: "sb-claude-tool-summary" });
        this.scrollToBottom();
    }

    private removeToolIndicator(): void {
        if (this.toolIndicatorEl) {
            this.toolIndicatorEl.remove();
            this.toolIndicatorEl = null;
        }
    }

    private setStreaming(streaming: boolean): void {
        this.isStreaming = streaming;
        if (this.inputEl) this.inputEl.disabled = streaming;
        if (this.sendBtnEl) this.sendBtnEl.disabled = streaming;
    }

    private scrollToBottom(): void {
        if (this.chatContainerEl) {
            this.chatContainerEl.scrollTop = this.chatContainerEl.scrollHeight;
        }
    }

    private autoResize(): void {
        if (!this.inputEl) return;
        this.inputEl.style.height = "auto";
        this.inputEl.style.height = Math.min(this.inputEl.scrollHeight, 120) + "px";
    }
}
