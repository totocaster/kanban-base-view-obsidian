import {
	BasesView,
	DateValue,
	Keymap,
	Menu,
	Notice,
	parsePropertyId,
	setIcon,
} from "obsidian";
import type {
	BasesEntry,
	BasesEntryGroup,
	BasesViewRegistration,
	MenuItem,
	Plugin,
	QueryController,
} from "obsidian";
import {
	clearCardOrders,
	getCardId,
	getCardOrderForGroup,
	getCurrentSortKey,
	getCurrentGroupingKey,
	getKeyboardArrowDirection,
	getKeyboardCardMovePlan,
	getKeyboardFocusCardId,
	getGroupColumnId,
	getOrderedEntriesForGroup,
	getOrderedGroupsForCurrentGrouping,
	type KanbanKeyboardCardMovePlan,
	type KanbanKeyboardDirection,
	type KanbanRenderedColumnOrder,
	moveCardBetweenColumns,
	moveCardToBoundary,
	moveCardToVisibleIndex,
	writeCurrentCardOrder,
	writeCurrentCardOrders,
	moveColumnByOffset,
	moveColumnToIndex,
	writeCurrentColumnOrder,
	KANBAN_EMPTY_COLUMN_ID,
	KANBAN_NULL_COLUMN_ID,
} from "./kanban-ordering";
import { getCardPropertyItems, hasCardPropertyValue } from "./card-properties";
import {
	createCardPreviewText,
	normalizeCardPreviewMode,
	type VisibleCardPreviewMode,
} from "./card-preview";

export const KANBAN_VIEW_TYPE = "kanban";
export const KANBAN_VIEW_NAME = "Kanban";
export const KANBAN_VIEW_ICON = "lucide-columns-3";
export const EMPTY_GROUP_TITLE = "Ungrouped";
const KANBAN_BOARD_LABEL = "Kanban board";
const SHOW_EMPTY_PROPERTIES_KEY = "showEmptyProperties";
const CARD_PREVIEW_KEY = "contentPreview";
const COLUMN_ID_ATTR = "data-column-id";
const CARD_ID_ATTR = "data-card-id";
const COLUMN_DRAGGING_CLASS = "bases-kanban-column--dragging";
const CARD_DRAGGING_CLASS = "bases-kanban-card--dragging";
const CARD_FOCUSED_CLASS = "bases-kanban-card--focused";
const COLUMN_DROP_SLOT_ACTIVE_CLASS = "bases-kanban-drop-slot--active";
const DRAG_PREVIEW_CLASS = "bases-kanban-drag-preview";
const KEYBOARD_CARD_MOVE_ANIMATION_DURATION_MS = 160;
const KEYBOARD_CARD_MOVE_ANIMATION_EASING = "cubic-bezier(0.2, 0, 0, 1)";
let nextBoardLabelId = 0;

type BasesViewRegistrar = Pick<Plugin, "registerBasesView">;
type MenuItemWithSubmenu = MenuItem & {
	setSubmenu?: () => Menu;
};
type CardAnimationRect = Pick<DOMRectReadOnly, "left" | "top">;
type CardPreviewCacheEntry = {
	mtime: number;
	size: number;
	mode: VisibleCardPreviewMode;
	titleText: string;
	text: string | null;
};
export type CardMoveAnimationTransform = {
	translateX: number;
	translateY: number;
};
export type MouseFocusPoint = {
	clientX: number;
	clientY: number;
};

export function getWritableGroupingPropertyName(
	groupingKey: string | null,
): string | null {
	if (groupingKey === null || !groupingKey.startsWith("note.")) {
		return null;
	}

	const { type, name } = parsePropertyId(groupingKey as `note.${string}`);
	const normalizedPropertyName = name.trim();
	if (type !== "note" || normalizedPropertyName.length === 0) {
		return null;
	}

	return normalizedPropertyName;
}

export function applyGroupingValueToFrontmatter(
	frontmatter: Record<string, unknown>,
	propertyName: string,
	columnId: string,
): void {
	if (columnId === KANBAN_NULL_COLUMN_ID) {
		delete frontmatter[propertyName];
		return;
	}

	frontmatter[propertyName] =
		columnId === KANBAN_EMPTY_COLUMN_ID ? "" : columnId;
}

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
			{
				type: "dropdown",
				displayName: "Content preview",
				key: CARD_PREVIEW_KEY,
				default: "none",
				options: {
					none: "None",
					small: "Small",
					large: "Large",
				},
			},
		],
	};
}

export function registerKanbanView(plugin: BasesViewRegistrar): void {
	plugin.registerBasesView(KANBAN_VIEW_TYPE, createKanbanViewRegistration());
}

export function getCardMoveAnimationTransforms(
	beforeRects: Map<string, CardAnimationRect>,
	afterRects: Map<string, CardAnimationRect>,
): Map<string, CardMoveAnimationTransform> {
	const transforms = new Map<string, CardMoveAnimationTransform>();

	for (const [cardId, afterRect] of afterRects) {
		const beforeRect = beforeRects.get(cardId);
		if (!beforeRect) {
			continue;
		}

		const translateX = beforeRect.left - afterRect.left;
		const translateY = beforeRect.top - afterRect.top;
		if (Math.abs(translateX) < 0.5 && Math.abs(translateY) < 0.5) {
			continue;
		}

		transforms.set(cardId, { translateX, translateY });
	}

	return transforms;
}

export function shouldReleaseMouseFocusSuppression(
	suppressedPoint: MouseFocusPoint | null,
	mousePoint: MouseFocusPoint,
	eventType: string,
): boolean {
	if (suppressedPoint === null) {
		return eventType === "mousemove";
	}

	return (
		suppressedPoint.clientX !== mousePoint.clientX ||
		suppressedPoint.clientY !== mousePoint.clientY
	);
}

export function shouldPreventCardTitleMouseDownDefault(
	mouseButton: number,
	canReorderCards: boolean,
): boolean {
	return mouseButton === 0 && !canReorderCards;
}

class BasesKanbanScaffoldView extends BasesView {
	readonly type = KANBAN_VIEW_TYPE;
	private readonly containerEl: HTMLElement;
	private readonly boardLabelId = `bases-kanban-board-label-${nextBoardLabelId++}`;
	private boardEl: HTMLElement | null = null;
	private draggedColumnEl: HTMLElement | null = null;
	private activeColumnSlotEl: HTMLElement | null = null;
	private draggedCardEl: HTMLElement | null = null;
	private draggedCardSourceColumnId: string | null = null;
	private activeCardSlotEl: HTMLElement | null = null;
	private focusedCardEl: HTMLElement | null = null;
	private focusedCardId: string | null = null;
	private pendingFocusCardId: string | null = null;
	private pendingKeyboardCardMoveRects: Map<string, CardAnimationRect> | null = null;
	private isKeyboardCardMoveAnimationReady = false;
	private isMouseFocusSuppressed = false;
	private lastMouseFocusPoint: MouseFocusPoint | null = null;
	private suppressedMouseFocusPoint: MouseFocusPoint | null = null;
	private lastObservedSortKey: string | null = null;
	private previewRenderGeneration = 0;
	private readonly cardPreviewCache = new Map<string, CardPreviewCacheEntry>();

	constructor(controller: QueryController, parentEl: HTMLElement) {
		super(controller);
		this.containerEl = parentEl.createDiv({ cls: "bases-kanban-view" });
	}

	onDataUpdated(): void {
		this.previewRenderGeneration += 1;
		this.syncCardOrdersWithCurrentSort();
		this.resetColumnInteractionState();
		this.resetCardInteractionState();
		const focusCardId = this.pendingFocusCardId ?? this.focusedCardId;
		this.focusedCardEl = null;
		this.containerEl.empty();
		this.boardEl = null;

		const boardEl = this.containerEl.createDiv({ cls: "bases-kanban-board" });
		this.boardEl = boardEl;
		boardEl.tabIndex = 0;
		boardEl.setAttribute("aria-labelledby", this.boardLabelId);
		boardEl.createSpan({
			text: KANBAN_BOARD_LABEL,
			attr: {
				id: this.boardLabelId,
				hidden: true,
			},
		});
		boardEl.addEventListener("keydown", (event) => {
			void this.handleBoardKeyDown(event);
		});
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
		if (focusCardId !== null) {
			this.focusRenderedCardById(focusCardId);
		}
		this.pendingFocusCardId = null;
		this.animatePendingKeyboardCardMove();
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
				this.openColumnMenu(event, columnEl);
			});
			headingEl.addEventListener("keydown", (event) => {
				this.handleColumnHeaderKeyDown(event, headingEl, columnEl);
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
		if (canReorderCards) {
			cardsEl.addEventListener("dragover", (event) => {
				this.handleCardListDragOver(event, cardsEl);
			});
			cardsEl.addEventListener("drop", (event) => {
				void this.handleCardListDrop(event, cardsEl);
			});
			this.renderCardDropSlot(cardsEl);
		}

		if (group.entries.length === 0) {
			columnEl.createEl("p", {
				cls: "bases-kanban-empty",
				text: "No notes in this group.",
			});
			return;
		}

		for (const entry of getOrderedEntriesForGroup(this, group)) {
			this.renderCard(cardsEl, group, entry, canReorderCards);
			if (canReorderCards) {
				this.renderCardDropSlot(cardsEl);
			}
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
		const cardId = getCardId(entry);
		cardEl.setAttribute(CARD_ID_ATTR, cardId);
		cardEl.tabIndex = 0;
		cardEl.addEventListener("mouseover", (event) => {
			this.handleCardMouseFocus(event, cardEl);
		});
		cardEl.addEventListener("mousemove", (event) => {
			this.handleCardMouseFocus(event, cardEl);
		});
		cardEl.addEventListener("focusin", () => {
			this.setFocusedCard(cardEl);
		});
		cardEl.addEventListener("focusout", () => {
			if (this.focusedCardEl === cardEl) {
				this.setFocusedCard(null);
			}
		});
		cardEl.addEventListener("keydown", (event) => {
			if (event.key !== "Enter" && event.key !== " ") {
				return;
			}

			event.preventDefault();
			event.stopPropagation();
			this.openEntry(event, entry);
		});
		const titleEl = cardEl.createEl("button", {
			cls: "bases-kanban-card-link",
			attr: {
				type: "button",
			},
		});
		titleEl.tabIndex = -1;
		titleEl.setText(entry.file.basename);
		titleEl.addEventListener("mousedown", (event) => {
			if (event.button !== 0) {
				return;
			}

			if (
				shouldPreventCardTitleMouseDownDefault(
					event.button,
					canReorderCards,
				)
			) {
				event.preventDefault();
			}
			this.focusCardElement(cardEl, { preventScroll: true });
		});
		titleEl.onClickEvent((event) => {
			event.preventDefault();
			event.stopPropagation();
			this.openEntry(event, entry);
		});
		if (canReorderCards) {
			cardEl.draggable = true;
			cardEl.addEventListener("dragstart", (event) => {
				this.handleCardDragStart(event, cardEl);
			});
			cardEl.addEventListener("dragend", () => {
				this.handleCardDragEnd();
			});
			cardEl.addEventListener("contextmenu", (event) => {
				event.preventDefault();
				event.stopPropagation();
				this.openCardOrderMenu(event, group, entry);
			});
			cardEl.addEventListener("keydown", (event) => {
				this.handleCardOrderKeyDown(event, cardEl, group, entry);
			});
		}
		titleEl.draggable = false;

		this.renderCardProperties(cardEl, entry);
		this.renderCardPreview(cardEl, entry);
	}

	private openEntry(event: MouseEvent | KeyboardEvent, entry: BasesEntry): void {
		void this.app.workspace.openLinkText(
			entry.file.path,
			"",
			Keymap.isModEvent(event),
		);
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

	private renderCardPreview(cardEl: HTMLElement, entry: BasesEntry): void {
		const previewMode = this.getCardPreviewMode();
		if (previewMode === "none") {
			return;
		}

		const cachedPreviewText = this.getCachedCardPreviewText(entry, previewMode);
		if (cachedPreviewText !== undefined) {
			this.appendCardPreview(cardEl, previewMode, cachedPreviewText);
			return;
		}

		const renderGeneration = this.previewRenderGeneration;
		const stalePreviewText = this.getStaleCardPreviewText(entry, previewMode);
		if (stalePreviewText !== undefined) {
			const previewEl = this.appendCardPreview(
				cardEl,
				previewMode,
				stalePreviewText,
			);
			this.refreshCardPreview(cardEl, previewEl, entry, previewMode, renderGeneration);
			return;
		}

		this.refreshCardPreview(cardEl, null, entry, previewMode, renderGeneration);
	}

	private appendCardPreview(
		cardEl: HTMLElement,
		mode: VisibleCardPreviewMode,
		previewText: string | null,
	): HTMLElement | null {
		if (previewText === null) {
			return null;
		}

		const previewEl = cardEl.createDiv({
			cls: "bases-kanban-card-preview",
		});
		previewEl.addClass(`bases-kanban-card-preview--${mode}`);
		previewEl.setText(previewText);
		return previewEl;
	}

	private refreshCardPreview(
		cardEl: HTMLElement,
		previewEl: HTMLElement | null,
		entry: BasesEntry,
		mode: VisibleCardPreviewMode,
		renderGeneration: number,
	): void {
		void this.readCardPreviewText(entry, mode)
			.then((previewText) => {
				if (this.previewRenderGeneration !== renderGeneration || !cardEl.isConnected) {
					return;
				}

				if (previewText === null) {
					previewEl?.remove();
					return;
				}

				if (previewEl) {
					previewEl.setText(previewText);
					return;
				}

				this.appendCardPreview(cardEl, mode, previewText);
			})
			.catch(() => undefined);
	}

	private getCachedCardPreviewText(
		entry: BasesEntry,
		mode: VisibleCardPreviewMode,
	): string | null | undefined {
		const { file } = entry;
		const cachedPreview = this.cardPreviewCache.get(file.path);
		if (
			cachedPreview &&
			cachedPreview.mtime === file.stat.mtime &&
			cachedPreview.size === file.stat.size &&
			cachedPreview.mode === mode &&
			cachedPreview.titleText === file.basename
		) {
			return cachedPreview.text;
		}

		return undefined;
	}

	private getStaleCardPreviewText(
		entry: BasesEntry,
		mode: VisibleCardPreviewMode,
	): string | null | undefined {
		const { file } = entry;
		const cachedPreview = this.cardPreviewCache.get(file.path);
		if (
			cachedPreview &&
			cachedPreview.mode === mode &&
			cachedPreview.titleText === file.basename
		) {
			return cachedPreview.text;
		}

		return undefined;
	}

	private async readCardPreviewText(
		entry: BasesEntry,
		mode: VisibleCardPreviewMode,
	): Promise<string | null> {
		const cachedPreviewText = this.getCachedCardPreviewText(entry, mode);
		if (cachedPreviewText !== undefined) {
			return cachedPreviewText;
		}

		const { file } = entry;
		const markdown = await this.app.vault.cachedRead(file);
		const previewText = createCardPreviewText(markdown, mode, file.basename);
		this.cardPreviewCache.set(file.path, {
			mtime: file.stat.mtime,
			size: file.stat.size,
			mode,
			titleText: file.basename,
			text: previewText,
		});

		return previewText;
	}

	private getCardPreviewMode(): "none" | VisibleCardPreviewMode {
		return normalizeCardPreviewMode(this.config.get(CARD_PREVIEW_KEY));
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

	// Card keyboard focus and moves
	private async handleBoardKeyDown(event: KeyboardEvent): Promise<void> {
		const direction = getKeyboardArrowDirection(event.key);
		if (direction === null) {
			return;
		}

		if (this.isCardMoveKeyboardEvent(event)) {
			await this.handleKeyboardCardMove(event, direction);
			return;
		}

		if (this.hasKeyboardFocusModifier(event)) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();
		const targetCardId = getKeyboardFocusCardId(
			this.getRenderedKeyboardBoard(),
			this.getKeyboardEventCardId(event),
			direction,
		);
		if (targetCardId !== null) {
			this.suppressMouseFocusUntilPointerMoves();
			this.focusRenderedCardById(targetCardId);
		}
	}

	private async handleKeyboardCardMove(
		event: KeyboardEvent,
		direction: KanbanKeyboardDirection,
	): Promise<void> {
		if (getCurrentGroupingKey(this) === null) {
			return;
		}

		const cardId = this.getKeyboardEventCardId(event);
		if (cardId === null) {
			return;
		}

		const boardOrder = this.getRenderedKeyboardBoard();
		const movePlan = getKeyboardCardMovePlan(boardOrder, cardId, direction, {
			sendToBoundary: event.altKey,
		});
		if (movePlan.type === "none") {
			return;
		}
		if (
			movePlan.type === "cross-column" &&
			this.getWritableGroupingPropertyNameForMoves() === null
		) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();
		this.suppressMouseFocusUntilPointerMoves();
		this.pendingFocusCardId = cardId;
		this.focusedCardId = cardId;

		if (movePlan.type === "same-column") {
			this.applyKeyboardSameColumnCardMove(
				movePlan,
				boardOrder,
				direction,
				event.altKey,
			);
			return;
		}

		await this.applyKeyboardCrossColumnCardMove(movePlan, boardOrder);
	}

	private applyKeyboardSameColumnCardMove(
		movePlan: Extract<KanbanKeyboardCardMovePlan, { type: "same-column" }>,
		boardOrder: KanbanRenderedColumnOrder[],
		direction: KanbanKeyboardDirection,
		sendToBoundary: boolean,
	): void {
		const group = this.getRenderedGroup(movePlan.columnId);
		const visibleCardOrder = boardOrder[movePlan.columnIndex]?.cardIds ?? [];
		if (!group || visibleCardOrder.length === 0) {
			return;
		}

		const cardOrder = getCardOrderForGroup(this, group);
		const nextCardOrder =
			sendToBoundary && (direction === "up" || direction === "down")
				? moveCardToBoundary(
						cardOrder,
						movePlan.cardId,
						direction === "up" ? "start" : "end",
					)
				: moveCardToVisibleIndex(
						cardOrder,
						visibleCardOrder,
						movePlan.cardId,
						movePlan.targetVisibleIndex,
					);

		this.pendingKeyboardCardMoveRects = this.captureRenderedCardRects();
		this.isKeyboardCardMoveAnimationReady = true;
		const didWrite = writeCurrentCardOrder(
			this,
			this.data.groupedData,
			movePlan.columnId,
			nextCardOrder,
		);
		if (!didWrite) {
			this.clearPendingKeyboardCardMoveAnimation();
		}
		this.focusRenderedCardById(movePlan.cardId);
	}

	private async applyKeyboardCrossColumnCardMove(
		movePlan: Extract<KanbanKeyboardCardMovePlan, { type: "cross-column" }>,
		boardOrder: KanbanRenderedColumnOrder[],
	): Promise<void> {
		const sourceGroup = this.getRenderedGroup(movePlan.sourceColumnId);
		const targetGroup = this.getRenderedGroup(movePlan.targetColumnId);
		const targetVisibleCardOrder =
			boardOrder[movePlan.targetColumnIndex]?.cardIds ?? [];
		if (!sourceGroup || !targetGroup) {
			return;
		}

		const sourceCardOrder = getCardOrderForGroup(this, sourceGroup);
		if (!sourceCardOrder.includes(movePlan.cardId)) {
			return;
		}

		this.pendingKeyboardCardMoveRects = this.captureRenderedCardRects();
		this.isKeyboardCardMoveAnimationReady = false;
		const didMove = await this.handleCrossColumnCardDrop({
			cardId: movePlan.cardId,
			sourceColumnId: movePlan.sourceColumnId,
			targetColumnId: movePlan.targetColumnId,
			groupedData: [...this.data.groupedData],
			sourceCardOrder,
			targetCardOrder: getCardOrderForGroup(this, targetGroup),
			targetVisibleCardOrder,
			targetSlotIndex: movePlan.targetVisibleIndex,
			beforePersistCardOrders: () => {
				this.isKeyboardCardMoveAnimationReady = true;
			},
		});
		if (!didMove) {
			this.clearPendingKeyboardCardMoveAnimation();
		}
		this.focusRenderedCardById(movePlan.cardId);
	}

	private isCardMoveKeyboardEvent(event: KeyboardEvent): boolean {
		return !event.shiftKey && Boolean(Keymap.isModEvent(event));
	}

	private hasKeyboardFocusModifier(event: KeyboardEvent): boolean {
		return event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
	}

	private getKeyboardEventCardId(event: KeyboardEvent): string | null {
		const target = event.target;
		if (target instanceof Element) {
			const cardId = target
				.closest<HTMLElement>(".bases-kanban-card")
				?.getAttribute(CARD_ID_ATTR);
			if (cardId) {
				return cardId;
			}
		}

		return this.focusedCardId;
	}

	private getRenderedKeyboardBoard(): KanbanRenderedColumnOrder[] {
		const boardEl = this.boardEl;
		if (!(boardEl instanceof HTMLElement)) {
			return [];
		}

		return Array.from(boardEl.querySelectorAll(":scope > .bases-kanban-column"))
			.filter(
				(columnNode): columnNode is HTMLElement =>
					columnNode instanceof HTMLElement,
			)
			.map((columnEl) => ({
				columnId: columnEl.getAttribute(COLUMN_ID_ATTR) ?? "",
				cardIds: this.getRenderedCardOrder(columnEl),
			}))
			.filter((column) => column.columnId.length > 0);
	}

	private captureRenderedCardRects(): Map<string, CardAnimationRect> {
		const cardRects = new Map<string, CardAnimationRect>();
		for (const cardEl of this.getRenderedCardElements()) {
			const cardId = cardEl.getAttribute(CARD_ID_ATTR);
			if (!cardId) {
				continue;
			}

			const rect = cardEl.getBoundingClientRect();
			cardRects.set(cardId, {
				left: rect.left,
				top: rect.top,
			});
		}

		return cardRects;
	}

	private animatePendingKeyboardCardMove(): void {
		const beforeRects = this.pendingKeyboardCardMoveRects;
		if (!beforeRects || !this.isKeyboardCardMoveAnimationReady) {
			return;
		}

		this.clearPendingKeyboardCardMoveAnimation();
		if (this.shouldReduceMotion()) {
			return;
		}

		const afterRects = this.captureRenderedCardRects();
		const transforms = getCardMoveAnimationTransforms(beforeRects, afterRects);
		if (transforms.size === 0) {
			return;
		}

		for (const cardEl of this.getRenderedCardElements()) {
			const cardId = cardEl.getAttribute(CARD_ID_ATTR);
			const transform = cardId ? transforms.get(cardId) : undefined;
			if (!transform) {
				continue;
			}

			cardEl.animate(
				[
					{
						transform: `translate(${transform.translateX}px, ${transform.translateY}px)`,
					},
					{ transform: "translate(0, 0)" },
				],
				{
					duration: KEYBOARD_CARD_MOVE_ANIMATION_DURATION_MS,
					easing: KEYBOARD_CARD_MOVE_ANIMATION_EASING,
				},
			);
		}
	}

	private clearPendingKeyboardCardMoveAnimation(): void {
		this.pendingKeyboardCardMoveRects = null;
		this.isKeyboardCardMoveAnimationReady = false;
	}

	private shouldReduceMotion(): boolean {
		const window = this.containerEl.ownerDocument.defaultView;
		return (
			window?.matchMedia("(prefers-reduced-motion: reduce)").matches ?? false
		);
	}

	private getRenderedCardElements(): HTMLElement[] {
		const boardEl = this.boardEl;
		if (!(boardEl instanceof HTMLElement)) {
			return [];
		}

		return Array.from(boardEl.querySelectorAll(".bases-kanban-card")).filter(
			(cardNode): cardNode is HTMLElement => cardNode instanceof HTMLElement,
		);
	}

	private focusRenderedCardById(cardId: string): boolean {
		const cardEl = this.getRenderedCardElements().find(
			(candidate) => candidate.getAttribute(CARD_ID_ATTR) === cardId,
		);
		if (!cardEl) {
			return false;
		}

		this.focusCardElement(cardEl);
		return true;
	}

	private handleCardMouseFocus(event: MouseEvent, cardEl: HTMLElement): void {
		const mousePoint = this.getMouseFocusPoint(event);
		if (this.isMouseFocusSuppressed) {
			if (
				!shouldReleaseMouseFocusSuppression(
					this.suppressedMouseFocusPoint,
					mousePoint,
					event.type,
				)
			) {
				return;
			}

			this.isMouseFocusSuppressed = false;
			this.suppressedMouseFocusPoint = null;
		}

		this.lastMouseFocusPoint = mousePoint;
		this.focusCardElement(cardEl, { preventScroll: true });
	}

	private suppressMouseFocusUntilPointerMoves(): void {
		this.isMouseFocusSuppressed = true;
		this.suppressedMouseFocusPoint = this.lastMouseFocusPoint;
	}

	private getMouseFocusPoint(event: MouseEvent): MouseFocusPoint {
		return {
			clientX: event.clientX,
			clientY: event.clientY,
		};
	}

	private focusCardElement(
		cardEl: HTMLElement,
		options: { preventScroll?: boolean } = {},
	): void {
		if (cardEl.ownerDocument.activeElement !== cardEl) {
			cardEl.focus({ preventScroll: true });
		}
		this.setFocusedCard(cardEl);
		if (!options.preventScroll) {
			cardEl.scrollIntoView({ block: "nearest", inline: "nearest" });
		}
	}

	private setFocusedCard(cardEl: HTMLElement | null): void {
		if (this.focusedCardEl === cardEl) {
			return;
		}

		this.focusedCardEl?.classList.remove(CARD_FOCUSED_CLASS);
		this.focusedCardEl = cardEl;
		this.focusedCardId = cardEl?.getAttribute(CARD_ID_ATTR) ?? null;
		this.focusedCardEl?.classList.add(CARD_FOCUSED_CLASS);
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
		targetEl: HTMLElement,
		group: BasesEntryGroup,
		entry: BasesEntry,
	): void {
		if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();
		const rect = targetEl.getBoundingClientRect();
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
				.setTitle("Send to top")
				.setIcon("arrow-up")
				.setDisabled(cardIndex === 0)
				.onClick(() => {
					this.applyCardBoundaryMove(group, cardId, "start");
				});
		});
		menu.addItem((item) => {
			item
				.setTitle("Send to bottom")
				.setIcon("arrow-down")
				.setDisabled(cardIndex === cardOrder.length - 1)
				.onClick(() => {
					this.applyCardBoundaryMove(group, cardId, "end");
				});
		});
		const targetGroups = getOrderedGroupsForCurrentGrouping(
			this,
			this.data.groupedData,
		).filter(
			(targetGroup) => getGroupColumnId(targetGroup) !== getGroupColumnId(group),
		);
		if (
			targetGroups.length > 0 &&
			this.getWritableGroupingPropertyNameForMoves() !== null
		) {
			menu.addSeparator();
			this.addCardColumnMoveMenu(menu, group, entry, targetGroups);
		}
		return menu;
	}

	private addCardColumnMoveMenu(
		menu: Menu,
		sourceGroup: BasesEntryGroup,
		entry: BasesEntry,
		targetGroups: BasesEntryGroup[],
	): void {
		menu.addItem((item) => {
			const submenu = this.getMenuItemSubmenu(item);
			item
				.setTitle(submenu ? "Move to column" : "Move to column...")
				.setIcon("columns-3");

			if (submenu) {
				this.addCardColumnMoveMenuItems(
					submenu,
					sourceGroup,
					entry,
					targetGroups,
				);
				return;
			}

			item.onClick((event) => {
				this.openCardColumnMoveMenu(event, sourceGroup, entry, targetGroups);
			});
		});
	}

	private getMenuItemSubmenu(item: MenuItem): Menu | null {
		const itemWithSubmenu: MenuItemWithSubmenu = item;
		return typeof itemWithSubmenu.setSubmenu === "function"
			? itemWithSubmenu.setSubmenu()
			: null;
	}

	private openCardColumnMoveMenu(
		event: MouseEvent | KeyboardEvent,
		sourceGroup: BasesEntryGroup,
		entry: BasesEntry,
		targetGroups: BasesEntryGroup[],
	): void {
		const columnMenu = new Menu();
		this.addCardColumnMoveMenuItems(
			columnMenu,
			sourceGroup,
			entry,
			targetGroups,
		);

		if (event instanceof MouseEvent) {
			columnMenu.showAtMouseEvent(event);
			return;
		}

		const targetEl = event.currentTarget;
		if (targetEl instanceof HTMLElement) {
			const rect = targetEl.getBoundingClientRect();
			columnMenu.showAtPosition({
				x: rect.left,
				y: rect.bottom,
				width: rect.width,
			});
			return;
		}

		columnMenu.showAtPosition({ x: 0, y: 0 });
	}

	private addCardColumnMoveMenuItems(
		menu: Menu,
		sourceGroup: BasesEntryGroup,
		entry: BasesEntry,
		targetGroups: BasesEntryGroup[],
	): void {
		for (const targetGroup of targetGroups) {
			menu.addItem((item) => {
				item.setTitle(getGroupTitle(targetGroup)).onClick(() => {
					void this.applyCardColumnMove(sourceGroup, targetGroup, entry);
				});
			});
		}
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
	): void {
		this.buildColumnMenu(columnEl)?.showAtMouseEvent(event);
	}

	private handleColumnHeaderKeyDown(
		event: KeyboardEvent,
		headingEl: HTMLElement,
		columnEl: HTMLElement,
	): void {
		if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();
		const rect = headingEl.getBoundingClientRect();
		this.buildColumnMenu(columnEl)?.showAtPosition({
			x: rect.left,
			y: rect.bottom,
			width: rect.width,
		});
	}

	private buildColumnMenu(columnEl: HTMLElement): Menu | null {
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
				.setTitle("Send left")
				.setIcon("arrow-left")
				.setDisabled(!canMoveLeft)
				.onClick(() => {
					this.moveRenderedColumnByOffset(boardEl, columnId, -1);
				});
		});
		menu.addItem((item) => {
			item
				.setTitle("Send right")
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

	// Card drag and drop
	private handleCardDragStart(event: DragEvent, cardEl: HTMLElement): void {
		event.stopPropagation();
		this.draggedCardEl = cardEl;
		this.draggedCardSourceColumnId =
			cardEl
				.closest<HTMLElement>(".bases-kanban-column")
				?.getAttribute(COLUMN_ID_ATTR) ?? null;
		cardEl.classList.add(CARD_DRAGGING_CLASS);

		if (!event.dataTransfer) {
			return;
		}

		event.dataTransfer.effectAllowed = "move";
		event.dataTransfer.setData(
			"text/plain",
			cardEl.getAttribute(CARD_ID_ATTR) ?? "",
		);
		const previewEl = this.createDragPreview(
			cardEl,
			"bases-kanban-card--drag-preview",
		);
		event.dataTransfer.setDragImage(previewEl, 16, 16);
	}

	private handleCardDragEnd(): void {
		this.resetCardInteractionState();
	}

	private handleCardListDragOver(
		event: DragEvent,
		cardsEl: HTMLElement,
	): void {
		if (!this.draggedCardEl) {
			return;
		}

		const targetColumnId = cardsEl
			.closest<HTMLElement>(".bases-kanban-column")
			?.getAttribute(COLUMN_ID_ATTR) ?? null;
		if (!this.canDropDraggedCardInColumn(targetColumnId)) {
			this.setActiveCardSlot(null);
			return;
		}

		event.preventDefault();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = "move";
		}

		this.setActiveCardSlot(this.getNearestCardSlot(cardsEl, event.clientY));
	}

	private async handleCardListDrop(
		event: DragEvent,
		cardsEl: HTMLElement,
	): Promise<void> {
		if (!this.draggedCardEl) {
			return;
		}

		event.preventDefault();
		const slotEl =
			this.activeCardSlotEl ?? this.getNearestCardSlot(cardsEl, event.clientY);
		this.setActiveCardSlot(null);
		if (!slotEl) {
			return;
		}

		const cardId = this.draggedCardEl.getAttribute(CARD_ID_ATTR);
		const sourceColumnEl = this.draggedCardEl.closest<HTMLElement>(
			".bases-kanban-column",
		);
		const targetColumnEl = cardsEl.closest<HTMLElement>(".bases-kanban-column");
		const sourceColumnId = sourceColumnEl?.getAttribute(COLUMN_ID_ATTR);
		const targetColumnId = targetColumnEl?.getAttribute(COLUMN_ID_ATTR);
		if (
			!cardId ||
			!sourceColumnEl ||
			!targetColumnEl ||
			!sourceColumnId ||
			!targetColumnId
		) {
			return;
		}

		const sourceGroup = this.getRenderedGroup(sourceColumnId);
		const targetGroup = this.getRenderedGroup(targetColumnId);
		if (!sourceGroup || !targetGroup) {
			return;
		}

		const sourceVisibleCardOrder = this.getRenderedCardOrder(sourceColumnEl);
		const sourceVisibleIndex = sourceVisibleCardOrder.indexOf(cardId);
		const targetSlotIndex = this.getChildIndex(
			cardsEl,
			slotEl,
			".bases-kanban-card-drop-slot",
		);
		if (sourceVisibleIndex === -1 || targetSlotIndex === -1) {
			return;
		}

		const groupedData = [...this.data.groupedData];
		const sourceCardOrder = getCardOrderForGroup(this, sourceGroup);
		if (!sourceCardOrder.includes(cardId)) {
			return;
		}

		if (sourceColumnId === targetColumnId) {
			this.handleSameColumnCardDrop({
				cardId,
				columnId: sourceColumnId,
				groupedData,
				sourceCardOrder,
				sourceVisibleCardOrder,
				sourceVisibleIndex,
				targetSlotIndex,
			});
			return;
		}

		const targetCardOrder = getCardOrderForGroup(this, targetGroup);
		const targetVisibleCardOrder = this.getRenderedCardOrder(targetColumnEl);
		await this.handleCrossColumnCardDrop({
			cardId,
			sourceColumnId,
			targetColumnId,
			groupedData,
			sourceCardOrder,
			targetCardOrder,
			targetVisibleCardOrder,
			targetSlotIndex,
		});
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

		previewEl.classList.remove(COLUMN_DRAGGING_CLASS, CARD_DRAGGING_CLASS);
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

	private renderCardDropSlot(parentEl: HTMLElement): void {
		parentEl.createEl("li", {
			cls: "bases-kanban-card-drop-slot",
			attr: {
				"aria-hidden": "true",
			},
		});
	}

	private handleSameColumnCardDrop(params: {
		cardId: string;
		columnId: string;
		groupedData: BasesEntryGroup[];
		sourceCardOrder: string[];
		sourceVisibleCardOrder: string[];
		sourceVisibleIndex: number;
		targetSlotIndex: number;
	}): void {
		const {
			cardId,
			columnId,
			groupedData,
			sourceCardOrder,
			sourceVisibleCardOrder,
			sourceVisibleIndex,
			targetSlotIndex,
		} = params;
		let targetVisibleIndex = targetSlotIndex;
		if (targetSlotIndex > sourceVisibleIndex) {
			targetVisibleIndex -= 1;
		}

		writeCurrentCardOrder(
			this,
			groupedData,
			columnId,
			moveCardToVisibleIndex(
				sourceCardOrder,
				sourceVisibleCardOrder,
				cardId,
				targetVisibleIndex,
			),
		);
	}

	private async handleCrossColumnCardDrop(params: {
		cardId: string;
		sourceColumnId: string;
		targetColumnId: string;
		groupedData: BasesEntryGroup[];
		sourceCardOrder: string[];
		targetCardOrder: string[];
		targetVisibleCardOrder: string[];
		targetSlotIndex: number;
		beforePersistCardOrders?: () => void;
	}): Promise<boolean> {
		const {
			cardId,
			sourceColumnId,
			targetColumnId,
			groupedData,
			sourceCardOrder,
			targetCardOrder,
			targetVisibleCardOrder,
			targetSlotIndex,
			beforePersistCardOrders,
		} = params;
		const targetPropertyName = this.getWritableGroupingPropertyNameForMoves();
		if (targetPropertyName === null) {
			return false;
		}

		const {
			sourceCardOrder: nextSourceCardOrder,
			targetCardOrder: nextTargetCardOrder,
		} = moveCardBetweenColumns(
			sourceCardOrder,
			targetCardOrder,
			targetVisibleCardOrder,
			cardId,
			targetSlotIndex,
		);

		try {
			await this.persistCardGroupChange(cardId, targetPropertyName, targetColumnId);
		} catch {
			new Notice("Couldn't move that note to the new group.");
			return false;
		}

		beforePersistCardOrders?.();
		writeCurrentCardOrders(this, groupedData, {
			[sourceColumnId]: nextSourceCardOrder,
			[targetColumnId]: nextTargetCardOrder,
		});
		return true;
	}

	private async applyCardColumnMove(
		sourceGroup: BasesEntryGroup,
		targetGroup: BasesEntryGroup,
		entry: BasesEntry,
	): Promise<void> {
		const cardId = getCardId(entry);
		const sourceColumnId = getGroupColumnId(sourceGroup);
		const targetColumnId = getGroupColumnId(targetGroup);
		if (sourceColumnId === targetColumnId) {
			return;
		}

		const sourceCardOrder = getCardOrderForGroup(this, sourceGroup);
		if (!sourceCardOrder.includes(cardId)) {
			return;
		}

		const targetVisibleCardOrder = getOrderedEntriesForGroup(
			this,
			targetGroup,
		).map((targetEntry) => getCardId(targetEntry));

		await this.handleCrossColumnCardDrop({
			cardId,
			sourceColumnId,
			targetColumnId,
			groupedData: [...this.data.groupedData],
			sourceCardOrder,
			targetCardOrder: getCardOrderForGroup(this, targetGroup),
			targetVisibleCardOrder,
			targetSlotIndex: targetVisibleCardOrder.length,
		});
	}

	private getRenderedGroup(columnId: string): BasesEntryGroup | undefined {
		return this.data.groupedData.find(
			(group) => getGroupColumnId(group) === columnId,
		);
	}

	private canDropDraggedCardInColumn(targetColumnId: string | null): boolean {
		const sourceColumnId =
			this.draggedCardSourceColumnId ??
			this.draggedCardEl
				?.closest<HTMLElement>(".bases-kanban-column")
				?.getAttribute(COLUMN_ID_ATTR) ??
			null;
		if (!sourceColumnId || !targetColumnId) {
			return false;
		}

		return (
			sourceColumnId === targetColumnId ||
			this.getWritableGroupingPropertyNameForMoves() !== null
		);
	}

	private getWritableGroupingPropertyNameForMoves(): string | null {
		return getWritableGroupingPropertyName(getCurrentGroupingKey(this));
	}

	private async persistCardGroupChange(
		cardId: string,
		propertyName: string,
		targetColumnId: string,
	): Promise<void> {
		const entry = this.data.data.find(
			(candidate) => getCardId(candidate) === cardId,
		);
		if (!entry) {
			return;
		}

		await this.app.fileManager.processFrontMatter(
			entry.file,
			(frontmatter: Record<string, unknown>) => {
				applyGroupingValueToFrontmatter(
					frontmatter,
					propertyName,
					targetColumnId,
				);
			},
		);
	}

	private getRenderedCardOrder(columnEl: HTMLElement): string[] {
		return Array.from(
			columnEl.querySelectorAll(
				":scope > .bases-kanban-cards > .bases-kanban-card",
			),
		)
			.filter(
				(cardNode): cardNode is HTMLElement => cardNode instanceof HTMLElement,
			)
			.map((cardEl) => cardEl.getAttribute(CARD_ID_ATTR))
			.filter((cardId): cardId is string => cardId !== null);
	}

	private getNearestCardSlot(
		cardsEl: HTMLElement,
		clientY: number,
	): HTMLElement | null {
		const slots = Array.from(
			cardsEl.querySelectorAll(".bases-kanban-card-drop-slot"),
		).filter(
			(slotNode): slotNode is HTMLElement => slotNode instanceof HTMLElement,
		);

		let nearestSlot: HTMLElement | null = null;
		let nearestDistance = Number.POSITIVE_INFINITY;

		for (const slotEl of slots) {
			const rect = slotEl.getBoundingClientRect();
			const slotCenter = rect.top + rect.height / 2;
			const distance = Math.abs(clientY - slotCenter);
			if (distance < nearestDistance) {
				nearestDistance = distance;
				nearestSlot = slotEl;
			}
		}

		return nearestSlot;
	}

	private setActiveCardSlot(slotEl: HTMLElement | null): void {
		if (this.activeCardSlotEl === slotEl) {
			return;
		}

		this.activeCardSlotEl?.classList.remove(COLUMN_DROP_SLOT_ACTIVE_CLASS);
		this.activeCardSlotEl = slotEl;
		this.activeCardSlotEl?.classList.add(COLUMN_DROP_SLOT_ACTIVE_CLASS);
	}

	private resetCardInteractionState(): void {
		if (this.draggedCardEl) {
			this.draggedCardEl.classList.remove(CARD_DRAGGING_CLASS);
		}

		this.setActiveCardSlot(null);
		this.draggedCardSourceColumnId = null;
		this.draggedCardEl = null;
	}
}
