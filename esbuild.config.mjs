import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";
import { copyFileSync, mkdirSync, existsSync } from "fs";

const prod = process.argv[2] === "production";

// Obsidian vault plugin directory for local development
const OBSIDIAN_PLUGIN_DIR = "E:/Obsidian/Personal Vault/.obsidian/plugins/kibo-tasks";

esbuild
  .build({
    entryPoints: ["src/main.ts"],
    bundle: true,
    external: [
      "obsidian",
      "electron",
      "@codemirror/autocomplete",
      "@codemirror/collab",
      "@codemirror/commands",
      "@codemirror/language",
      "@codemirror/lint",
      "@codemirror/search",
      "@codemirror/state",
      "@codemirror/view",
      "@lezer/common",
      "@lezer/highlight",
      "@lezer/lr",
      ...builtins,
    ],
    format: "cjs",
    target: "es2018",
    logLevel: "info",
    sourcemap: prod ? false : "inline",
    treeShaking: true,
    outfile: "main.js",
    minify: prod,
  })
  .then(() => {
    if (!prod && existsSync(OBSIDIAN_PLUGIN_DIR)) {
      copyFileSync("main.js", `${OBSIDIAN_PLUGIN_DIR}/main.js`);
      copyFileSync("styles.css", `${OBSIDIAN_PLUGIN_DIR}/styles.css`);
      copyFileSync("manifest.json", `${OBSIDIAN_PLUGIN_DIR}/manifest.json`);
      console.log(`Copied to ${OBSIDIAN_PLUGIN_DIR}`);
    }
  })
  .catch(() => process.exit(1));
