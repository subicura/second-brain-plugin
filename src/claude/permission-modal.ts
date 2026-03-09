import type { App } from "obsidian";
import { Modal } from "obsidian";

export type PermissionChoice = "allow" | "allow-all" | "deny";

export class PermissionModal extends Modal {
    private toolName: string;
    private summary: string;
    private reason: string;
    private resolve: (choice: PermissionChoice) => void = () => {};
    private resolved = false;

    constructor(
        app: App,
        toolName: string,
        summary: string,
        reason: string,
    ) {
        super(app);
        this.toolName = toolName;
        this.summary = summary;
        this.reason = reason;
    }

    prompt(): Promise<PermissionChoice> {
        return new Promise((resolve) => {
            this.resolve = resolve;
            this.open();
        });
    }

    onOpen(): void {
        const { contentEl, modalEl } = this;
        modalEl.addClass("sb-permission-modal");

        contentEl.createEl("h3", { text: "권한 요청" });

        const infoEl = contentEl.createDiv({ cls: "sb-permission-info" });
        infoEl.createDiv({
            cls: "sb-permission-tool",
            text: this.toolName,
        });
        infoEl.createDiv({
            cls: "sb-permission-summary",
            text: this.summary,
        });
        if (this.reason) {
            infoEl.createDiv({
                cls: "sb-permission-reason",
                text: this.reason,
            });
        }

        const btnRow = contentEl.createDiv({ cls: "sb-permission-buttons" });

        const denyBtn = btnRow.createEl("button", { text: "거부" });
        denyBtn.addEventListener("click", () => this.settle("deny"));

        const allowBtn = btnRow.createEl("button", { text: "허용" });
        allowBtn.addEventListener("click", () => this.settle("allow"));

        const allowAllBtn = btnRow.createEl("button", {
            text: "전체 허용",
            cls: "mod-cta",
        });
        allowAllBtn.addEventListener("click", () => this.settle("allow-all"));

        allowAllBtn.focus();
    }

    onClose(): void {
        this.settle("deny");
        this.contentEl.empty();
    }

    private settle(choice: PermissionChoice): void {
        if (this.resolved) return;
        this.resolved = true;
        this.resolve(choice);
        this.close();
    }
}
