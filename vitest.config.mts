import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			obsidian: path.resolve("./tests/mocks/obsidian.ts"),
		},
	},
	test: {
		environment: "node",
		include: ["tests/**/*.spec.ts"],
	},
});
