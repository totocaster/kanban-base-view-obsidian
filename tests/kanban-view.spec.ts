import { describe, expect, it, vi } from "vitest";
import {
	KANBAN_VIEW_ICON,
	KANBAN_VIEW_NAME,
	KANBAN_VIEW_TYPE,
	createKanbanViewRegistration,
	formatNoteCount,
	getGroupTitle,
	registerKanbanView,
} from "../src/kanban-view";

describe("getGroupTitle", () => {
	it("falls back to the default title when the key is missing", () => {
		expect(getGroupTitle({ key: undefined })).toBe("Ungrouped");
	});

	it("trims non-empty group keys", () => {
		expect(getGroupTitle({ key: "  In progress  " })).toBe("In progress");
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
			}),
		);
	});
});
