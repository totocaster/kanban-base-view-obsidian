import { NullValue } from "obsidian";
import { describe, expect, it } from "vitest";
import {
	getCardPropertyItems,
	getMetadataIcon,
	getPropertyLabel,
} from "../src/card-properties";

type FakeValue = {
	isEmpty?: () => boolean;
	renderTo: () => void;
	toString: () => string;
};

function createValue(text: string, isEmpty = false): FakeValue {
	return {
		isEmpty: () => isEmpty,
		renderTo: () => {},
		toString: () => text,
	};
}

describe("getCardPropertyItems", () => {
	it("keeps the selected property order while filtering only duplicate titles", () => {
		const config = {
			getDisplayName: (propertyId: string) => {
				const labels: Record<string, string> = {
					"note.owner": "Owner",
					"note.priority": "Priority",
					"note.due": "Due",
				};
				return labels[propertyId] ?? "";
			},
			getOrder: () => [
				"note.priority",
				"file.name",
				"note.empty",
				"note.owner",
				"note.due",
			],
		};
		const values: Record<string, FakeValue | null> = {
			"note.priority": createValue("High"),
			"file.name": createValue("Task alpha"),
			"note.empty": createValue("", true),
			"note.owner": createValue("Toto"),
			"note.due": createValue("2026-04-20"),
		};
		const entry = {
			getValue: (propertyId: string) => values[propertyId] ?? null,
		};

		const items = getCardPropertyItems(config, entry, "Task alpha");

		expect(items.map((item) => item.propertyId)).toEqual([
			"note.priority",
			"note.empty",
			"note.owner",
			"note.due",
		]);
		expect(items.map((item) => item.label)).toEqual([
			"Priority",
			"Empty",
			"Owner",
			"Due",
		]);
		expect(items[0]?.kind).toBe("value");
		expect(items[1]?.kind).toBe("empty");
	});

	it("keeps renderable values whose toString output is empty", () => {
		const config = {
			getDisplayName: () => "Person",
			getOrder: () => ["note.person"],
		};
		const entry = {
			getValue: () =>
				({
					renderTo: () => {},
					toString: () => "",
				}) satisfies FakeValue,
		};

		const items = getCardPropertyItems(config, entry, "Task alpha");

		expect(items).toHaveLength(1);
		expect(items[0]?.kind).toBe("value");
	});

	it("marks NullValue entries as empty so the view can render a fallback dash", () => {
		const config = {
			getDisplayName: () => "Person",
			getOrder: () => ["note.person"],
		};
		const entry = {
			getValue: () => new NullValue(),
		};

		const items = getCardPropertyItems(config, entry, "Task alpha");

		expect(items).toHaveLength(1);
		expect(items[0]?.kind).toBe("empty");
	});
});

describe("getPropertyLabel", () => {
	it("falls back to a normalized property name when no display name is set", () => {
		const config = {
			getDisplayName: () => "",
		};

		expect(getPropertyLabel(config, "note.reviewStatus")).toBe("Review Status");
	});
});

describe("getMetadataIcon", () => {
	it("keeps the priority icon and tone behavior", () => {
		expect(getMetadataIcon("note.priority", createValue("High"))).toEqual({
			icon: "flag",
			toneClass: "bases-kanban-card-property-icon--priority-high",
		});
	});

	it("maps common property names to the same icons as the older plugin", () => {
		expect(getMetadataIcon("note.dueDate", createValue("2026-04-20"))).toEqual({
			icon: "calendar",
		});
		expect(getMetadataIcon("note.assignee", createValue("Toto"))).toEqual({
			icon: "user",
		});
		expect(getMetadataIcon("note.tags", createValue("#kanban"))).toEqual({
			icon: "tag",
		});
	});
});
