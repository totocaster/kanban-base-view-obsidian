export type CardPreviewMode = "none" | "small" | "large";
export type VisibleCardPreviewMode = Exclude<CardPreviewMode, "none">;

const CARD_PREVIEW_CHARACTER_LIMITS: Record<VisibleCardPreviewMode, number> = {
	small: 180,
	large: 560,
};

export function normalizeCardPreviewMode(value: unknown): CardPreviewMode {
	return value === "small" || value === "large" ? value : "none";
}

export function createCardPreviewText(
	markdown: string,
	mode: VisibleCardPreviewMode,
	titleText = "",
): string | null {
	const previewText = normalizeMarkdownForPreview(markdown, titleText);
	if (previewText.length === 0) {
		return null;
	}

	return truncatePreviewText(previewText, CARD_PREVIEW_CHARACTER_LIMITS[mode]);
}

export function normalizeMarkdownForPreview(
	markdown: string,
	titleText = "",
): string {
	const withoutFrontmatter = stripYamlFrontmatter(markdown);
	const withoutHiddenContent = withoutFrontmatter
		.replace(/%%[\s\S]*?%%/g, " ")
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/~~~[\s\S]*?~~~/g, " ")
		.replace(/!\[\[[^\]]+\]\]/g, " ")
		.replace(/!\[[^\]]*\]\([^)]+\)/g, " ");
	const contentLines = withoutHiddenContent
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

	if (
		contentLines.length > 0 &&
		isDuplicateTitleHeading(contentLines[0] ?? "", titleText)
	) {
		contentLines.shift();
	}

	const lines = contentLines
		.map((line) => normalizeMarkdownLine(line))
		.filter((line) => line.length > 0);

	return lines.join(" ").replace(/\s+/g, " ").trim();
}

export function truncatePreviewText(text: string, characterLimit: number): string {
	const normalizedText = text.replace(/\s+/g, " ").trim();
	if (normalizedText.length <= characterLimit) {
		return normalizedText;
	}

	const truncatedText = normalizedText.slice(0, characterLimit).trimEnd();
	const sentenceCut = findLastSentenceBoundary(truncatedText);
	if (sentenceCut >= Math.floor(characterLimit * 0.55)) {
		return `${truncatedText.slice(0, sentenceCut).trim()}...`;
	}

	const wordCut = truncatedText.lastIndexOf(" ");
	if (wordCut >= Math.floor(characterLimit * 0.65)) {
		return `${truncatedText.slice(0, wordCut).trim()}...`;
	}

	return `${truncatedText.trim()}...`;
}

function stripYamlFrontmatter(markdown: string): string {
	const normalizedMarkdown = markdown.replace(/^\uFEFF/, "");
	const lines = normalizedMarkdown.split(/\r?\n/);
	if (lines[0]?.trim() !== "---") {
		return normalizedMarkdown;
	}

	for (let index = 1; index < lines.length; index += 1) {
		if (lines[index]?.trim() === "---") {
			return lines.slice(index + 1).join("\n");
		}
	}

	return normalizedMarkdown;
}

function normalizeMarkdownLine(line: string): string {
	return line
		.replace(/^#{1,6}\s+/, "")
		.replace(/^>\s?/, "")
		.replace(/^\s*[-*+]\s+\[[ xX]\]\s+/, "")
		.replace(/^\s*[-*+]\s+/, "")
		.replace(/^\s*\d+[.)]\s+/, "")
		.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
		.replace(/\[\[([^\]]+)\]\]/g, "$1")
		.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
		.replace(/`([^`]+)`/g, "$1")
		.replace(/\*\*([^*]+)\*\*/g, "$1")
		.replace(/\*([^*]+)\*/g, "$1")
		.replace(/__([^_]+)__/g, "$1")
		.replace(/_([^_]+)_/g, "$1")
		.replace(/~~([^~]+)~~/g, "$1")
		.trim();
}

function isDuplicateTitleHeading(line: string, titleText: string): boolean {
	const normalizedTitle = normalizeComparableText(titleText);
	if (normalizedTitle.length === 0) {
		return false;
	}

	const headingMatch = line.trim().match(/^#{1,6}\s+(.+)$/);
	if (!headingMatch) {
		return false;
	}

	return normalizeComparableText(headingMatch[1] ?? "") === normalizedTitle;
}

function normalizeComparableText(text: string): string {
	return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function findLastSentenceBoundary(text: string): number {
	return Math.max(text.lastIndexOf("."), text.lastIndexOf("!"), text.lastIndexOf("?"));
}
