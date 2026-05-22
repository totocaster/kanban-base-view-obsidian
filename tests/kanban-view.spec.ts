import { describe, expect, it, vi } from "vitest";
import { NullValue } from "obsidian";
import {
	applyGroupingValueToFrontmatter,
	KANBAN_VIEW_ICON,
	KANBAN_VIEW_NAME,
	KANBAN_VIEW_TYPE,
	createKanbanViewRegistration,
	formatNoteCount,
	getCardMoveAnimationTransforms,
	getWritableGroupingPropertyName,
	getGroupTitle,
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

describe("registerKanbanView", () => {
	it("registers the kanban Bases view with the expected metadata", () => {
		const registerBasesView = vi.fn();

		registerKanbanView({ registerBasesView });

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
