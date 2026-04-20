import esbuild from "esbuild";
import process from "process";
import { copyFileSync, existsSync, mkdirSync, watch } from "node:fs";
import { builtinModules } from "node:module";
import path from "node:path";

const prod = process.argv[2] === "production";
const projectRoot = process.cwd();
const outputDir = path.resolve(process.env.OBSIDIAN_PLUGIN_DIR ?? projectRoot);
const staticAssets = ["manifest.json", "styles.css", ".hotreload"];

function ensureOutputDir() {
	mkdirSync(outputDir, { recursive: true });
}

function copyStaticAsset(fileName) {
	const sourcePath = path.join(projectRoot, fileName);
	if (!existsSync(sourcePath)) {
		return;
	}

	copyFileSync(sourcePath, path.join(outputDir, fileName));
}

function syncStaticAssets() {
	ensureOutputDir();
	for (const fileName of staticAssets) {
		copyStaticAsset(fileName);
	}
}

function watchStaticAssets() {
	if (prod || outputDir === projectRoot) {
		return;
	}

	for (const fileName of staticAssets) {
		const sourcePath = path.join(projectRoot, fileName);
		if (!existsSync(sourcePath)) {
			continue;
		}

		watch(sourcePath, () => {
			copyStaticAsset(fileName);
		});
	}
}

syncStaticAssets();

const context = await esbuild.context({
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
		...builtinModules,
	],
	format: "cjs",
	target: "es2018",
	logLevel: "info",
	sourcemap: prod ? false : "inline",
	treeShaking: true,
	outfile: path.join(outputDir, "main.js"),
	minify: prod,
});

if (prod) {
	await context.rebuild();
	process.exit(0);
}

await context.watch();
watchStaticAssets();
