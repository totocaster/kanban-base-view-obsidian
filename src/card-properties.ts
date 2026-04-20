import { NullValue, parsePropertyId } from "obsidian";
import type { BasesEntry, BasesPropertyId, BasesViewConfig, Value } from "obsidian";

type CardPropertyValue = Value | null;
type PresentCardPropertyValue = Value;
type ParsedProperty = ReturnType<typeof parsePropertyId>;

type CardPropertyBaseItem = {
	propertyId: BasesPropertyId;
	label: string;
	icon: string | null;
	toneClass?: string;
};

export type EmptyCardPropertyItem = CardPropertyBaseItem & {
	kind: "empty";
};

export type ValueCardPropertyItem = CardPropertyBaseItem & {
	kind: "value";
	value: PresentCardPropertyValue;
};

export type CardPropertyItem = EmptyCardPropertyItem | ValueCardPropertyItem;

type CardPropertyConfig = Pick<BasesViewConfig, "getDisplayName" | "getOrder">;

export function getCardPropertyItems(
	config: CardPropertyConfig,
	entry: Pick<BasesEntry, "getValue">,
	titleText: string,
	showEmptyProperties = true,
): CardPropertyItem[] {
	const items: CardPropertyItem[] = [];

	for (const propertyId of config.getOrder()) {
		const parsedProperty = parsePropertyId(propertyId);
		const value = entry.getValue(propertyId);
		if (isDuplicateTitleProperty(parsedProperty, value, titleText)) {
			continue;
		}

		const hasValue = hasPresentValue(value);
		if (!hasValue && !showEmptyProperties) {
			continue;
		}

		const baseItem = createCardPropertyBaseItem(
			config,
			propertyId,
			parsedProperty,
			value,
		);
		if (hasValue) {
			items.push({
				...baseItem,
				kind: "value",
				value,
			});
			continue;
		}

		items.push({
			...baseItem,
			kind: "empty",
		});
	}

	return items;
}

export function hasCardPropertyValue(
	item: CardPropertyItem,
): item is ValueCardPropertyItem {
	return item.kind === "value";
}

export function getPropertyLabel(
	config: Pick<BasesViewConfig, "getDisplayName">,
	propertyId: BasesPropertyId,
	propertyName = parsePropertyId(propertyId).name,
): string {
	const displayName = config.getDisplayName(propertyId).trim();
	if (displayName.length > 0) {
		return displayName;
	}

	const normalizedName = propertyName
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/[-_]+/g, " ")
		.trim();

	if (normalizedName.length === 0) {
		return propertyId;
	}

	return normalizedName.charAt(0).toUpperCase() + normalizedName.slice(1);
}

export function getMetadataIcon(
	propertyId: BasesPropertyId,
	value: CardPropertyValue,
	propertyName = parsePropertyId(propertyId).name,
): { icon: string; toneClass?: string } | null {
	const propertyKey = propertyName.toLowerCase();
	if (
		matchesPropertyName(propertyKey, [
			"due",
			"date",
			"deadline",
			"scheduled",
			"start",
			"end",
			"created",
			"modified",
		])
	) {
		return { icon: "calendar" };
	}

	if (
		matchesPropertyName(propertyKey, [
			"assignee",
			"owner",
			"person",
			"people",
			"author",
			"reviewer",
			"reporter",
			"contact",
		])
	) {
		return { icon: "user" };
	}

	if (
		matchesPropertyName(propertyKey, [
			"priority",
			"urgency",
			"severity",
			"importance",
		])
	) {
		return {
			icon: "flag",
			toneClass: getPriorityToneClass(value),
		};
	}

	if (matchesPropertyName(propertyKey, ["status", "state", "stage", "phase"])) {
		return { icon: "circle" };
	}

	if (
		matchesPropertyName(propertyKey, [
			"tag",
			"tags",
			"label",
			"labels",
			"category",
		])
	) {
		return { icon: "tag" };
	}

	return null;
}

function createCardPropertyBaseItem(
	config: CardPropertyConfig,
	propertyId: BasesPropertyId,
	parsedProperty: ParsedProperty,
	value: CardPropertyValue,
): CardPropertyBaseItem {
	const metadataIcon = getMetadataIcon(propertyId, value, parsedProperty.name);
	return {
		propertyId,
		label: getPropertyLabel(config, propertyId, parsedProperty.name),
		icon: metadataIcon?.icon ?? null,
		toneClass: metadataIcon?.toneClass,
	};
}

function isDuplicateTitleProperty(
	parsedProperty: ParsedProperty,
	value: CardPropertyValue,
	titleText: string,
): boolean {
	if (!value) {
		return false;
	}

	return (
		parsedProperty.type === "file" &&
		parsedProperty.name === "name" &&
		value.toString() === titleText
	);
}

function isEmptyValue(
	value: CardPropertyValue,
): boolean {
	if (value === null || value instanceof NullValue) {
		return true;
	}

	if (hasIsEmpty(value) && value.isEmpty()) {
		return true;
	}

	return false;
}

function hasPresentValue(value: CardPropertyValue): value is PresentCardPropertyValue {
	return !isEmptyValue(value);
}

function hasIsEmpty(value: object): value is { isEmpty: () => boolean } {
	return "isEmpty" in value && typeof value.isEmpty === "function";
}

function matchesPropertyName(propertyKey: string, candidates: string[]): boolean {
	return candidates.some((candidate) => propertyKey.includes(candidate));
}

function getPriorityToneClass(value: CardPropertyValue): string | undefined {
	const priorityValue = value?.toString().trim().toLowerCase();
	if (!priorityValue) {
		return undefined;
	}

	if (/(critical|urgent|high|p0|p1)/.test(priorityValue)) {
		return "bases-kanban-card-property-icon--priority-high";
	}

	if (/(medium|med|normal|moderate|p2)/.test(priorityValue)) {
		return "bases-kanban-card-property-icon--priority-medium";
	}

	if (/(low|minor|p3|p4)/.test(priorityValue)) {
		return "bases-kanban-card-property-icon--priority-low";
	}

	return undefined;
}
