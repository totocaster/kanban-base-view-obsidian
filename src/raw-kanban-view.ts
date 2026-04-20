import { parsePropertyId } from "obsidian";
import type { BasesView } from "obsidian";

type QueryControllerLike = {
	query?: {
		views?: unknown[];
	};
};

export type KanbanOrderingView = Pick<BasesView, "type" | "config"> & {
	queryController?: QueryControllerLike;
};

export function getCurrentGroupingKeyFromRawKanbanView(
	view: KanbanOrderingView,
): string | null {
	const rawView = getRawKanbanView(view);
	if (!isRecord(rawView) || !isRecord(rawView.groupBy)) {
		return null;
	}

	return normalizePropertyId(rawView.groupBy.property);
}

export function getRawKanbanView(
	view: KanbanOrderingView,
): Record<string, unknown> | null {
	const queryController = view.queryController;
	if (!isRecord(queryController) || !isRecord(queryController.query)) {
		return null;
	}

	const rawViews = queryController.query.views;
	if (!Array.isArray(rawViews)) {
		return null;
	}

	const viewName = view.config.name.trim();
	const matchingViews = rawViews.filter(
		(rawView): rawView is Record<string, unknown> =>
			isRecord(rawView) && rawView.type === view.type,
	);
	if (matchingViews.length === 0) {
		return null;
	}

	if (viewName.length > 0) {
		const namedView = matchingViews.find(
			(rawView) => rawView.name === viewName,
		);
		if (namedView) {
			return namedView;
		}
	}

	return matchingViews[0] ?? null;
}

function normalizePropertyId(property: unknown): string | null {
	if (typeof property !== "string") {
		return null;
	}

	const normalizedProperty = property.trim();
	if (normalizedProperty.length === 0) {
		return null;
	}

	return normalizedProperty.includes(".")
		? normalizedProperty
		: `note.${parsePropertyId(`note.${normalizedProperty}`).name}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
