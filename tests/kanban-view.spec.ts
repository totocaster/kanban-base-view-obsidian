import { describe, expect, it, vi } from "vitest";
import { NullValue } from "obsidian";
import {
	applyGroupingValueToFrontmatter,
	KANBAN_VIEW_ICON,
	KANBAN_VIEW_NAME,
	KANBAN_VIEW_TYPE,
	createKanbanViewRegistration,
	formatNoteCount,
	getWritableGroupingPropertyName,
	getGroupTitle,
	registerKanbanView,
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

describe("getWritableGroupingPropertyName", () => {
	it("returns the note property name for writable note groupings", () => {
		expect(getWritableGroupingPropertyName("note.status")).toBe("status");
	});

	it("returns null for non-note groupings", () => {
		expect(getWritableGroupingPropertyName("file.ext")).toBeNull();
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
		]);
	});
});
