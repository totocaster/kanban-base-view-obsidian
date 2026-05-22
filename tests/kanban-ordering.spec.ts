import { NullValue } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import {
	clearCardOrders,
	KANBAN_EMPTY_COLUMN_ID,
	KANBAN_NULL_COLUMN_ID,
	KANBAN_STATE_KEY,
	getCardId,
	getCardOrderForGroup,
	getCurrentSortKey,
	getCurrentGroupingKey,
	getGroupColumnId,
	getOrderedEntriesForGroup,
	getOrderedGroupsForCurrentGrouping,
	moveCardBetweenColumns,
	moveCardToBoundary,
	moveCardToIndex,
	moveCardToVisibleIndex,
	moveColumnByOffset,
	moveColumnToIndex,
	readKanbanState,
	writeColumnOrder,
	writeCurrentCardOrder,
	writeCurrentCardOrders,
	writeCurrentColumnOrder,
} from "../src/kanban-ordering";

function createKanbanViewStore(options?: {
	groupByProperty?: string | null;
	kanbanState?: unknown;
	name?: string;
	sort?: Array<{ property: string; direction: string }>;
}) {
	const {
		groupByProperty = "note.status",
		kanbanState,
		name = "My Kanban",
		sort = [{ property: "file.basename", direction: "ASC" }],
	} = options ?? {};
	let currentKanbanState = kanbanState;

	return {
		view: {
			type: "kanban",
			config: {
				name,
				get: (key: string) =>
					key === KANBAN_STATE_KEY ? currentKanbanState : undefined,
				getSort: () => sort,
				set: vi.fn((key: string, value: unknown) => {
					if (key === KANBAN_STATE_KEY) {
						currentKanbanState = value;
					}
				}),
			},
			queryController: {
				query: {
					views: [
						{
							type: "kanban",
							name,
							groupBy:
								groupByProperty === null
									? undefined
									: { property: groupByProperty, direction: "ASC" },
						},
					],
				},
			},
		},
		readState: () => currentKanbanState,
	};
}

function createEntry(path: string) {
	return {
		file: {
			path,
			basename: path.split("/").at(-1)?.replace(/\.md$/, "") ?? path,
		},
	};
}

function createGroup(name: string | null, entries: ReturnType<typeof createEntry>[]) {
	return {
		key:
			name === null
				? new NullValue()
				: {
						toString: () => name,
					},
		hasKey: () => name !== null,
		entries,
	};
}

describe("getGroupColumnId", () => {
	it("uses a placeholder for the null column", () => {
		expect(getGroupColumnId({ key: new NullValue(), hasKey: () => false })).toBe(
			KANBAN_NULL_COLUMN_ID,
		);
	});

	it("uses a separate placeholder for empty-string group keys", () => {
		expect(
			getGroupColumnId({
				key: { toString: () => "   " },
				hasKey: () => true,
			}),
		).toBe(KANBAN_EMPTY_COLUMN_ID);
	});

	it("uses the trimmed column name when a group has a concrete key", () => {
		expect(
			getGroupColumnId({
				key: { toString: () => "  In progress  " },
				hasKey: () => true,
			}),
		).toBe("In progress");
	});
});

describe("getCurrentGroupingKey", () => {
	it("reads the active grouping property from the raw kanban view state", () => {
		const store = createKanbanViewStore({ groupByProperty: "note.status" });

		expect(getCurrentGroupingKey(store.view)).toBe("note.status");
	});

	it("normalizes shorthand raw grouping properties to note.* ids", () => {
		const store = createKanbanViewStore({ groupByProperty: "status" });

		expect(getCurrentGroupingKey(store.view)).toBe("note.status");
	});

	it("returns null when no valid groupBy property exists", () => {
		expect(getCurrentGroupingKey(createKanbanViewStore({
			groupByProperty: null,
		}).view)).toBeNull();
	});
});

describe("readKanbanState", () => {
	it("defaults to empty sibling maps when the config has no saved state", () => {
		expect(readKanbanState({ get: () => undefined })).toEqual({
			columnOrders: {},
			cardOrders: {},
		});
	});

	it("keeps columnOrders and cardOrders as separate normalized maps", () => {
		expect(
			readKanbanState({
				get: () => ({
					columnOrders: {
						"note.status": ["Todo", "Todo", "Done"],
					},
					cardOrders: {
						"note.status": {
							Todo: ["Tasks/a.md", "Tasks/a.md", "Tasks/b.md"],
						},
					},
				}),
			}),
		).toEqual({
			columnOrders: {
				"note.status": ["Todo", "Done"],
			},
			cardOrders: {
				"note.status": {
					Todo: ["Tasks/a.md", "Tasks/b.md"],
				},
			},
		});
	});
});

describe("writeColumnOrder", () => {
	it("preserves unknown kanbanState fields while updating columnOrders", () => {
		const store = createKanbanViewStore({
			kanbanState: {
				probeUnknown: {
					keepMe: true,
				},
				columnOrders: {
					"note.priority": ["High", "Low"],
				},
				cardOrders: {
					"note.status": {
						Todo: ["Tasks/a.md"],
					},
				},
			},
		});

		writeColumnOrder(store.view.config, "note.status", ["Done", "Todo", "Done"]);

		expect(store.readState()).toEqual({
			probeUnknown: {
				keepMe: true,
			},
			columnOrders: {
				"note.priority": ["High", "Low"],
				"note.status": ["Done", "Todo"],
			},
			cardOrders: {
				"note.status": {
					Todo: ["Tasks/a.md"],
				},
			},
		});
	});

	it("round-trips through kanbanState with sibling cardOrders intact", () => {
		const store = createKanbanViewStore({
			kanbanState: {
				columnOrders: {
					"note.priority": ["High", "Low"],
				},
				cardOrders: {
					"note.status": {
						Todo: ["Tasks/a.md"],
					},
				},
			},
		});

		writeColumnOrder(store.view.config, "note.status", ["Done", "Todo", "Done"]);

		expect(readKanbanState(store.view.config)).toEqual({
			columnOrders: {
				"note.priority": ["High", "Low"],
				"note.status": ["Done", "Todo"],
			},
			cardOrders: {
				"note.status": {
					Todo: ["Tasks/a.md"],
				},
			},
		});
	});

	it("does not add empty cardOrders when only columnOrders are being written", () => {
		const store = createKanbanViewStore({
			kanbanState: {
				probeUnknown: {
					keepMe: true,
				},
				columnOrders: {},
			},
		});

		writeColumnOrder(store.view.config, "note.status", ["Backlog", "Done"]);

		expect(store.readState()).toEqual({
			probeUnknown: {
				keepMe: true,
			},
			columnOrders: {
				"note.status": ["Backlog", "Done"],
			},
		});
	});
});

describe("writeCurrentColumnOrder", () => {
	it("uses the current raw grouping key when persisting the column order", () => {
		const store = createKanbanViewStore({
			groupByProperty: "note.status",
			kanbanState: {
				probeUnknown: {
					keepMe: true,
				},
				columnOrders: {},
				cardOrders: {},
			},
		});

		writeCurrentColumnOrder(store.view, ["Backlog", "Done"]);

		expect(store.readState()).toEqual({
			probeUnknown: {
				keepMe: true,
			},
			columnOrders: {
				"note.status": ["Backlog", "Done"],
			},
			cardOrders: {},
		});
	});
});

describe("getCurrentSortKey", () => {
	it("normalizes the active Bases sort config into one comparable string", () => {
		const store = createKanbanViewStore({
			sort: [
				{ property: "file.basename", direction: "ASC" },
				{ property: "note.priority", direction: "DESC" },
			],
		});

		expect(getCurrentSortKey(store.view.config)).toBe(
			"file.basename:ASC|note.priority:DESC",
		);
	});

	it("returns an empty string when the board is unsorted", () => {
		const store = createKanbanViewStore({ sort: [] });

		expect(getCurrentSortKey(store.view.config)).toBe("");
	});
});

describe("getCardId", () => {
	it("uses the trimmed note path as the persisted card id", () => {
		expect(getCardId(createEntry(" Tasks/a.md "))).toBe("Tasks/a.md");
	});
});

describe("moveColumnToIndex", () => {
	it("moves a column to the requested insertion index", () => {
		expect(
			moveColumnToIndex(["Backlog", "Done", "Review"], "Review", 1),
		).toEqual(["Backlog", "Review", "Done"]);
	});

	it("returns a copy of the current order when the column is missing", () => {
		expect(
			moveColumnToIndex(["Backlog", "Done"], "Review", 0),
		).toEqual(["Backlog", "Done"]);
	});
});

describe("moveColumnByOffset", () => {
	it("moves a column left or right by one position", () => {
		expect(
			moveColumnByOffset(["Backlog", "Done", "Review"], "Done", 1),
		).toEqual(["Backlog", "Review", "Done"]);
		expect(
			moveColumnByOffset(["Backlog", "Done", "Review"], "Done", -1),
		).toEqual(["Done", "Backlog", "Review"]);
	});
});

describe("moveCardToIndex", () => {
	it("moves a card to the requested insertion index", () => {
		expect(
			moveCardToIndex(["Tasks/a.md", "Tasks/b.md", "Tasks/c.md"], "Tasks/c.md", 0),
		).toEqual(["Tasks/c.md", "Tasks/a.md", "Tasks/b.md"]);
	});
});

describe("moveCardToBoundary", () => {
	it("moves a card to the top or bottom of a column order", () => {
		expect(
			moveCardToBoundary(
				["Tasks/a.md", "Tasks/b.md", "Tasks/c.md"],
				"Tasks/b.md",
				"start",
			),
		).toEqual(["Tasks/b.md", "Tasks/a.md", "Tasks/c.md"]);
		expect(
			moveCardToBoundary(
				["Tasks/a.md", "Tasks/b.md", "Tasks/c.md"],
				"Tasks/b.md",
				"end",
			),
		).toEqual(["Tasks/a.md", "Tasks/c.md", "Tasks/b.md"]);
	});
});

describe("moveCardToVisibleIndex", () => {
	it("moves a visible card without dropping hidden saved cards", () => {
		expect(
			moveCardToVisibleIndex(
				["Hidden/a.md", "Tasks/b.md", "Tasks/c.md"],
				["Tasks/b.md", "Tasks/c.md"],
				"Tasks/c.md",
				0,
			),
		).toEqual(["Hidden/a.md", "Tasks/c.md", "Tasks/b.md"]);
	});

	it("inserts a moved card at the requested visible position in another column", () => {
		expect(
			moveCardToVisibleIndex(
				["Hidden/d.md", "Tasks/e.md"],
				["Tasks/e.md"],
				"Tasks/c.md",
				0,
			),
		).toEqual(["Hidden/d.md", "Tasks/c.md", "Tasks/e.md"]);
	});
});

describe("moveCardBetweenColumns", () => {
	it("removes the card from the source column and appends it to the target column", () => {
		expect(
			moveCardBetweenColumns(
				["Tasks/a.md", "Tasks/b.md"],
				["Tasks/c.md"],
				["Tasks/c.md"],
				"Tasks/a.md",
				1,
			),
		).toEqual({
			sourceCardOrder: ["Tasks/b.md"],
			targetCardOrder: ["Tasks/c.md", "Tasks/a.md"],
		});
	});

	it("keeps hidden target cards while inserting after the last visible target card", () => {
		expect(
			moveCardBetweenColumns(
				["Tasks/a.md", "Tasks/b.md"],
				["Hidden/c.md", "Tasks/d.md", "Hidden/e.md"],
				["Tasks/d.md"],
				"Tasks/a.md",
				1,
			),
		).toEqual({
			sourceCardOrder: ["Tasks/b.md"],
			targetCardOrder: [
				"Hidden/c.md",
				"Tasks/d.md",
				"Tasks/a.md",
				"Hidden/e.md",
			],
		});
	});
});

describe("getOrderedGroupsForCurrentGrouping", () => {
	const backlogGroup = createGroup("Backlog", []);
	const doneGroup = createGroup("Done", []);
	const nullGroup = createGroup(null, []);

	it("keeps live group order in auto mode", () => {
		const store = createKanbanViewStore({ groupByProperty: "note.status" });

		expect(
			getOrderedGroupsForCurrentGrouping(store.view, [backlogGroup, doneGroup]),
		).toEqual([backlogGroup, doneGroup]);
	});

	it("reorders live groups when a saved manual order exists for the current grouping", () => {
		const store = createKanbanViewStore({
			groupByProperty: "note.status",
			kanbanState: {
				columnOrders: {
					"note.status": ["Done", "Backlog"],
				},
				cardOrders: {},
			},
		});

		expect(
			getOrderedGroupsForCurrentGrouping(store.view, [backlogGroup, doneGroup]),
		).toEqual([doneGroup, backlogGroup]);
	});

	it("appends newly visible groups after the saved manual order", () => {
		const store = createKanbanViewStore({
			groupByProperty: "note.status",
			kanbanState: {
				columnOrders: {
					"note.status": ["Done"],
				},
				cardOrders: {},
			},
		});

		expect(
			getOrderedGroupsForCurrentGrouping(store.view, [
				backlogGroup,
				doneGroup,
				nullGroup,
			]),
		).toEqual([doneGroup, backlogGroup, nullGroup]);
	});

	it("ignores saved order from a different grouping", () => {
		const store = createKanbanViewStore({
			groupByProperty: "note.priority",
			kanbanState: {
				columnOrders: {
					"note.status": ["Done", "Backlog"],
				},
				cardOrders: {},
			},
		});

		expect(
			getOrderedGroupsForCurrentGrouping(store.view, [backlogGroup, doneGroup]),
		).toEqual([backlogGroup, doneGroup]);
	});
});

describe("getCardOrderForGroup", () => {
	it("uses live card order when no manual order exists for the current scope", () => {
		const backlogGroup = createGroup("Backlog", [
			createEntry("Tasks/a.md"),
			createEntry("Tasks/b.md"),
		]);
		const store = createKanbanViewStore();

		expect(getCardOrderForGroup(store.view, backlogGroup)).toEqual([
			"Tasks/a.md",
			"Tasks/b.md",
		]);
	});

	it("uses the saved manual card order for the current grouping", () => {
		const backlogGroup = createGroup("Backlog", [
			createEntry("Tasks/a.md"),
			createEntry("Tasks/b.md"),
		]);
		const store = createKanbanViewStore({
			kanbanState: {
				cardOrders: {
					"note.status": {
						Backlog: ["Tasks/b.md", "Tasks/a.md"],
					},
				},
			},
		});

		expect(getCardOrderForGroup(store.view, backlogGroup)).toEqual([
			"Tasks/b.md",
			"Tasks/a.md",
		]);
	});
});

describe("getOrderedEntriesForGroup", () => {
	it("reorders visible cards and appends newly visible ones", () => {
		const backlogGroup = createGroup("Backlog", [
			createEntry("Tasks/a.md"),
			createEntry("Tasks/b.md"),
			createEntry("Tasks/c.md"),
		]);
		const store = createKanbanViewStore({
			kanbanState: {
				cardOrders: {
					"note.status": {
						Backlog: ["Tasks/b.md", "Tasks/a.md"],
					},
				},
			},
		});

		expect(
			getOrderedEntriesForGroup(store.view, backlogGroup).map((entry) => entry.file.path),
		).toEqual(["Tasks/b.md", "Tasks/a.md", "Tasks/c.md"]);
	});
});

describe("writeCurrentCardOrder", () => {
	it("writes full-board card order for the current grouping", () => {
		const backlogGroup = createGroup("Backlog", [
			createEntry("Tasks/a.md"),
			createEntry("Tasks/b.md"),
		]);
		const doneGroup = createGroup("Done", [createEntry("Tasks/c.md")]);
		const store = createKanbanViewStore({
			kanbanState: {
				probeUnknown: {
					keepMe: true,
				},
				columnOrders: {
					"note.status": ["Backlog", "Done"],
				},
			},
		});

		writeCurrentCardOrder(store.view, [backlogGroup, doneGroup], "Backlog", [
			"Tasks/b.md",
			"Tasks/a.md",
		]);

		expect(store.readState()).toEqual({
			probeUnknown: {
				keepMe: true,
			},
			columnOrders: {
				"note.status": ["Backlog", "Done"],
			},
			cardOrders: {
				"note.status": {
					Backlog: ["Tasks/b.md", "Tasks/a.md"],
					Done: ["Tasks/c.md"],
				},
			},
		});
	});

	it("does not create manual board order for a no-op move", () => {
		const backlogGroup = createGroup("Backlog", [
			createEntry("Tasks/a.md"),
			createEntry("Tasks/b.md"),
		]);
		const store = createKanbanViewStore({
			kanbanState: {
				columnOrders: {
					"note.status": ["Backlog"],
				},
			},
		});

		expect(
			writeCurrentCardOrder(store.view, [backlogGroup], "Backlog", [
				"Tasks/a.md",
				"Tasks/b.md",
			]),
		).toBe(false);
		expect(store.readState()).toEqual({
			columnOrders: {
				"note.status": ["Backlog"],
			},
		});
	});

	it("preserves hidden cards already stored in a manual board order", () => {
		const backlogGroup = createGroup("Backlog", [createEntry("Tasks/b.md")]);
			const store = createKanbanViewStore({
				kanbanState: {
					cardOrders: {
						"note.status": {
							Backlog: ["Tasks/a.md", "Tasks/b.md"],
						},
					},
				},
			});

		writeCurrentCardOrder(store.view, [backlogGroup], "Backlog", [
			"Tasks/b.md",
			"Tasks/a.md",
		]);

		expect(store.readState()).toEqual({
			cardOrders: {
				"note.status": {
					Backlog: ["Tasks/b.md", "Tasks/a.md"],
				},
			},
		});
	});
});

describe("writeCurrentCardOrders", () => {
	it("writes updates for multiple columns in one board-state change", () => {
		const backlogGroup = createGroup("Backlog", [
			createEntry("Tasks/a.md"),
			createEntry("Tasks/b.md"),
		]);
		const doneGroup = createGroup("Done", [createEntry("Tasks/c.md")]);
		const store = createKanbanViewStore({
			kanbanState: {
				columnOrders: {
					"note.status": ["Backlog", "Done"],
				},
			},
		});

		writeCurrentCardOrders(store.view, [backlogGroup, doneGroup], {
			Backlog: ["Tasks/a.md"],
			Done: ["Tasks/c.md", "Tasks/b.md"],
		});

		expect(store.readState()).toEqual({
			columnOrders: {
				"note.status": ["Backlog", "Done"],
			},
			cardOrders: {
				"note.status": {
					Backlog: ["Tasks/a.md"],
					Done: ["Tasks/c.md", "Tasks/b.md"],
				},
			},
		});
	});
});

describe("clearCardOrders", () => {
	it("deletes all manual card order while preserving other kanban state", () => {
		const store = createKanbanViewStore({
			kanbanState: {
				probeUnknown: {
					keepMe: true,
				},
				columnOrders: {
					"note.status": ["Backlog"],
				},
				cardOrders: {
					"note.status": {
						Backlog: ["Tasks/a.md"],
					},
				},
			},
		});

		expect(clearCardOrders(store.view.config)).toBe(true);
		expect(store.readState()).toEqual({
			probeUnknown: {
				keepMe: true,
			},
			columnOrders: {
				"note.status": ["Backlog"],
			},
		});
	});

	it("returns false when there is no manual card order to clear", () => {
		const store = createKanbanViewStore({
			kanbanState: {
				columnOrders: {
					"note.status": ["Backlog"],
				},
			},
		});

		expect(clearCardOrders(store.view.config)).toBe(false);
		expect(store.readState()).toEqual({
			columnOrders: {
				"note.status": ["Backlog"],
			},
		});
	});
});
