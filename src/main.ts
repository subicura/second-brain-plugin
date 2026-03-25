import { Notice, Platform, Plugin, TFile, moment, parseYaml } from "obsidian";
import type { RepoInfo, SecondBrainSettings, IGitManager, RepoSyncStatus } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { SecondBrainSettingTab } from "./settings";
import type { ClaudeAction, PromptInput } from "./claude/action-modal";
import { ActionModal, InputModal } from "./claude/action-modal";
import { ClaudeChatModal } from "./claude/claude-modal";

const DISPLAY_TIME_FORMAT = "YYYY-MM-DD HH:mm:ss";

export default class SecondBrainPlugin extends Plugin {
    settings: SecondBrainSettings = DEFAULT_SETTINGS;
    repos: { info: RepoInfo; manager: IGitManager }[] = [];
    private repoSyncStatus: Map<string, RepoSyncStatus> = new Map();
    private syncing = false;
    private autoSyncTimer: number | null = null;
    private statusBarEl: HTMLElement | null = null;

    async onload() {
        await this.loadSettings();

        this.addSettingTab(new SecondBrainSettingTab(this.app, this));

        const syncEl = this.addRibbonIcon("refresh-cw", "SecondBrain: Sync", async () => {
            await this.syncAll();
        });
        syncEl.addClass("secondbrain-sync-btn");

        this.addCommand({
            id: "sync-now",
            name: "Sync Now",
            callback: async () => {
                await this.syncAll();
            },
        });

        this.addCommand({
            id: "rescan-repos",
            name: "Rescan Repositories",
            callback: async () => {
                await this.scanRepos();
                new Notice(`SecondBrain: Found ${this.repos.length} repository(ies)`);
            },
        });

        this.addCommand({
            id: "view-conflicts",
            name: "View Conflicts",
            callback: async () => {
                await this.openConflictLog();
            },
        });

        // Claude: ribbon icon + command
        if (Platform.isDesktopApp) {
            const claudeEl = this.addRibbonIcon("sparkles", "SecondBrain: Claude", () => {
                if (!this.settings.claudeEnabled) {
                    new Notice("SecondBrain: Claude가 비활성화되어 있습니다. 설정에서 활성화해주세요.");
                    return;
                }
                const file = this.app.workspace.getActiveFile();
                if (!file || file.extension !== "md") {
                    new Notice("SecondBrain: 마크다운 파일을 열어주세요.");
                    return;
                }
                this.openClaudeActions(file);
            });
            claudeEl.addClass("secondbrain-claude-btn");

            this.addCommand({
                id: "claude-ai",
                name: "Claude - 현재 문서 작업",
                checkCallback: (checking) => {
                    if (!this.settings.claudeEnabled) return false;
                    const file = this.app.workspace.getActiveFile();
                    if (!file || file.extension !== "md") return false;
                    if (checking) return true;
                    this.openClaudeActions(file);
                },
            });
        }

        this.statusBarEl = this.addStatusBarItem();
        this.statusBarEl.addClass("secondbrain-status");
        this.statusBarEl.setText("idle");
        this.statusBarEl.addEventListener("click", () => {
            (this.app as any).setting.open();
            (this.app as any).setting.openTabById(this.manifest.id);
        });

        await this.scanRepos();
        this.setupAutoSync();
        this.syncAll();
    }

    onunload() {
        this.clearAutoSync();
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    getPassword(): string {
        return localStorage.getItem("secondbrain-password") ?? "";
    }

    setPassword(password: string) {
        localStorage.setItem("secondbrain-password", password);
        for (const repo of this.repos) {
            repo.manager.setCredentials(null, password || null);
        }
    }

    getSyncStatus(repoPath: string): RepoSyncStatus | undefined {
        return this.repoSyncStatus.get(repoPath);
    }

    setupAutoSync() {
        this.clearAutoSync();
        const interval = this.settings.autoSyncInterval;
        if (interval > 0) {
            this.autoSyncTimer = window.setInterval(
                () => this.syncAll(),
                interval * 60 * 1000
            );
            this.registerInterval(this.autoSyncTimer);
        }
    }

    private clearAutoSync() {
        if (this.autoSyncTimer !== null) {
            window.clearInterval(this.autoSyncTimer);
            this.autoSyncTimer = null;
        }
    }

    private async createManager(repoPath: string): Promise<IGitManager> {
        if (Platform.isDesktopApp) {
            const { SimpleGitManager } = await import("./simpleGitManager");
            return new SimpleGitManager(this.app, repoPath);
        } else {
            const { IsomorphicGitManager } = await import("./isomorphicGitManager");
            const manager = new IsomorphicGitManager(this.app, repoPath);
            manager.setCredentials(null, this.getPassword() || null);
            return manager;
        }
    }

    async scanRepos() {
        this.repos = [];
        const vault = this.app.vault;

        // Check vault root
        const rootHasGit = await vault.adapter.exists(".git/HEAD");
        if (rootHasGit) {
            const manager = await this.createManager("");
            this.repos.push({
                info: { path: "", name: "Vault Root" },
                manager,
            });
        }

        // Scan folders up to 3 levels deep for git repositories
        let foldersToScan = [""];
        const maxDepth = 3;

        for (let depth = 0; depth < maxDepth; depth++) {
            const nextFolders: string[] = [];
            const listings = await Promise.all(
                foldersToScan.map((parent) => vault.adapter.list(parent))
            );
            const allFolders = listings.flatMap((list) => list.folders);

            for (const folder of allFolders) {
                const folderName = folder.split("/").pop()!;
                if (folderName.startsWith(".")) continue;

                const gitPath = folder + "/.git";
                const [hasGit, hasConfig] = await Promise.all([
                    vault.adapter.exists(gitPath + "/HEAD"),
                    vault.adapter.exists(gitPath + "/config"),
                ]);

                if (hasGit && hasConfig) {
                    const manager = await this.createManager(folder);
                    this.repos.push({
                        info: { path: folder, name: folderName },
                        manager,
                    });
                } else {
                    nextFolders.push(folder);
                }
            }
            foldersToScan = nextFolders;
        }
    }

    async syncAll() {
        if (this.syncing) {
            new Notice("SecondBrain: Sync already in progress");
            return;
        }
        if (this.repos.length === 0) {
            new Notice("SecondBrain: No git repositories found");
            return;
        }

        this.syncing = true;
        this.setStatus("syncing...");

        let hasError = false;

        for (const repo of this.repos) {
            if (this.settings.disabledRepos.includes(repo.info.path)) continue;
            const repoName = repo.info.name;
            try {
                const result = await this.syncRepo(repo.manager, repoName, repo.info.path);
                this.repoSyncStatus.set(repo.info.path, {
                    time: moment().format(DISPLAY_TIME_FORMAT),
                    success: !result.hasConflict,
                    error: result.hasConflict ? "conflict detected" : undefined,
                });
                if (result.hasConflict) hasError = true;
            } catch (error) {
                hasError = true;
                const msg = error instanceof Error ? error.message : String(error);
                this.repoSyncStatus.set(repo.info.path, {
                    time: moment().format(DISPLAY_TIME_FORMAT),
                    success: false,
                    error: msg,
                });
                console.error(`SecondBrain: Error syncing ${repoName}:`, error);
                new Notice(`SecondBrain: Error syncing ${repoName}: ${msg}`);
            }
        }

        this.syncing = false;
        if (!hasError) {
            this.setStatus("synced");
            new Notice("SecondBrain: Sync complete");
        } else {
            this.setStatus("sync error");
        }
    }

    private async syncRepo(manager: IGitManager, repoName: string, repoPath: string): Promise<{ hasConflict: boolean }> {
        // Step 1: Stage and commit local changes
        this.setStatus(`${repoName}: committing...`);
        const commitMsg = this.formatCommitMessage();
        const changedCount = await manager.stageAndCommit(commitMsg);

        if (changedCount > 0) {
            this.setStatus(`${repoName}: committed ${changedCount}`);
        }

        // Step 2: Pull from remote
        this.setStatus(`${repoName}: pulling...`);
        const pullResult = await manager.pull();

        if (pullResult.conflictFiles.length > 0) {
            await this.handleConflicts(pullResult.conflictFiles, repoName, repoPath, manager);
            await manager.resolveConflicts(pullResult.conflictFiles);
            return { hasConflict: true };
        }

        // Step 3: Push to remote
        if (await manager.canPush()) {
            this.setStatus(`${repoName}: pushing...`);
            try {
                await manager.push();
            } catch (pushError) {
                const msg = pushError instanceof Error ? pushError.message : String(pushError);
                if (msg.includes("non-fast-forward") || msg.includes("rejected")) {
                    this.setStatus(`${repoName}: re-pulling...`);
                    const retryPull = await manager.pull();
                    if (retryPull.conflictFiles.length > 0) {
                        await this.handleConflicts(retryPull.conflictFiles, repoName, repoPath, manager);
                        await manager.resolveConflicts(retryPull.conflictFiles);
                        return { hasConflict: true };
                    }
                    await manager.push();
                } else {
                    throw pushError;
                }
            }
        }

        return { hasConflict: false };
    }

    /**
     * Conflict handling per plan section 4:
     * 1. Keep original file
     * 2. Create conflicted copy: `filename-YYYYMMDD-HHMMSS-conflicted-copy.md`
     * 3. Create/append to conflict log: `sync-conflict-YYYYMMDD-HHMMSS.md`
     */
    private async handleConflicts(conflictFiles: string[], repoName: string, repoPath: string, manager: IGitManager) {
        const vault = this.app.vault;
        const now = moment();
        const timestamp = now.format("YYYYMMDD-HHmmss");
        const logEntries: string[] = [];

        for (const filePath of conflictFiles) {
            try {
                // Save LOCAL version (what the user wrote) as the conflicted copy
                const content = await manager.getFileAtHead(filePath);

                // Build conflicted copy path (vault-relative)
                const vaultFilePath = repoPath ? repoPath + "/" + filePath : filePath;
                const dotIdx = vaultFilePath.lastIndexOf(".");
                const baseName = dotIdx > 0 ? vaultFilePath.slice(0, dotIdx) : vaultFilePath;
                const ext = dotIdx > 0 ? vaultFilePath.slice(dotIdx) : "";
                const copyPath = `${baseName}-${timestamp}-conflicted-copy${ext}`;

                await vault.adapter.write(copyPath, content);

                logEntries.push(`- Remote (accepted): [[${vaultFilePath}]]`);
                logEntries.push(`  Local (your edit): [[${copyPath}]]`);
            } catch (error) {
                console.error(`SecondBrain: Failed to create conflict copy for ${filePath}:`, error);
            }
        }

        if (logEntries.length > 0) {
            const logFileName = `sync-conflict-${timestamp}.md`;
            let logContent = `# Sync Conflict - ${repoName}\n`;
            logContent += `*${now.format(DISPLAY_TIME_FORMAT)}*\n\n`;
            logContent += logEntries.join("\n") + "\n";
            logContent += "\n---\n";
            logContent += "위 파일을 확인하여 하나만 남기고 나머지를 삭제한 뒤, 이 파일도 삭제해 주세요.\n";

            try {
                const existing = await vault.adapter.read(logFileName);
                await vault.adapter.write(logFileName, existing + "\n" + logContent);
            } catch {
                await vault.adapter.write(logFileName, logContent);
            }

            new Notice(
                `SecondBrain: ${conflictFiles.length} conflict(s) in ${repoName}. Check ${logFileName}`,
                10000
            );
            this.setStatus("conflict");
        }
    }

    private async openConflictLog() {
        // Find the most recent sync-conflict file
        const vault = this.app.vault;
        const rootList = await vault.adapter.list("");
        const conflictFiles = rootList.files
            .filter((f) => f.startsWith("sync-conflict-") && f.endsWith(".md"))
            .sort()
            .reverse();

        if (conflictFiles.length === 0) {
            new Notice("SecondBrain: No conflict logs found");
            return;
        }

        await this.app.workspace.openLinkText(conflictFiles[0], "", false);
    }

    private formatCommitMessage(): string {
        return this.settings.commitMessage.replace(
            "{{date}}",
            moment().format(this.settings.commitDateFormat)
        );
    }

    private setStatus(text: string) {
        if (this.statusBarEl) {
            this.statusBarEl.setText(text);
        }
    }

    private async openClaudeActions(file: TFile) {
        const actions = await this.loadPromptActions();
        if (actions.length === 0) {
            new Notice("SecondBrain: 프롬프트 폴더가 비어있습니다. 프롬프트 파일을 추가해주세요.");
            return;
        }
        new ActionModal(this.app, actions, async (action: ClaudeAction) => {
            const launchChat = async (inputValues: Record<string, string> = {}) => {
                const content = await this.app.vault.read(file);
                const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

                const systemPrompt = [
                    `You are an Obsidian knowledge assistant specialized in summarizing,`,
                    `structuring, and improving Markdown notes.`,
                    ``,
                    `# Environment`,
                    `You are operating inside an Obsidian vault that contains Markdown notes,`,
                    `knowledge documents, and personal research material.`,
                    ``,
                    `Currently open document:`,
                    `Path: ${file.path}`,
                    ``,
                    `Current time: ${moment().format("YYYY-MM-DD HH:mm:ss (ddd)")}`,
                    `User timezone: ${timezone}`,
                ].join("\n");

                let userPrompt = action.promptTemplate
                    .replace(/\{\{content\}\}/g, content)
                    .replace(/\{\{fileName\}\}/g, file.name);

                const unusedInputs: string[] = [];
                for (const [key, value] of Object.entries(inputValues)) {
                    const placeholder = `{{${key}}}`;
                    if (userPrompt.includes(placeholder)) {
                        userPrompt = userPrompt.split(placeholder).join(value);
                    } else if (value) {
                        const input = action.inputs.find((i) => i.name === key);
                        const label = input?.label || key;
                        unusedInputs.push(`${label}: ${value}`);
                    }
                }

                if (unusedInputs.length > 0) {
                    userPrompt += `\n\n---\n\n${unusedInputs.join("\n")}`;
                }

                const fullPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;

                const modal = new ClaudeChatModal(
                    this.app,
                    action.name,
                    this.settings.claudeModel,
                    fullPrompt,
                    file.name,
                    inputValues,
                );
                modal.open();
            };

            if (action.inputs.length > 0) {
                new InputModal(this.app, action.inputs, (values) => {
                    launchChat(values);
                }).open();
            } else {
                await launchChat();
            }
        }).open();
    }

    private async loadPromptActions(): Promise<ClaudeAction[]> {
        const folder = this.settings.claudePromptFolder;
        if (!folder) return [];

        const vault = this.app.vault;
        const folderExists = await vault.adapter.exists(folder);
        if (!folderExists) return [];

        const list = await vault.adapter.list(folder);
        const mdFiles = list.files.filter((f) => f.endsWith(".md"));
        const actions = await Promise.all(
            mdFiles.map(async (filePath) => {
                const raw = await vault.adapter.read(filePath);
                const name = filePath.slice(folder.length + 1, -3);
                const { frontmatter, body } = this.parseFrontmatter(raw);
                const inputs = this.parseInputs(frontmatter);
                const description = typeof frontmatter.description === "string" ? frontmatter.description : "";
                return { name, description, promptTemplate: body, inputs } as ClaudeAction;
            }),
        );
        return actions.sort((a, b) => a.name.localeCompare(b.name));
    }

    private parseFrontmatter(raw: string): { frontmatter: Record<string, unknown>; body: string } {
        const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
        if (!match) return { frontmatter: {}, body: raw };

        try {
            const frontmatter = parseYaml(match[1]) ?? {};
            return { frontmatter, body: match[2] };
        } catch {
            return { frontmatter: {}, body: raw };
        }
    }

    private parseInputs(frontmatter: Record<string, unknown>): PromptInput[] {
        const raw = frontmatter["inputs"];
        if (!Array.isArray(raw)) return [];

        return raw
            .filter((item): item is Record<string, string> => typeof item === "object" && item !== null && "name" in item)
            .map((item) => ({
                name: item.name,
                label: item.label || item.name,
                placeholder: item.placeholder || "",
                type: (item.type === "textarea" ? "textarea" : "text") as "text" | "textarea",
            }));
    }

}
