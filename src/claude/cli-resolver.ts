import * as fs from "fs";
import * as os from "os";
import * as path from "path";

function isExistingFile(filePath: string): boolean {
    try {
        return fs.statSync(filePath).isFile();
    } catch {
        return false;
    }
}

let cachedCLIPath: string | null | undefined;

export function findClaudeCLIPath(): string | null {
    if (cachedCLIPath !== undefined) return cachedCLIPath;

    const homeDir = os.homedir();

    const commonPaths = [
        path.join(homeDir, ".claude", "local", "claude"),
        path.join(homeDir, ".local", "bin", "claude"),
        path.join(homeDir, ".volta", "bin", "claude"),
        path.join(homeDir, ".asdf", "shims", "claude"),
        path.join(homeDir, ".asdf", "bin", "claude"),
        "/usr/local/bin/claude",
        "/opt/homebrew/bin/claude",
        path.join(homeDir, "bin", "claude"),
        path.join(homeDir, ".npm-global", "bin", "claude"),
        path.join(homeDir, ".npm-global", "lib", "node_modules", "@anthropic-ai", "claude-code", "cli.js"),
        "/usr/local/lib/node_modules/@anthropic-ai/claude-code/cli.js",
        "/usr/lib/node_modules/@anthropic-ai/claude-code/cli.js",
    ];

    for (const p of commonPaths) {
        if (isExistingFile(p)) {
            cachedCLIPath = p;
            return p;
        }
    }

    const envPath = process.env.PATH || "";
    const dirs = envPath.split(":").filter(Boolean);
    for (const dir of dirs) {
        const candidate = path.join(dir, "claude");
        if (isExistingFile(candidate)) {
            cachedCLIPath = candidate;
            return candidate;
        }
    }

    cachedCLIPath = null;
    return null;
}

export function getEnhancedPath(cliPath?: string): string {
    const homeDir = os.homedir();
    const seen = new Set<string>();
    const segments: string[] = [];

    const add = (p: string) => {
        if (!seen.has(p)) {
            seen.add(p);
            segments.push(p);
        }
    };

    if (cliPath) {
        add(path.dirname(cliPath));
    }

    const extraPaths = [
        path.join(homeDir, ".asdf", "shims"),
        path.join(homeDir, ".volta", "bin"),
        path.join(homeDir, ".local", "bin"),
        path.join(homeDir, ".npm-global", "bin"),
        path.join(homeDir, ".nvm", "current", "bin"),
        "/usr/local/bin",
        "/opt/homebrew/bin",
        path.join(homeDir, "bin"),
    ];

    for (const p of extraPaths) add(p);

    const currentPath = process.env.PATH || "";
    for (const p of currentPath.split(":").filter(Boolean)) add(p);

    return segments.join(":");
}
