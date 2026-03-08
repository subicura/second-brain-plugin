import { normalizePath, TFile } from "obsidian";
import type { DataAdapter, Vault } from "obsidian";

export class FsAdapter {
    promises: any = {};
    private adapter: DataAdapter;
    private vault: Vault;
    private index: ArrayBuffer | undefined;
    private indexctime: number | undefined;
    private indexmtime: number | undefined;

    constructor(vault: Vault, private readonly gitDir: string = ".git") {
        this.adapter = vault.adapter;
        this.vault = vault;

        this.promises.readFile = this.readFile.bind(this);
        this.promises.writeFile = this.writeFile.bind(this);
        this.promises.readdir = this.readdir.bind(this);
        this.promises.mkdir = this.mkdir.bind(this);
        this.promises.rmdir = this.rmdir.bind(this);
        this.promises.stat = this.stat.bind(this);
        this.promises.unlink = this.unlink.bind(this);
        this.promises.lstat = this.lstat.bind(this);
        this.promises.readlink = this.readlink.bind(this);
        this.promises.symlink = this.symlink.bind(this);
    }

    async readFile(path: string, opts: any) {
        if (opts == "utf8" || opts?.encoding == "utf8") {
            const file = this.vault.getAbstractFileByPath(path);
            if (file instanceof TFile) {
                return this.vault.read(file);
            }
            return this.adapter.read(path);
        }
        if (path.endsWith(this.gitDir + "/index")) {
            return this.index ?? this.adapter.readBinary(path);
        }
        const file = this.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) {
            return this.vault.readBinary(file);
        }
        return this.adapter.readBinary(path);
    }

    async writeFile(path: string, data: string | ArrayBuffer) {
        if (typeof data === "string") {
            const file = this.vault.getAbstractFileByPath(path);
            if (file instanceof TFile) {
                return this.vault.modify(file, data);
            }
            return this.adapter.write(path, data);
        }
        if (path.endsWith(this.gitDir + "/index")) {
            this.index = data;
            const now = Date.now();
            if (this.indexctime === undefined) this.indexctime = now;
            this.indexmtime = now;
        } else {
            const file = this.vault.getAbstractFileByPath(path);
            if (file instanceof TFile) {
                return this.vault.modifyBinary(file, data);
            }
            return this.adapter.writeBinary(path, data);
        }
    }

    async readdir(path: string) {
        if (path === ".") path = "/";
        const res = await this.adapter.list(path);
        const all = [...res.files, ...res.folders];
        if (path !== "/") {
            return all.map((e) => normalizePath(e.substring(path.length)));
        }
        return all;
    }

    async mkdir(path: string) {
        return this.adapter.mkdir(path);
    }

    async rmdir(path: string, opts: any) {
        return this.adapter.rmdir(path, opts?.options?.recursive ?? false);
    }

    async stat(path: string) {
        if (path.endsWith(this.gitDir + "/index")) {
            if (this.index !== undefined && this.indexctime != undefined && this.indexmtime != undefined) {
                return {
                    isFile: () => true,
                    isDirectory: () => false,
                    isSymbolicLink: () => false,
                    size: this.index.byteLength,
                    type: "file",
                    ctimeMs: this.indexctime,
                    mtimeMs: this.indexmtime,
                };
            }
            const stat = await this.adapter.stat(path);
            if (stat == undefined) {
                throw { code: "ENOENT" };
            }
            this.indexctime = stat.ctime;
            this.indexmtime = stat.mtime;
            return {
                ctimeMs: stat.ctime,
                mtimeMs: stat.mtime,
                size: stat.size,
                type: "file",
                isFile: () => true,
                isDirectory: () => false,
                isSymbolicLink: () => false,
            };
        }
        if (path === ".") path = "/";
        const file = this.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) {
            return {
                ctimeMs: file.stat.ctime,
                mtimeMs: file.stat.mtime,
                size: file.stat.size,
                type: "file",
                isFile: () => true,
                isDirectory: () => false,
                isSymbolicLink: () => false,
            };
        }
        const stat = await this.adapter.stat(path);
        if (stat) {
            return {
                ctimeMs: stat.ctime,
                mtimeMs: stat.mtime,
                size: stat.size,
                type: stat.type === "folder" ? "directory" : stat.type,
                isFile: () => stat.type === "file",
                isDirectory: () => stat.type === "folder",
                isSymbolicLink: () => false,
            };
        }
        throw { code: "ENOENT" };
    }

    async unlink(path: string) {
        return this.adapter.remove(path);
    }

    async lstat(path: string) {
        return this.stat(path);
    }

    async readlink(_path: string) {
        throw new Error("readlink is not implemented.");
    }

    async symlink(_path: string) {
        throw new Error("symlink is not implemented.");
    }

    async saveAndClear(): Promise<void> {
        if (this.index !== undefined) {
            await this.adapter.writeBinary(
                this.gitDir + "/index",
                this.index,
                { ctime: this.indexctime, mtime: this.indexmtime }
            );
        }
        this.index = undefined;
        this.indexctime = undefined;
        this.indexmtime = undefined;
    }
}
