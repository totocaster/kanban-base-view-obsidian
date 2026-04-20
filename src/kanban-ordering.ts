import type { BasesEntry, BasesEntryGroup, BasesViewConfig } from "obsidian";
import {
	getCurrentGroupingKeyFromRawKanbanView,
	type KanbanOrderingView,
} from "./raw-kanban-view";

export const KANBAN_STATE_KEY = "kanbanState";
export const KANBAN_NULL_COLUMN_ID = "__kanban_null__";
export const KANBAN_EMPTY_COLUMN_ID = "__kanban_empty__";

type KanbanStateReader = Pick<BasesViewConfig, "get">;
type KanbanStateWriter = Pick<BasesViewConfig, "get" | "set">;

export type KanbanState = {
	columnOrders: Record<string, string[]>;
	cardOrders: Record<string, Record<string, string[]>>;
};

export function getGroupColumnId(
	group: Pick<BasesEntryGroup, "key" | "hasKey">,
): string {
	if (!group.hasKey()) {
		return KANBAN_NULL_COLUMN_ID;
	}

	const trimmedValue = group.key?.toString().trim() ?? "";
	if (trimmedValue.length === 0) {
		return KANBAN_EMPTY_COLUMN_ID;
	}

	return trimmedValue;
}

export function getCurrentGroupingKey(
	view: KanbanOrderingView,
): string | null {
	return getCurrentGroupingKeyFromRawKanbanView(view);
}

export function readKanbanState(config: KanbanStateReader): KanbanState {
	const rawValue = config.get(KANBAN_STATE_KEY);
	if (!isRecord(rawValue)) {
		return createEmptyKanbanState();
	}

	return {
		columnOrders: readColumnOrders(rawValue.columnOrders),
		cardOrders: readCardOrders(rawValue.cardOrders),
	};
}

export function writeColumnOrder(
	config: KanbanStateWriter,
	groupingKey: string,
	columnOrder: string[],
): boolean {
	const normalizedGroupingKey = groupingKey.trim();
	if (normalizedGroupingKey.length === 0) {
		return false;
	}

	const nextColumnOrder = getUniqueStrings(columnOrder);
	const state = readKanbanState(config);
	const currentColumnOrder = state.columnOrders[normalizedGroupingKey] ?? [];
	if (hasSameItems(currentColumnOrder, nextColumnOrder)) {
		return false;
	}

	const rawStateValue = config.get(KANBAN_STATE_KEY);
	const rawState = isRecord(rawStateValue) ? rawStateValue : {};
	const nextColumnOrders = { ...state.columnOrders };
	if (nextColumnOrder.length === 0) {
		delete nextColumnOrders[normalizedGroupingKey];
	} else {
		nextColumnOrders[normalizedGroupingKey] = nextColumnOrder;
	}

	config.set(KANBAN_STATE_KEY, {
		...rawState,
		columnOrders: nextColumnOrders,
	});
	return true;
}

export function writeCurrentColumnOrder(
	view: KanbanOrderingView,
	columnOrder: string[],
): boolean {
	const groupingKey = getCurrentGroupingKey(view);
	if (groupingKey === null) {
		return false;
	}

	return writeColumnOrder(view.config, groupingKey, columnOrder);
}

export function getOrderedGroupsForCurrentGrouping(
	view: KanbanOrderingView,
	groups: BasesEntryGroup[],
): BasesEntryGroup[] {
	const groupingKey = getCurrentGroupingKey(view);
	if (groupingKey === null) {
		return groups;
	}

	const savedOrder = readKanbanState(view.config).columnOrders[groupingKey];
	if (!savedOrder || savedOrder.length === 0) {
		return groups;
	}

	const remainingGroups = new Map(
		groups.map((group) => [getGroupColumnId(group), group]),
	);
	const orderedGroups: BasesEntryGroup[] = [];

	for (const columnId of savedOrder) {
		const group = remainingGroups.get(columnId);
		if (!group) {
			continue;
		}

		orderedGroups.push(group);
		remainingGroups.delete(columnId);
	}

	orderedGroups.push(...remainingGroups.values());
	return orderedGroups;
}

export function getCardId(entry: Pick<BasesEntry, "file">): string {
	return entry.file.path.trim();
}

export function getCardOrderForGroup(
	view: KanbanOrderingView,
	group: BasesEntryGroup,
): string[] {
	const groupingKey = getCurrentGroupingKey(view);
	if (groupingKey === null) {
		return getLiveCardOrder(group.entries);
	}

	const state = readKanbanState(view.config);
	if (!hasManualCardOrderForGrouping(state, groupingKey)) {
		return getLiveCardOrder(group.entries);
	}

	return (
		state.cardOrders[groupingKey]?.[getGroupColumnId(group)] ??
		getLiveCardOrder(group.entries)
	);
}

export function getOrderedEntriesForGroup(
	view: KanbanOrderingView,
	group: BasesEntryGroup,
): BasesEntry[] {
	const remainingEntries = new Map(
		group.entries.map((entry) => [getCardId(entry), entry]),
	);
	const orderedEntries: BasesEntry[] = [];

	for (const cardId of getCardOrderForGroup(view, group)) {
		const entry = remainingEntries.get(cardId);
		if (!entry) {
			continue;
		}

		orderedEntries.push(entry);
		remainingEntries.delete(cardId);
	}

	orderedEntries.push(...remainingEntries.values());
	return orderedEntries;
}

export function writeCurrentCardOrder(
	view: KanbanOrderingView,
	groups: BasesEntryGroup[],
	columnId: string,
	cardOrder: string[],
): boolean {
	const groupingKey = getCurrentGroupingKey(view);
	if (groupingKey === null) {
		return false;
	}

	const state = readKanbanState(view.config);
	const currentBoardCardOrders = hasManualCardOrderForGrouping(state, groupingKey)
		? (state.cardOrders[groupingKey] ?? {})
		: {};
	const nextCardOrder = getUniqueStrings(cardOrder);
	const currentCardOrder =
		currentBoardCardOrders[columnId] ??
		getLiveCardOrderForColumn(groups, columnId);
	if (hasSameItems(currentCardOrder, nextCardOrder)) {
		return false;
	}

	const rawStateValue = view.config.get(KANBAN_STATE_KEY);
	const rawState = isRecord(rawStateValue) ? rawStateValue : {};
	const nextBoardCardOrders = { ...currentBoardCardOrders };

	for (const group of groups) {
		const visibleColumnId = getGroupColumnId(group);
		if (!(visibleColumnId in nextBoardCardOrders)) {
			const liveCardOrder = getLiveCardOrder(group.entries);
			if (liveCardOrder.length > 0) {
				nextBoardCardOrders[visibleColumnId] = liveCardOrder;
			}
		}
	}

	if (nextCardOrder.length === 0) {
		delete nextBoardCardOrders[columnId];
	} else {
		nextBoardCardOrders[columnId] = nextCardOrder;
	}

	const nextCardOrders = { ...state.cardOrders };
	if (Object.keys(nextBoardCardOrders).length === 0) {
		delete nextCardOrders[groupingKey];
	} else {
		nextCardOrders[groupingKey] = nextBoardCardOrders;
	}

	const nextState: Record<string, unknown> = {
		...rawState,
	};
	if (Object.keys(nextCardOrders).length === 0) {
		delete nextState.cardOrders;
	} else {
		nextState.cardOrders = nextCardOrders;
	};

	view.config.set(KANBAN_STATE_KEY, nextState);
	return true;
}

export function clearCardOrders(config: KanbanStateWriter): boolean {
	const state = readKanbanState(config);
	if (Object.keys(state.cardOrders).length === 0) {
		return false;
	}

	const rawStateValue = config.get(KANBAN_STATE_KEY);
	const rawState = isRecord(rawStateValue) ? rawStateValue : {};
	const nextState: Record<string, unknown> = {
		...rawState,
	};
	delete nextState.cardOrders;

	config.set(KANBAN_STATE_KEY, nextState);
	return true;
}

export function moveColumnToIndex(
	columnOrder: string[],
	columnId: string,
	targetIndex: number,
): string[] {
	const sourceIndex = columnOrder.indexOf(columnId);
	if (sourceIndex === -1) {
		return [...columnOrder];
	}

	const remainingColumnIds = columnOrder.filter(
		(currentColumnId) => currentColumnId !== columnId,
	);
	const insertionIndex = Math.max(
		0,
		Math.min(targetIndex, remainingColumnIds.length),
	);

	return [
		...remainingColumnIds.slice(0, insertionIndex),
		columnId,
		...remainingColumnIds.slice(insertionIndex),
	];
}

export function moveColumnByOffset(
	columnOrder: string[],
	columnId: string,
	offset: number,
): string[] {
	const sourceIndex = columnOrder.indexOf(columnId);
	if (sourceIndex === -1 || offset === 0) {
		return [...columnOrder];
	}

	return moveColumnToIndex(columnOrder, columnId, sourceIndex + offset);
}

export function moveCardToIndex(
	cardOrder: string[],
	cardId: string,
	targetIndex: number,
): string[] {
	return moveColumnToIndex(cardOrder, cardId, targetIndex);
}

export function moveCardToBoundary(
	cardOrder: string[],
	cardId: string,
	boundary: "start" | "end",
): string[] {
	return moveCardToIndex(
		cardOrder,
		cardId,
		boundary === "start" ? 0 : Math.max(cardOrder.length - 1, 0),
	);
}

function createEmptyKanbanState(): KanbanState {
	return {
		columnOrders: {},
		cardOrders: {},
	};
}

function hasManualCardOrderForGrouping(
	state: KanbanState,
	groupingKey: string,
): boolean {
	const currentCardOrders = state.cardOrders[groupingKey];
	return !!currentCardOrders && Object.keys(currentCardOrders).length > 0;
}

export function getCurrentSortKey(config: Pick<BasesViewConfig, "getSort">): string {
	const sorts = config.getSort();
	if (!Array.isArray(sorts) || sorts.length === 0) {
		return "";
	}

	const sortKey = sorts
		.map((sort) => {
			const property =
				typeof sort.property === "string" ? sort.property.trim() : "";
			const direction =
				typeof sort.direction === "string" ? sort.direction.trim() : "";
			return `${property}:${direction}`;
		})
		.filter((sortKey) => sortKey !== ":")
		.join("|");

	return sortKey;
}

function getLiveCardOrder(entries: BasesEntry[]): string[] {
	return getUniqueStrings(entries.map((entry) => getCardId(entry)));
}

function getLiveCardOrderForColumn(
	groups: BasesEntryGroup[],
	columnId: string,
): string[] {
	const group = groups.find(
		(currentGroup) => getGroupColumnId(currentGroup) === columnId,
	);
	if (!group) {
		return [];
	}

	return getLiveCardOrder(group.entries);
}

function readColumnOrders(value: unknown): Record<string, string[]> {
	if (!isRecord(value)) {
		return {};
	}

	return Object.fromEntries(
		Object.entries(value).flatMap(([groupingKey, columnOrder]) => {
			const normalizedGroupingKey = groupingKey.trim();
			if (normalizedGroupingKey.length === 0 || !Array.isArray(columnOrder)) {
				return [];
			}

			return [[normalizedGroupingKey, getUniqueStrings(columnOrder)]];
		}),
	);
}

function readCardOrders(
	value: unknown,
): Record<string, Record<string, string[]>> {
	if (!isRecord(value)) {
		return {};
	}

	return Object.fromEntries(
		Object.entries(value).flatMap(([groupingKey, groupedCardOrders]) => {
			const normalizedGroupingKey = groupingKey.trim();
			if (
				normalizedGroupingKey.length === 0 ||
				!isRecord(groupedCardOrders)
			) {
				return [];
			}

			const normalizedCardOrders = Object.fromEntries(
				Object.entries(groupedCardOrders).flatMap(([columnId, cardOrder]) => {
					const normalizedColumnId = columnId.trim();
					if (normalizedColumnId.length === 0 || !Array.isArray(cardOrder)) {
						return [];
					}

					return [[normalizedColumnId, getUniqueStrings(cardOrder)]];
				}),
			);
			return [[normalizedGroupingKey, normalizedCardOrders]];
		}),
	);
}

function getUniqueStrings(items: unknown[]): string[] {
	const seenItems = new Set<string>();
	const uniqueItems: string[] = [];

	for (const item of items) {
		if (typeof item !== "string") {
			continue;
		}

		const normalizedItem = item.trim();
		if (normalizedItem.length === 0 || seenItems.has(normalizedItem)) {
			continue;
		}

		seenItems.add(normalizedItem);
		uniqueItems.push(normalizedItem);
	}

	return uniqueItems;
}

function hasSameItems(left: string[], right: string[]): boolean {
	if (left.length !== right.length) {
		return false;
	}

	return left.every((item, index) => item === right[index]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
