import { describe, expect, it, vi } from "vitest";
import { NullValue } from "obsidian";
import {
	applyGroupingValueToFrontmatter,
	DEFAULT_KANBAN_GLOBAL_SETTINGS,
	KANBAN_HOVER_SOURCE,
	KANBAN_HOVER_SOURCE_NAME,
	KANBAN_VIEW_ICON,
	KANBAN_VIEW_NAME,
	KANBAN_VIEW_TYPE,
	createGroupedNoteFrontmatterProcessor,
	createKanbanViewRegistration,
	formatColumnNoteCount,
	formatNoteCount,
	getKanbanDatePresentation,
	getKanbanDateStatus,
	getCardMoveAnimationTransforms,
	getRenamedNotePath,
	getWritableGroupingPropertyName,
	getGroupTitle,
	isColumnOverWipLimit,
	normalizeKanbanGlobalSettings,
	parseWipLimitInput,
	registerKanbanView,
	shouldPreventCardTitleMouseDownDefault,
	shouldReleaseMouseFocusSuppression,
} from "../src/kanban-view";

describe("getGroupTitle", () => {
	it("falls back to the default title for ungrouped Bases entries", () => {
		expect(getGroupTitle({ key: new NullValue(), hasKey: () => false })).toBe(
			"Ungrouped",
		);
	});

	it("falls back to the default title when the key is missing", () => {
		expect(getGroupTitle({ key: undefined, hasKey: () => false })).toBe(
			"Ungrouped",
		);
	});

	it("trims non-empty group keys", () => {
		expect(
			getGroupTitle({
				key: { toString: () => "  In progress  " },
				hasKey: () => true,
			}),
		).toBe("In progress");
	});
});

describe("formatNoteCount", () => {
	it("formats a singular note count", () => {
		expect(formatNoteCount(1)).toBe("1 note");
	});

	it("formats a plural note count", () => {
		expect(formatNoteCount(3)).toBe("3 notes");
	});
});

describe("column WIP presentation", () => {
	it("shows the current note count and configured limit", () => {
		expect(formatColumnNoteCount(5, 3)).toBe("5 / 3 notes");
		expect(formatColumnNoteCount(1, 3)).toBe("1 / 3 note");
		expect(formatColumnNoteCount(3, null)).toBe("3 notes");
	});

	it("warns only after the soft limit is exceeded", () => {
		expect(isColumnOverWipLimit(2, 3)).toBe(false);
		expect(isColumnOverWipLimit(3, 3)).toBe(false);
		expect(isColumnOverWipLimit(4, 3)).toBe(true);
		expect(isColumnOverWipLimit(4, null)).toBe(false);
	});

	it("parses positive whole-number limits and uses an empty value to clear", () => {
		expect(parseWipLimitInput(" 4 ")).toBe(4);
		expect(parseWipLimitInput("")).toBeNull();
		expect(parseWipLimitInput("0")).toBeUndefined();
		expect(parseWipLimitInput("2.5")).toBeUndefined();
		expect(parseWipLimitInput("many")).toBeUndefined();
	});
});

describe("normalizeKanbanGlobalSettings", () => {
	it("uses stable defaults for missing or invalid settings", () => {
		expect(normalizeKanbanGlobalSettings(undefined)).toEqual(
			DEFAULT_KANBAN_GLOBAL_SETTINGS,
		);
		expect(
			normalizeKanbanGlobalSettings({
				showCardHoverPreviews: "yes",
				dateDisplayMode: "friendly",
			}),
		).toEqual(DEFAULT_KANBAN_GLOBAL_SETTINGS);
	});

	it("keeps valid global hover and date display settings", () => {
		expect(
			normalizeKanbanGlobalSettings({
				showCardHoverPreviews: false,
				dateDisplayMode: "relative",
			}),
		).toEqual({
			showCardHoverPreviews: false,
			dateDisplayMode: "relative",
		});
	});
});

describe("getKanbanDatePresentation", () => {
	const dateValue = {
		toString: () => "2026-07-27",
		relative: () => "yesterday",
	};

	it("shows exact dates while retaining their kanban status", () => {
		expect(
			getKanbanDatePresentation(
				dateValue,
				"note.due",
				"exact",
				new Date(2026, 6, 28),
			),
		).toEqual({
			text: "2026-07-27",
			exactText: "2026-07-27",
			status: "overdue",
		});
	});

	it("shows relative dates while retaining the exact value for a tooltip", () => {
		expect(
			getKanbanDatePresentation(
				dateValue,
				"note.due",
				"relative",
				new Date(2026, 6, 28),
			),
		).toEqual({
			text: "yesterday",
			exactText: "2026-07-27",
			status: "overdue",
		});
	});
});

describe("getKanbanDateStatus", () => {
	it("classifies overdue, today, and tomorrow values for actionable dates", () => {
		const currentDate = new Date(2026, 6, 28, 18, 30);

		expect(
			getKanbanDateStatus("note.dueDate", "2026-07-27", currentDate),
		).toBe("overdue");
		expect(
			getKanbanDateStatus("note.deadline", "2026-07-28", currentDate),
		).toBe("today");
		expect(
			getKanbanDateStatus("note.scheduled", "2026-07-29", currentDate),
		).toBe("tomorrow");
	});

	it("does not assign workflow status to historical metadata dates", () => {
		expect(
			getKanbanDateStatus(
				"file.mtime",
				"2026-07-27",
				new Date(2026, 6, 28),
			),
		).toBeNull();
		expect(
			getKanbanDateStatus(
				"note.created",
				"2026-07-27",
				new Date(2026, 6, 28),
			),
		).toBeNull();
	});
});

describe("getRenamedNotePath", () => {
	it("renames a note in its current folder while preserving the extension", () => {
		expect(
			getRenamedNotePath(
				{
					extension: "md",
					parent: { path: "Projects" },
					path: "Projects/Old.md",
				} as never,
				"New",
			),
		).toBe("Projects/New.md");
	});

	it("does not duplicate the current extension when it is already present", () => {
		expect(
			getRenamedNotePath(
				{
					extension: "md",
					parent: { path: "Projects" },
					path: "Projects/Old.md",
				} as never,
				"New.md",
			),
		).toBe("Projects/New.md");
	});

	it("handles notes in the vault root", () => {
		expect(
			getRenamedNotePath(
				{
					extension: "md",
					parent: { path: "/" },
					path: "Old.md",
				} as never,
				"New",
			),
		).toBe("New.md");
	});

	it("rejects empty note names", () => {
		expect(
			getRenamedNotePath(
				{
					extension: "md",
					parent: { path: "Projects" },
					path: "Projects/Old.md",
				} as never,
				"  ",
			),
		).toBeNull();
	});
});

describe("getCardMoveAnimationTransforms", () => {
	it("calculates inverse transforms for cards that moved", () => {
		const transforms = getCardMoveAnimationTransforms(
			new Map([
				["Tasks/a.md", { left: 10, top: 20 }],
				["Tasks/b.md", { left: 10, top: 80 }],
			]),
			new Map([
				["Tasks/a.md", { left: 10, top: 80 }],
				["Tasks/b.md", { left: 10, top: 20 }],
			]),
		);

		expect(transforms).toEqual(
			new Map([
				["Tasks/a.md", { translateX: 0, translateY: -60 }],
				["Tasks/b.md", { translateX: 0, translateY: 60 }],
			]),
		);
	});

	it("includes horizontal movement for cross-column card moves", () => {
		const transforms = getCardMoveAnimationTransforms(
			new Map([["Tasks/a.md", { left: 12, top: 20 }]]),
			new Map([["Tasks/a.md", { left: 240, top: 84 }]]),
		);

		expect(transforms).toEqual(
			new Map([["Tasks/a.md", { translateX: -228, translateY: -64 }]]),
		);
	});

	it("skips missing and visually stationary cards", () => {
		const transforms = getCardMoveAnimationTransforms(
			new Map([
				["Tasks/a.md", { left: 10, top: 20 }],
				["Tasks/b.md", { left: 20, top: 40 }],
			]),
			new Map([
				["Tasks/a.md", { left: 10.2, top: 20.3 }],
				["Tasks/c.md", { left: 20, top: 40 }],
			]),
		);

		expect(transforms).toEqual(new Map());
	});
});

describe("shouldReleaseMouseFocusSuppression", () => {
	it("keeps mouse focus suppressed for same-coordinate mouseover events", () => {
		expect(
			shouldReleaseMouseFocusSuppression(
				{ clientX: 24, clientY: 48 },
				{ clientX: 24, clientY: 48 },
				"mouseover",
			),
		).toBe(false);
	});

	it("releases mouse focus suppression once the pointer coordinates change", () => {
		expect(
			shouldReleaseMouseFocusSuppression(
				{ clientX: 24, clientY: 48 },
				{ clientX: 25, clientY: 48 },
				"mouseover",
			),
		).toBe(true);
		expect(
			shouldReleaseMouseFocusSuppression(
				{ clientX: 24, clientY: 48 },
				{ clientX: 24, clientY: 49 },
				"mousemove",
			),
		).toBe(true);
	});

	it("requires mousemove before releasing suppression when no prior point exists", () => {
		expect(
			shouldReleaseMouseFocusSuppression(
				null,
				{ clientX: 24, clientY: 48 },
				"mouseover",
			),
		).toBe(false);
		expect(
			shouldReleaseMouseFocusSuppression(
				null,
				{ clientX: 24, clientY: 48 },
				"mousemove",
			),
		).toBe(true);
	});
});

describe("shouldPreventCardTitleMouseDownDefault", () => {
	it("keeps primary title clicks focused on non-reorderable cards", () => {
		expect(shouldPreventCardTitleMouseDownDefault(0, false)).toBe(true);
	});

	it("allows primary title drags to reach reorderable cards", () => {
		expect(shouldPreventCardTitleMouseDownDefault(0, true)).toBe(false);
	});

	it("does not intercept secondary title clicks", () => {
		expect(shouldPreventCardTitleMouseDownDefault(2, false)).toBe(false);
	});
});

describe("getWritableGroupingPropertyName", () => {
	it("returns the note property name for writable note groupings", () => {
		expect(getWritableGroupingPropertyName("note.status")).toBe("status");
	});

	it("returns null for non-note groupings", () => {
		expect(getWritableGroupingPropertyName("file.ext")).toBeNull();
	});

	it("returns null for formula groupings because they are computed", () => {
		expect(getWritableGroupingPropertyName("formula.statusBucket")).toBeNull();
	});
});

describe("applyGroupingValueToFrontmatter", () => {
	it("deletes the property for ungrouped targets", () => {
		const frontmatter = {
			status: "Done",
			keep: true,
		};

		applyGroupingValueToFrontmatter(frontmatter, "status", "__kanban_null__");

		expect(frontmatter).toEqual({
			keep: true,
		});
	});

	it("writes an empty string for the empty-value group", () => {
		const frontmatter: Record<string, unknown> = {};

		applyGroupingValueToFrontmatter(frontmatter, "status", "__kanban_empty__");

		expect(frontmatter).toEqual({
			status: "",
		});
	});

	it("writes the concrete group key for normal targets", () => {
		const frontmatter: Record<string, unknown> = {};

		applyGroupingValueToFrontmatter(frontmatter, "status", "In progress");

		expect(frontmatter).toEqual({
			status: "In progress",
		});
	});
});

describe("createGroupedNoteFrontmatterProcessor", () => {
	it("returns null when the grouping is not a writable note property", () => {
		expect(
			createGroupedNoteFrontmatterProcessor("formula.statusBucket", "Done"),
		).toBeNull();
		expect(createGroupedNoteFrontmatterProcessor("file.ext", "md")).toBeNull();
		expect(createGroupedNoteFrontmatterProcessor(null, "Done")).toBeNull();
	});

	it("prefills the grouped note property for a concrete column", () => {
		const frontmatter: Record<string, unknown> = {};
		const processor = createGroupedNoteFrontmatterProcessor(
			"note.status",
			"In progress",
		);

		processor?.(frontmatter);

		expect(frontmatter).toEqual({
			status: "In progress",
		});
	});

	it("writes an empty string for the empty-value column", () => {
		const frontmatter: Record<string, unknown> = {};
		const processor = createGroupedNoteFrontmatterProcessor(
			"note.status",
			"__kanban_empty__",
		);

		processor?.(frontmatter);

		expect(frontmatter).toEqual({
			status: "",
		});
	});

	it("keeps the grouped note property absent for the ungrouped column", () => {
		const frontmatter: Record<string, unknown> = {
			keep: true,
			status: "Done",
		};
		const processor = createGroupedNoteFrontmatterProcessor(
			"note.status",
			"__kanban_null__",
		);

		processor?.(frontmatter);

		expect(frontmatter).toEqual({
			keep: true,
		});
	});
});

describe("registerKanbanView", () => {
	it("registers no-modifier page previews and the expected Bases view", () => {
		const registerBasesView = vi.fn();
		const registerHoverLinkSource = vi.fn();

		registerKanbanView({ registerBasesView, registerHoverLinkSource });

		expect(registerHoverLinkSource).toHaveBeenCalledTimes(1);
		expect(registerHoverLinkSource).toHaveBeenCalledWith(
			KANBAN_HOVER_SOURCE,
			{
				display: KANBAN_HOVER_SOURCE_NAME,
				defaultMod: false,
			},
		);
		expect(registerBasesView).toHaveBeenCalledTimes(1);
		expect(registerBasesView).toHaveBeenCalledWith(
			KANBAN_VIEW_TYPE,
			expect.objectContaining({
				name: KANBAN_VIEW_NAME,
				icon: KANBAN_VIEW_ICON,
				factory: expect.any(Function),
			}),
		);
	});
});

describe("createKanbanViewRegistration", () => {
	it("returns a registration object with a view factory", () => {
		expect(createKanbanViewRegistration()).toEqual(
			expect.objectContaining({
				name: KANBAN_VIEW_NAME,
				icon: KANBAN_VIEW_ICON,
				factory: expect.any(Function),
				options: expect.any(Function),
			}),
		);
	});

	it("registers a view toggle to control empty property visibility", () => {
		const registration = createKanbanViewRegistration();
		const options = registration.options?.({} as never);

		expect(options).toEqual([
			expect.objectContaining({
				type: "toggle",
				displayName: "Show empty properties",
				key: "showEmptyProperties",
				default: true,
			}),
			expect.any(Object),
		]);
	});

	it("registers a view dropdown to control card content previews", () => {
		const registration = createKanbanViewRegistration();
		const options = registration.options?.({} as never);

		expect(options).toEqual([
			expect.any(Object),
			expect.objectContaining({
				type: "dropdown",
				displayName: "Content preview",
				key: "contentPreview",
				default: "none",
				options: {
					none: "None",
					small: "Small",
					large: "Large",
				},
			}),
		]);
	});
});
