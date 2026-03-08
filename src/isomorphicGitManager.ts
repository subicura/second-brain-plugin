import type {
    AuthCallback,
    AuthFailureCallback,
    GitHttpRequest,
    GitHttpResponse,
    HttpClient,
} from "isomorphic-git";
import git, { Errors } from "isomorphic-git";
import { Notice, requestUrl } from "obsidian";
import type { App } from "obsidian";
import { FsAdapter } from "./fsAdapter";
import type { FileStatusResult, IGitManager, PullResult } from "./types";

async function asyncIteratorToArrayBuffer(
    iter: AsyncIterableIterator<Uint8Array>
): Promise<ArrayBuffer> {
    const buffers: Uint8Array[] = [];
    for await (const chunk of iter) {
        buffers.push(chunk);
    }
    const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const buf of buffers) {
        result.set(buf, offset);
        offset += buf.length;
    }
    return result.buffer;
}

async function* arrayBufferToAsyncIterator(
    buf: ArrayBuffer
): AsyncGenerator<Uint8Array> {
    yield new Uint8Array(buf);
}

export class IsomorphicGitManager implements IGitManager {
    private fs: FsAdapter;
    private dir: string;
    private username: string | null = null;
    private password: string | null = null;

    constructor(
        private readonly app: App,
        dir: string
    ) {
        this.dir = dir;
        const gitDir = dir ? dir + "/.git" : ".git";
        this.fs = new FsAdapter(app.vault, gitDir);
    }

    setCredentials(username: string | null, password: string | null) {
        this.username = username;
        this.password = password;
    }

    private getRepo(): {
        fs: FsAdapter;
        dir: string;
        onAuth: AuthCallback;
        onAuthFailure: AuthFailureCallback;
        http: HttpClient;
    } {
        return {
            fs: this.fs,
            dir: this.dir,
            onAuth: () => ({
                username: this.username ?? undefined,
                password: this.password ?? undefined,
            }),
            onAuthFailure: () => {
                new Notice("SecondBrain: Authentication failed. Check your credentials in settings.");
                return { cancel: true };
            },
            http: {
                async request({
                    url,
                    method,
                    headers,
                    body,
                }: GitHttpRequest): Promise<GitHttpResponse> {
                    let collectedBody: ArrayBuffer | undefined;
                    if (body) {
                        collectedBody = await asyncIteratorToArrayBuffer(body);
                    }
                    const res = await requestUrl({
                        url,
                        method,
                        headers,
                        body: collectedBody,
                        throw: false,
                    });
                    return {
                        url,
                        method,
                        headers: res.headers,
                        body: arrayBufferToAsyncIterator(res.arrayBuffer),
                        statusCode: res.status,
                        statusMessage: res.status.toString(),
                    };
                },
            },
        };
    }

    private async wrapFS<T>(call: Promise<T>): Promise<T> {
        try {
            return await call;
        } finally {
            await this.fs.saveAndClear();
        }
    }

    async stageAndCommit(message: string): Promise<number> {
        const changedFiles = await this.getChangedFiles();
        if (changedFiles.length === 0) return 0;

        const repo = this.getRepo();
        try {
            for (const file of changedFiles) {
                if (file.status === "deleted") {
                    await git.remove({ ...repo, filepath: file.path });
                } else {
                    await git.add({ ...repo, filepath: file.path });
                }
            }
        } finally {
            await this.fs.saveAndClear();
        }

        await this.wrapFS(
            git.commit({ ...repo, message })
        );
        return changedFiles.length;
    }

    async pull(): Promise<PullResult> {
        const localCommit = await this.resolveRef("HEAD");
        const branchInfo = await this.branchInfo();

        await this.wrapFS(
            git.fetch({ ...this.getRepo(), remote: branchInfo.remote })
        );

        if (!branchInfo.tracking) {
            return { filesChanged: 0, conflictFiles: [] };
        }

        try {
            const mergeRes = await this.wrapFS(
                git.merge({
                    ...this.getRepo(),
                    ours: branchInfo.current,
                    theirs: branchInfo.tracking,
                    abortOnConflict: false,
                })
            );
            if (!mergeRes.alreadyMerged) {
                await this.wrapFS(
                    git.checkout({
                        ...this.getRepo(),
                        ref: branchInfo.current,
                        remote: branchInfo.remote,
                    })
                );
            }
            const upstreamCommit = await this.resolveRef("HEAD");
            if (localCommit === upstreamCommit) {
                return { filesChanged: 0, conflictFiles: [] };
            }
            return { filesChanged: 1, conflictFiles: [] };
        } catch (error) {
            if (error instanceof Errors.MergeConflictError) {
                return { filesChanged: 0, conflictFiles: error.data.filepaths ?? [] };
            }
            throw error;
        }
    }

    async push(): Promise<void> {
        const { remote } = await this.branchInfo();
        await this.wrapFS(
            git.push({ ...this.getRepo(), remote })
        );
    }

    async resolveConflicts(_files: string[]): Promise<void> {
        // isomorphic-git merge with abortOnConflict throws before writing — no cleanup needed
    }

    async getFileAtHead(file: string): Promise<string> {
        const filepath = this.dir ? this.dir + "/" + file : file;
        return this.app.vault.adapter.read(filepath);
    }

    async canPush(): Promise<boolean> {
        try {
            const info = await this.branchInfo();
            if (!info.current || !info.tracking) return false;
            const current = await this.resolveRef(info.current);
            const tracking = await this.resolveRef(info.tracking);
            return current !== tracking;
        } catch {
            return false;
        }
    }

    private async getChangedFiles(): Promise<FileStatusResult[]> {
        const matrix = await this.wrapFS(
            git.statusMatrix({ ...this.getRepo() })
        );
        const results: FileStatusResult[] = [];
        for (const row of matrix) {
            const filepath = row[0] as string;
            const head = row[1] as number;
            const workdir = row[2] as number;
            const stage = row[3] as number;
            if (head === 1 && workdir === 1 && stage === 1) continue;
            let status: FileStatusResult["status"] = "modified";
            if (head === 0 && workdir === 2) status = "added";
            else if (head === 1 && workdir === 0) status = "deleted";
            results.push({ path: filepath, status });
        }
        return results;
    }

    private async branchInfo(): Promise<{
        current: string;
        tracking: string | undefined;
        remote: string;
    }> {
        const current = (await git.currentBranch(this.getRepo())) || "main";
        const remote =
            (await this.getConfig(`branch.${current}.remote`)) ?? "origin";
        const mergeRef = await this.getConfig(`branch.${current}.merge`);
        const trackingBranch = mergeRef?.replace("refs/heads/", "");
        const tracking = trackingBranch
            ? remote + "/" + trackingBranch
            : undefined;
        return { current, tracking, remote };
    }

    private async getConfig(path: string): Promise<string | undefined> {
        try {
            const value = await this.wrapFS(
                git.getConfig({ ...this.getRepo(), path }) as Promise<string>
            );
            return value || undefined;
        } catch {
            return undefined;
        }
    }

    private resolveRef(ref: string): Promise<string> {
        return this.wrapFS(git.resolveRef({ ...this.getRepo(), ref }));
    }
}
