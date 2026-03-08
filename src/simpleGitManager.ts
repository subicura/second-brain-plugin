import type { FileSystemAdapter } from "obsidian";
import type { App } from "obsidian";
import * as path from "path";
import simpleGit from "simple-git";
import type { SimpleGit } from "simple-git";
import type { IGitManager, PullResult } from "./types";

export class SimpleGitManager implements IGitManager {
    private git: SimpleGit;

    constructor(
        app: App,
        repoSubPath: string
    ) {
        const adapter = app.vault.adapter as FileSystemAdapter;
        const vaultBasePath = adapter.getBasePath();
        const basePath = repoSubPath
            ? path.join(vaultBasePath, repoSubPath)
            : vaultBasePath;

        this.git = simpleGit({
            baseDir: basePath,
            config: [
                "core.quotepath=off",
                "core.sshCommand=ssh -o ConnectTimeout=10",
                "pull.rebase=false",
            ],
        });
    }

    setCredentials(_username: string | null, _password: string | null): void {
        // Desktop uses system git credentials - no-op
    }

    async stageAndCommit(message: string): Promise<number> {
        const status = await this.git.status();
        if (status.conflicted.length > 0) {
            // Leftover merge conflict from a previous failed sync — abort to restore clean state
            try { await this.git.merge(["--abort"]); } catch { /* not in merge state */ }
            return 0;
        }
        if (status.files.length === 0) return 0;
        await this.git.add("-A");
        await this.git.commit(message);
        return status.files.length;
    }

    async pull(): Promise<PullResult> {
        try {
            const result = await this.git.pull();
            // Check for conflicts even when pull doesn't throw
            const status = await this.git.status();
            if (status.conflicted.length > 0) {
                return { filesChanged: 0, conflictFiles: status.conflicted };
            }
            return { filesChanged: result.files.length, conflictFiles: [] };
        } catch {
            // Pull failed — check if it's a merge conflict via git status
            const status = await this.git.status();
            if (status.conflicted.length > 0) {
                return { filesChanged: 0, conflictFiles: status.conflicted };
            }
            throw new Error("git pull failed");
        }
    }

    async resolveConflicts(files: string[]): Promise<void> {
        for (const file of files) {
            await this.git.checkout(["--theirs", file]);
        }
        await this.git.add(files);
        await this.git.commit("auto-resolve: accept remote version");
    }

    async getFileAtHead(file: string): Promise<string> {
        return this.git.show(["HEAD:" + file]);
    }

    async push(): Promise<void> {
        await this.git.push();
    }

    async canPush(): Promise<boolean> {
        try {
            const status = await this.git.status();
            return status.ahead > 0;
        } catch {
            return false;
        }
    }
}
