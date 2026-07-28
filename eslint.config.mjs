import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
	{
		ignores: [
			"coverage",
			"esbuild.config.mjs",
			"eslint.config.mjs",
			"main.js",
			"node_modules",
			"versions.json",
		],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ["**/*.{ts,mts}"],
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: [
						"tests/*.spec.ts",
						"tests/mocks/*.ts",
						"vitest.config.mts",
					],
				},
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		files: ["tests/**/*.ts"],
		rules: {
			"@typescript-eslint/no-unsafe-assignment": "off",
		},
	},
	{
		files: ["vitest.config.mts"],
		rules: {
			"obsidianmd/no-nodejs-modules": "off",
		},
	},
);
