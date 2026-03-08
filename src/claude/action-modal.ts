import { Modal, SuggestModal, Setting } from "obsidian";
import type { App } from "obsidian";

export interface PromptInput {
    name: string;
    label: string;
    placeholder: string;
    type: "text" | "textarea";
}

export interface ClaudeAction {
    name: string;
    promptTemplate: string;
    inputs: PromptInput[];
}

export class ActionModal extends SuggestModal<ClaudeAction> {
    private actions: ClaudeAction[];
    private onSelect: (action: ClaudeAction) => void;

    constructor(app: App, actions: ClaudeAction[], onSelect: (action: ClaudeAction) => void) {
        super(app);
        this.actions = actions;
        this.onSelect = onSelect;
        this.setPlaceholder("실행할 작업을 선택하세요...");
    }

    getSuggestions(query: string): ClaudeAction[] {
        return this.actions.filter((action) =>
            action.name.toLowerCase().includes(query.toLowerCase()),
        );
    }

    renderSuggestion(action: ClaudeAction, el: HTMLElement): void {
        el.createDiv({ text: action.name });
    }

    onChooseSuggestion(action: ClaudeAction): void {
        this.onSelect(action);
    }
}

export class InputModal extends Modal {
    private inputs: PromptInput[];
    private values: Record<string, string> = {};
    private onSubmit: (values: Record<string, string>) => void;

    constructor(app: App, inputs: PromptInput[], onSubmit: (values: Record<string, string>) => void) {
        super(app);
        this.inputs = inputs;
        this.onSubmit = onSubmit;
        this.modalEl.addClass("sb-input-modal");
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        this.values = {};

        for (const input of this.inputs) {
            this.values[input.name] = "";
            if (input.type === "textarea") {
                const setting = new Setting(contentEl).setName(input.label);
                setting.settingEl.addClass("sb-input-setting-textarea");
                const textarea = setting.settingEl.createEl("textarea", {
                    cls: "sb-input-textarea",
                    attr: { placeholder: input.placeholder || "" },
                });
                textarea.addEventListener("input", () => {
                    this.values[input.name] = textarea.value;
                });
            } else {
                new Setting(contentEl).setName(input.label).addText((text) => {
                    text.setPlaceholder(input.placeholder || "");
                    text.onChange((value) => {
                        this.values[input.name] = value;
                    });
                    text.inputEl.addEventListener("keydown", (e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            this.submit();
                        }
                    });
                });
            }
        }

        new Setting(contentEl).addButton((btn) =>
            btn.setButtonText("실행").setCta().onClick(() => this.submit()),
        );

        // Focus first input
        const firstInput = contentEl.querySelector("input, textarea") as HTMLElement | null;
        if (firstInput) firstInput.focus();
    }

    onClose(): void {
        this.contentEl.empty();
    }

    private submit(): void {
        this.close();
        this.onSubmit(this.values);
    }
}
