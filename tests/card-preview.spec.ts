import { describe, expect, it } from "vitest";
import {
	createCardPreviewText,
	normalizeCardPreviewMode,
	normalizeMarkdownForPreview,
	truncatePreviewText,
} from "../src/card-preview";

describe("normalizeCardPreviewMode", () => {
	it("keeps valid preview modes", () => {
		expect(normalizeCardPreviewMode("none")).toBe("none");
		expect(normalizeCardPreviewMode("small")).toBe("small");
		expect(normalizeCardPreviewMode("large")).toBe("large");
	});

	it("falls back to none for invalid preview modes", () => {
		expect(normalizeCardPreviewMode("medium")).toBe("none");
		expect(normalizeCardPreviewMode(true)).toBe("none");
		expect(normalizeCardPreviewMode(undefined)).toBe("none");
	});
});

describe("normalizeMarkdownForPreview", () => {
	it("removes metadata and markdown noise while preserving readable note text", () => {
		const markdown = `---
status: Todo
priority: High
---
# Task alpha

Opening note for [[Projects/Kanban|the kanban project]] and [official docs](https://docs.obsidian.md).
- [ ] Ship the preview
![[screenshot.png]]
%% hidden implementation note %%
`;

		expect(normalizeMarkdownForPreview(markdown, "Task alpha")).toBe(
			"Opening note for the kanban project and official docs. Ship the preview",
		);
	});

	it("keeps a first non-heading line even when it matches the title", () => {
		expect(normalizeMarkdownForPreview("Task alpha\n\nFollow-up text.", "Task alpha")).toBe(
			"Task alpha Follow-up text.",
		);
	});

	it("returns empty text for metadata-only notes", () => {
		expect(
			normalizeMarkdownForPreview(`---
status: Todo
---

![[only-image.png]]
%% hidden %%
`),
		).toBe("");
	});
});

describe("createCardPreviewText", () => {
	it("returns null when there is no meaningful body content", () => {
		expect(
			createCardPreviewText(`---
status: Todo
---`, "small"),
		).toBeNull();
	});

	it("uses a shorter limit for small previews than large previews", () => {
		const markdown = [
			"One focused sentence gives the card useful context before the details continue.",
			"Additional note content explains the background, next action, tradeoffs, risks, owners, timing, and references for the task.",
			"The large preview can show more of this without letting the card grow without bound.",
		].join(" ");

		const smallPreview = createCardPreviewText(markdown, "small");
		const largePreview = createCardPreviewText(markdown, "large");

		expect(smallPreview).not.toBeNull();
		expect(largePreview).not.toBeNull();
		expect(smallPreview?.length).toBeLessThan(largePreview?.length ?? 0);
		expect(smallPreview?.endsWith("...")).toBe(true);
		expect(largePreview).toBe(markdown);
	});
});

describe("truncatePreviewText", () => {
	it("prefers sentence boundaries when enough context remains", () => {
		expect(
			truncatePreviewText(
				"Enough context appears in the first sentence. More details continue after the boundary.",
				64,
			),
		).toBe("Enough context appears in the first sentence...");
	});

	it("falls back to word boundaries when there is no useful sentence boundary", () => {
		expect(
			truncatePreviewText(
				"Preview text with several words and no punctuation before the character limit",
				38,
			),
		).toBe("Preview text with several words and...");
	});
});
