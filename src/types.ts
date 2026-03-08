export type ClaudeModel = "sonnet" | "opus";

export interface SecondBrainSettings {
    autoSyncInterval: number; // minutes, 0 = disabled
    commitMessage: string;
    commitDateFormat: string;
    disabledRepos: string[]; // paths of repos excluded from sync
    claudeEnabled: boolean;
    claudeModel: ClaudeModel;
    claudePromptFolder: string;
}

export const DEFAULT_SETTINGS: SecondBrainSettings = {
    autoSyncInterval: 5,
    commitMessage: "vault backup: {{date}}",
    commitDateFormat: "YYYY-MM-DD HH:mm:ss",
    disabledRepos: [],
    claudeEnabled: false,
    claudeModel: "sonnet",
    claudePromptFolder: "IO_SecondBrain/프롬프트",
};

export interface RepoInfo {
    path: string; // relative path from vault root ("" for root, "ProjectA" for sub)
    name: string; // display name
}

export interface FileStatusResult {
    path: string;
    status: "modified" | "added" | "deleted";
}

export interface PullResult {
    filesChanged: number;
    conflictFiles: string[]; // paths of conflicted files (empty = no conflict)
}

export interface RepoSyncStatus {
    time: string; // formatted timestamp
    success: boolean;
    error?: string;
}

export interface IGitManager {
    stageAndCommit(message: string): Promise<number>;
    pull(): Promise<PullResult>;
    push(): Promise<void>;
    canPush(): Promise<boolean>;
    resolveConflicts(files: string[]): Promise<void>;
    getFileAtHead(file: string): Promise<string>;
    setCredentials(username: string | null, password: string | null): void;
}
