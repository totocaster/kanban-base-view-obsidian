import { NullValue } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import {
	KANBAN_EMPTY_COLUMN_ID,
	KANBAN_NULL_COLUMN_ID,
	KANBAN_STATE_KEY,
	getCurrentGroupingKey,
	getGroupColumnId,
	getOrderedGroupsForCurrentGrouping,
	moveColumnByOffset,
	moveColumnToIndex,
	readKanbanState,
	writeColumnOrder,
	writeCurrentColumnOrder,
} from "../src/kanban-ordering";

function createKanbanViewStore(options?: {
	groupByProperty?: string | null;
	kanbanState?: unknown;
	name?: string;
}) {
	const { groupByProperty = "note.status", kanbanState, name = "My Kanban" } =
		options ?? {};
	let currentKanbanState = kanbanState;

	return {
		view: {
			type: "kanban",
			config: {
				name,
				get: (key: string) =>
					key === KANBAN_STATE_KEY ? currentKanbanState : undefined,
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

describe("getOrderedGroupsForCurrentGrouping", () => {
	const backlogGroup = {
		key: { toString: () => "Backlog" },
		hasKey: () => true,
		entries: [],
	};
	const doneGroup = {
		key: { toString: () => "Done" },
		hasKey: () => true,
		entries: [],
	};
	const nullGroup = {
		key: new NullValue(),
		hasKey: () => false,
		entries: [],
	};

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
