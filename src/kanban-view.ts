import {
	BasesView,
	DateValue,
	Keymap,
	setIcon,
} from "obsidian";
import type {
	BasesEntry,
	BasesEntryGroup,
	BasesViewRegistration,
	Plugin,
	QueryController,
} from "obsidian";
import { getCardPropertyItems, hasCardPropertyValue } from "./card-properties";

export const KANBAN_VIEW_TYPE = "kanban";
export const KANBAN_VIEW_NAME = "Kanban";
export const KANBAN_VIEW_ICON = "lucide-columns-3";
export const EMPTY_GROUP_TITLE = "Ungrouped";

type BasesViewRegistrar = Pick<Plugin, "registerBasesView">;

export function getGroupTitle(group: Pick<BasesEntryGroup, "key">): string {
	return group.key?.toString().trim() || EMPTY_GROUP_TITLE;
}

export function formatNoteCount(count: number): string {
	return `${count} note${count === 1 ? "" : "s"}`;
}

export function createKanbanViewRegistration(): BasesViewRegistration {
	return {
		name: KANBAN_VIEW_NAME,
		icon: KANBAN_VIEW_ICON,
		factory: (controller, containerEl) =>
			new BasesKanbanScaffoldView(controller, containerEl),
	};
}

export function registerKanbanView(plugin: BasesViewRegistrar): void {
	plugin.registerBasesView(KANBAN_VIEW_TYPE, createKanbanViewRegistration());
}

class BasesKanbanScaffoldView extends BasesView {
	readonly type = KANBAN_VIEW_TYPE;
	private readonly containerEl: HTMLElement;

	constructor(controller: QueryController, parentEl: HTMLElement) {
		super(controller);
		this.containerEl = parentEl.createDiv({ cls: "bases-kanban-view" });
	}

	onDataUpdated(): void {
		this.containerEl.empty();

		const boardEl = this.containerEl.createDiv({ cls: "bases-kanban-board" });
		for (const group of this.data.groupedData) {
			this.renderGroup(boardEl, group);
		}
	}

	private renderGroup(boardEl: HTMLElement, group: BasesEntryGroup): void {
		const columnEl = boardEl.createEl("section", { cls: "bases-kanban-column" });
		const headingEl = columnEl.createEl("header", {
			cls: "bases-kanban-column-heading",
		});

		headingEl.createEl("h4", {
			cls: "bases-kanban-column-title",
			text: getGroupTitle(group),
		});
		headingEl.createEl("small", {
			cls: "bases-kanban-column-count",
			text: formatNoteCount(group.entries.length),
		});

		const cardsEl = columnEl.createEl("ul", { cls: "bases-kanban-cards" });
		if (group.entries.length === 0) {
			columnEl.createEl("p", {
				cls: "bases-kanban-empty",
				text: "No notes in this group.",
			});
			return;
		}

		for (const entry of group.entries) {
			this.renderCard(cardsEl, entry);
		}
	}

	private renderCard(cardsEl: HTMLElement, entry: BasesEntry): void {
		const cardEl = cardsEl.createEl("li", {
			cls: "bases-kanban-card",
		});
		const titleEl = cardEl.createEl("button", {
			cls: "bases-kanban-card-link",
			attr: {
				type: "button",
			},
		});
		titleEl.setText(entry.file.basename);
		titleEl.onClickEvent((event) => {
			event.preventDefault();
			event.stopPropagation();
			void this.app.workspace.openLinkText(
				entry.file.path,
				"",
				Keymap.isModEvent(event),
			);
		});

		this.renderCardProperties(cardEl, entry);
	}

	private renderCardProperties(cardEl: HTMLElement, entry: BasesEntry): void {
		const propertyItems = getCardPropertyItems(
			this.config,
			entry,
			entry.file.basename,
		);
		if (propertyItems.length === 0) {
			return;
		}

		const propertiesEl = cardEl.createDiv({ cls: "bases-kanban-card-properties" });
		const renderContext = this.app.renderContext;

		for (const propertyItem of propertyItems) {
			const rowEl = propertiesEl.createDiv({
				cls: "bases-kanban-card-property",
			});
			this.renderCardPropertyIcon(
				rowEl,
				propertyItem.icon,
				propertyItem.toneClass,
			);
			rowEl.createSpan({
				cls: "bases-kanban-card-property-label",
				text: propertyItem.label,
			});

			const valueEl = rowEl.createSpan({
				cls: "bases-kanban-card-property-value",
			});
			if (!hasCardPropertyValue(propertyItem)) {
				valueEl.addClass("bases-kanban-card-property-value--empty");
				valueEl.setText("–");
				continue;
			}

			if (propertyItem.value instanceof DateValue) {
				valueEl.setText(propertyItem.value.toString());
				continue;
			}

			propertyItem.value.renderTo(valueEl, renderContext);
		}
	}

	private renderCardPropertyIcon(
		parentEl: HTMLElement,
		icon: string | null,
		toneClass?: string,
	): void {
		const iconEl = parentEl.createSpan({
			cls: "bases-kanban-card-property-icon",
			attr: { "aria-hidden": "true" },
		});
		if (!icon) {
			iconEl.addClass("bases-kanban-card-property-icon--empty");
			return;
		}

		setIcon(iconEl, icon);
		if (toneClass) {
			iconEl.addClass(toneClass);
		}
	}
}
