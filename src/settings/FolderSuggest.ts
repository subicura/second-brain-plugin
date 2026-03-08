import { AbstractInputSuggest, TAbstractFile, TFolder } from "obsidian";
import type { App } from "obsidian";

export class FolderSuggest extends AbstractInputSuggest<TFolder> {
    private inputEl: HTMLInputElement;

    constructor(app: App, inputEl: HTMLInputElement) {
        super(app, inputEl);
        this.inputEl = inputEl;
    }

    getSuggestions(query: string): TFolder[] {
        const lowerQuery = query.toLowerCase();
        const folders: TFolder[] = [];

        for (const file of this.app.vault.getAllLoadedFiles()) {
            if (
                file instanceof TFolder &&
                file.path.toLowerCase().includes(lowerQuery)
            ) {
                folders.push(file);
            }
        }

        return folders.slice(0, 1000);
    }

    renderSuggestion(folder: TFolder, el: HTMLElement): void {
        el.setText(folder.path);
    }

    selectSuggestion(folder: TFolder): void {
        this.setValue(folder.path);
        this.inputEl.trigger("input");
        this.close();
    }
}
