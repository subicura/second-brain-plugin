#!/usr/bin/env node

import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";

const bump = process.argv[2];
if (!["patch", "minor", "major"].includes(bump)) {
    console.error("Usage: npm run release <patch|minor|major>");
    process.exit(1);
}

// Read current version
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const [major, minor, patch] = pkg.version.split(".").map(Number);

const next =
    bump === "major"
        ? `${major + 1}.0.0`
        : bump === "minor"
          ? `${major}.${minor + 1}.0`
          : `${major}.${minor}.${patch + 1}`;

// Update package.json
pkg.version = next;
writeFileSync("package.json", JSON.stringify(pkg, null, 4) + "\n");

// Update manifest.json
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
manifest.version = next;
writeFileSync("manifest.json", JSON.stringify(manifest, null, 4) + "\n");

// Git commit, tag, push
execSync(`git add package.json manifest.json`, { stdio: "inherit" });
execSync(`git commit -m "release: v${next}"`, { stdio: "inherit" });
execSync(`git tag ${next}`, { stdio: "inherit" });
execSync(`git push && git push origin ${next}`, { stdio: "inherit" });

console.log(`\nReleased v${next}`);
