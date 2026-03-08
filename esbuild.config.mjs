import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";

const prod = process.argv[2] === "production";

const context = await esbuild.context({
    entryPoints: ["src/main.ts"],
    bundle: true,
    external: [
        "obsidian",
        "electron",
        "moment",
        ...builtins,
        ...builtins.map((m) => `node:${m}`),
    ],
    format: "cjs",
    target: "es2018",
    logLevel: "info",
    sourcemap: prod ? false : "inline",
    treeShaking: true,
    platform: "browser",
    minify: prod,
    inject: ["polyfill_buffer.js"],
    outfile: "dist/main.js",
});

if (prod) {
    await context.rebuild();
    process.exit(0);
} else {
    await context.watch();
}
