import {
	BasesView,
	DateValue,
	Keymap,
	Menu,
	setIcon,
} from "obsidian";
import type {
	BasesEntry,
	BasesEntryGroup,
	BasesViewRegistration,
	Plugin,
	QueryController,
} from "obsidian";
import {
	clearCardOrders,
	getCardId,
	getCardOrderForGroup,
	getCurrentSortKey,
	getCurrentGroupingKey,
	getGroupColumnId,
	getOrderedEntriesForGroup,
	getOrderedGroupsForCurrentGrouping,
	moveCardToBoundary,
	writeCurrentCardOrder,
	moveColumnByOffset,
	moveColumnToIndex,
	writeCurrentColumnOrder,
} from "./kanban-ordering";
import { getCardPropertyItems, hasCardPropertyValue } from "./card-properties";

export const KANBAN_VIEW_TYPE = "kanban";
export const KANBAN_VIEW_NAME = "Kanban";
export const KANBAN_VIEW_ICON = "lucide-columns-3";
export const EMPTY_GROUP_TITLE = "Ungrouped";
const SHOW_EMPTY_PROPERTIES_KEY = "showEmptyProperties";
const COLUMN_ID_ATTR = "data-column-id";
const COLUMN_DRAGGING_CLASS = "bases-kanban-column--dragging";
const COLUMN_DROP_SLOT_ACTIVE_CLASS = "bases-kanban-drop-slot--active";
const DRAG_PREVIEW_CLASS = "bases-kanban-drag-preview";

type BasesViewRegistrar = Pick<Plugin, "registerBasesView">;

export function getGroupTitle(
	group: Pick<BasesEntryGroup, "key" | "hasKey">,
): string {
	if (!group.hasKey()) {
		return EMPTY_GROUP_TITLE;
	}

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
		options: () => [
			{
				type: "toggle",
				displayName: "Show empty properties",
				key: SHOW_EMPTY_PROPERTIES_KEY,
				default: true,
			},
		],
	};
}

export function registerKanbanView(plugin: BasesViewRegistrar): void {
	plugin.registerBasesView(KANBAN_VIEW_TYPE, createKanbanViewRegistration());
}

class BasesKanbanScaffoldView extends BasesView {
	readonly type = KANBAN_VIEW_TYPE;
	private readonly containerEl: HTMLElement;
	private boardEl: HTMLElement | null = null;
	private draggedColumnEl: HTMLElement | null = null;
	private activeColumnSlotEl: HTMLElement | null = null;
	private lastObservedSortKey: string | null = null;

	constructor(controller: QueryController, parentEl: HTMLElement) {
		super(controller);
		this.containerEl = parentEl.createDiv({ cls: "bases-kanban-view" });
	}

	onDataUpdated(): void {
		this.syncCardOrdersWithCurrentSort();
		this.resetColumnInteractionState();
		this.containerEl.empty();
		this.boardEl = null;

		const boardEl = this.containerEl.createDiv({ cls: "bases-kanban-board" });
		this.boardEl = boardEl;
		boardEl.addEventListener("dragover", (event) => {
			this.handleBoardDragOver(event, boardEl);
		});
		boardEl.addEventListener("drop", (event) => {
			this.handleBoardDrop(event, boardEl);
		});

		this.renderColumnDropSlot(boardEl);
		for (const group of getOrderedGroupsForCurrentGrouping(
			this,
			this.data.groupedData,
		)) {
			this.renderGroup(boardEl, group);
			this.renderColumnDropSlot(boardEl);
		}
	}

	private renderGroup(boardEl: HTMLElement, group: BasesEntryGroup): void {
		const columnId = getGroupColumnId(group);
		const columnTitle = getGroupTitle(group);
		// Card ordering is scoped to the active grouping. If we cannot resolve a
		// usable groupBy property at runtime, manual card reordering must stay off.
		const hasActiveGrouping = getCurrentGroupingKey(this) !== null;
		const canReorderColumns = hasActiveGrouping;
		const canReorderCards = hasActiveGrouping;
		const columnEl = boardEl.createEl("section", { cls: "bases-kanban-column" });
		columnEl.setAttribute(COLUMN_ID_ATTR, columnId);
		const headingEl = columnEl.createEl("header", {
			cls: "bases-kanban-column-heading",
		});
		if (canReorderColumns) {
			headingEl.addClass("bases-kanban-column-heading--draggable");
			headingEl.tabIndex = 0;
			headingEl.draggable = true;
			headingEl.addEventListener("dragstart", (event) => {
				this.handleColumnDragStart(event, columnEl);
			});
			headingEl.addEventListener("dragend", () => {
				this.handleColumnDragEnd();
			});
			headingEl.addEventListener("contextmenu", (event) => {
				event.preventDefault();
				event.stopPropagation();
				this.openColumnMenu(event, columnEl, columnTitle);
			});
			headingEl.addEventListener("keydown", (event) => {
				this.handleColumnHeaderKeyDown(event, headingEl, columnEl, columnTitle);
			});
		}

		headingEl.createEl("h4", {
			cls: "bases-kanban-column-title",
			text: columnTitle,
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

		for (const entry of getOrderedEntriesForGroup(this, group)) {
			this.renderCard(cardsEl, group, entry, canReorderCards);
		}
	}

	private renderCard(
		cardsEl: HTMLElement,
		group: BasesEntryGroup,
		entry: BasesEntry,
		canReorderCards: boolean,
	): void {
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
		if (canReorderCards) {
			cardEl.addEventListener("contextmenu", (event) => {
				event.preventDefault();
				event.stopPropagation();
				this.openCardOrderMenu(event, group, entry);
			});
			titleEl.addEventListener("keydown", (event) => {
				this.handleCardOrderKeyDown(event, titleEl, group, entry);
			});
		}

		this.renderCardProperties(cardEl, entry);
	}

	private renderCardProperties(cardEl: HTMLElement, entry: BasesEntry): void {
		const propertyItems = getCardPropertyItems(
			this.config,
			entry,
			entry.file.basename,
			this.shouldShowEmptyProperties(),
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

	private shouldShowEmptyProperties(): boolean {
		const value = this.config.get(SHOW_EMPTY_PROPERTIES_KEY);
		return typeof value === "boolean" ? value : true;
	}

	private syncCardOrdersWithCurrentSort(): void {
		const currentSortKey = getCurrentSortKey(this.config);
		if (
			this.lastObservedSortKey !== null &&
			this.lastObservedSortKey !== currentSortKey
		) {
			clearCardOrders(this.config);
		}

		this.lastObservedSortKey = currentSortKey;
	}

	// Card ordering menu actions
	private openCardOrderMenu(
		event: MouseEvent,
		group: BasesEntryGroup,
		entry: BasesEntry,
	): void {
		this.buildCardOrderMenu(group, entry)?.showAtMouseEvent(event);
	}

	private handleCardOrderKeyDown(
		event: KeyboardEvent,
		titleEl: HTMLElement,
		group: BasesEntryGroup,
		entry: BasesEntry,
	): void {
		if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();
		const rect = titleEl.getBoundingClientRect();
		this.buildCardOrderMenu(group, entry)?.showAtPosition({
			x: rect.left,
			y: rect.bottom,
			width: rect.width,
		});
	}

	private buildCardOrderMenu(
		group: BasesEntryGroup,
		entry: BasesEntry,
	): Menu | null {
		const cardOrder = getCardOrderForGroup(this, group);
		const cardId = getCardId(entry);
		const cardIndex = cardOrder.indexOf(cardId);
		if (cardIndex === -1) {
			return null;
		}

		const menu = new Menu();
		menu.addItem((item) => {
			item
				.setTitle("Move to top")
				.setIcon("arrow-up")
				.setDisabled(cardIndex === 0)
				.onClick(() => {
					this.applyCardBoundaryMove(group, cardId, "start");
				});
		});
		menu.addItem((item) => {
			item
				.setTitle("Move to bottom")
				.setIcon("arrow-down")
				.setDisabled(cardIndex === cardOrder.length - 1)
				.onClick(() => {
					this.applyCardBoundaryMove(group, cardId, "end");
				});
		});
		return menu;
	}

	private applyCardBoundaryMove(
		group: BasesEntryGroup,
		cardId: string,
		boundary: "start" | "end",
	): void {
		writeCurrentCardOrder(
			this,
			this.data.groupedData,
			getGroupColumnId(group),
			moveCardToBoundary(getCardOrderForGroup(this, group), cardId, boundary),
		);
	}

	// Column menu building and actions
	private openColumnMenu(
		event: MouseEvent,
		columnEl: HTMLElement,
		columnTitle: string,
	): void {
		this.buildColumnMenu(columnEl, columnTitle)?.showAtMouseEvent(event);
	}

	private handleColumnHeaderKeyDown(
		event: KeyboardEvent,
		headingEl: HTMLElement,
		columnEl: HTMLElement,
		columnTitle: string,
	): void {
		if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();
		const rect = headingEl.getBoundingClientRect();
		this.buildColumnMenu(columnEl, columnTitle)?.showAtPosition({
			x: rect.left,
			y: rect.bottom,
			width: rect.width,
		});
	}

	private buildColumnMenu(
		columnEl: HTMLElement,
		columnTitle: string,
	): Menu | null {
		const boardEl = this.boardEl;
		if (!(boardEl instanceof HTMLElement)) {
			return null;
		}

		const columnId = columnEl.getAttribute(COLUMN_ID_ATTR);
		if (!columnId) {
			return null;
		}

		const columnOrder = this.getRenderedColumnOrder(boardEl);
		const columnIndex = columnOrder.indexOf(columnId);
		const canMoveLeft = columnIndex > 0;
		const canMoveRight =
			columnIndex !== -1 && columnIndex < columnOrder.length - 1;

		const menu = new Menu();
		menu.addItem((item) => {
			item
				.setTitle(`Move ${columnTitle} left`)
				.setIcon("arrow-left")
				.setDisabled(!canMoveLeft)
				.onClick(() => {
					this.moveRenderedColumnByOffset(boardEl, columnId, -1);
				});
		});
		menu.addItem((item) => {
			item
				.setTitle(`Move ${columnTitle} right`)
				.setIcon("arrow-right")
				.setDisabled(!canMoveRight)
				.onClick(() => {
					this.moveRenderedColumnByOffset(boardEl, columnId, 1);
				});
		});
		return menu;
	}

	private moveRenderedColumnByOffset(
		boardEl: HTMLElement,
		columnId: string,
		offset: number,
	): void {
		const columnOrder = this.getRenderedColumnOrder(boardEl);
		this.persistColumnOrder(moveColumnByOffset(columnOrder, columnId, offset));
	}

	private persistColumnOrder(columnOrder: string[]): void {
		writeCurrentColumnOrder(this, columnOrder);
	}

	// Column drag and drop
	private handleColumnDragStart(
		event: DragEvent,
		columnEl: HTMLElement,
	): void {
		event.stopPropagation();
		this.draggedColumnEl = columnEl;
		columnEl.classList.add(COLUMN_DRAGGING_CLASS);

		if (!event.dataTransfer) {
			return;
		}

		event.dataTransfer.effectAllowed = "move";
		event.dataTransfer.setData(
			"text/plain",
			columnEl.getAttribute(COLUMN_ID_ATTR) ?? "",
		);
		const previewEl = this.createDragPreview(
			columnEl,
			"bases-kanban-column--drag-preview",
		);
		event.dataTransfer.setDragImage(previewEl, 24, 24);
	}

	private handleColumnDragEnd(): void {
		this.resetColumnInteractionState();
	}

	private handleBoardDragOver(event: DragEvent, boardEl: HTMLElement): void {
		if (!this.draggedColumnEl) {
			return;
		}

		event.preventDefault();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = "move";
		}

		this.setActiveColumnSlot(this.getNearestColumnSlot(boardEl, event.clientX));
	}

	private handleBoardDrop(event: DragEvent, boardEl: HTMLElement): void {
		if (!this.draggedColumnEl) {
			return;
		}

		event.preventDefault();
		const slotEl =
			this.activeColumnSlotEl ??
			this.getNearestColumnSlot(boardEl, event.clientX);
		const columnId = this.draggedColumnEl.getAttribute(COLUMN_ID_ATTR);
		if (slotEl && columnId) {
			const columnOrder = this.getRenderedColumnOrder(boardEl);
			const sourceIndex = columnOrder.indexOf(columnId);
			const targetSlotIndex = this.getChildIndex(
				boardEl,
				slotEl,
				".bases-kanban-column-drop-slot",
			);

			if (sourceIndex !== -1 && targetSlotIndex !== -1) {
				const insertionIndex =
					targetSlotIndex > sourceIndex
						? targetSlotIndex - 1
						: targetSlotIndex;
				this.persistColumnOrder(
					moveColumnToIndex(columnOrder, columnId, insertionIndex),
				);
			}
		}

		this.setActiveColumnSlot(null);
	}

	private renderColumnDropSlot(parentEl: HTMLElement): void {
		parentEl.createDiv({ cls: "bases-kanban-column-drop-slot" });
	}

	private getRenderedColumnOrder(boardEl: HTMLElement): string[] {
		return Array.from(boardEl.querySelectorAll(":scope > .bases-kanban-column"))
			.filter(
				(columnNode): columnNode is HTMLElement =>
					columnNode instanceof HTMLElement,
			)
			.map((columnEl) => columnEl.getAttribute(COLUMN_ID_ATTR))
			.filter((columnId): columnId is string => columnId !== null);
	}

	private getChildIndex(
		parentEl: HTMLElement,
		childEl: HTMLElement,
		selector: string,
	): number {
		return Array.from(parentEl.querySelectorAll(`:scope > ${selector}`)).indexOf(
			childEl,
		);
	}

	private getNearestColumnSlot(
		boardEl: HTMLElement,
		clientX: number,
	): HTMLElement | null {
		const slots = Array.from(
			boardEl.querySelectorAll(".bases-kanban-column-drop-slot"),
		).filter(
			(slotNode): slotNode is HTMLElement => slotNode instanceof HTMLElement,
		);

		let nearestSlot: HTMLElement | null = null;
		let nearestDistance = Number.POSITIVE_INFINITY;

		for (const slotEl of slots) {
			const rect = slotEl.getBoundingClientRect();
			const slotCenter = rect.left + rect.width / 2;
			const distance = Math.abs(clientX - slotCenter);
			if (distance < nearestDistance) {
				nearestDistance = distance;
				nearestSlot = slotEl;
			}
		}

		return nearestSlot;
	}

	private setActiveColumnSlot(slotEl: HTMLElement | null): void {
		if (this.activeColumnSlotEl === slotEl) {
			return;
		}

		this.activeColumnSlotEl?.classList.remove(COLUMN_DROP_SLOT_ACTIVE_CLASS);
		this.activeColumnSlotEl = slotEl;
		this.activeColumnSlotEl?.classList.add(COLUMN_DROP_SLOT_ACTIVE_CLASS);
	}

	private createDragPreview(
		sourceEl: HTMLElement,
		previewClassName: string,
	): HTMLElement {
		const previewEl = sourceEl.cloneNode(true);
		if (!(previewEl instanceof HTMLElement)) {
			return sourceEl;
		}

		previewEl.classList.remove(COLUMN_DRAGGING_CLASS);
		previewEl.classList.add(DRAG_PREVIEW_CLASS, previewClassName);
		previewEl.style.width = `${sourceEl.getBoundingClientRect().width}px`;

		this.containerEl.ownerDocument.body.appendChild(previewEl);
		requestAnimationFrame(() => previewEl.remove());
		return previewEl;
	}

	private resetColumnInteractionState(): void {
		if (this.draggedColumnEl) {
			this.draggedColumnEl.classList.remove(COLUMN_DRAGGING_CLASS);
		}

		this.setActiveColumnSlot(null);
		this.draggedColumnEl = null;
	}
}
