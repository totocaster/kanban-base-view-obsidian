import { BasesView, Keymap } from "obsidian";
import type {
	BasesEntryGroup,
	BasesViewRegistration,
	Plugin,
	QueryController,
} from "obsidian";

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
		}
	}
}
