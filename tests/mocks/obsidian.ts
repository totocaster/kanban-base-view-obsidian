export class Component {}

export class Plugin extends Component {
	registerBasesView(): boolean {
		return true;
	}
}

export class BasesView extends Component {
	data = {
		groupedData: [],
	};
	app = {
		renderContext: new RenderContext(),
	};

	constructor(controller: unknown) {
		super();
		void controller;
	}
}

export class Keymap {
	static isModEvent(): boolean {
		return false;
	}
}

export class RenderContext {}

export function setIcon(): void {}

export class Menu extends Component {
	static forEvent(): Menu {
		return new Menu();
	}

	addItem(callback: (item: MenuItem) => unknown): this {
		callback(new MenuItem());
		return this;
	}

	addSeparator(): this {
		return this;
	}

	showAtMouseEvent(): this {
		return this;
	}

	showAtPosition(): this {
		return this;
	}
}

export class MenuItem {
	setTitle(): this {
		return this;
	}

	setIcon(): this {
		return this;
	}

	setDisabled(): this {
		return this;
	}

	setWarning(): this {
		return this;
	}

	onClick(): this {
		return this;
	}

	setSubmenu(): Menu {
		return new Menu();
	}
}

export class Modal {
	app: unknown;
	contentEl = {
		empty(): void {},
	};

	constructor(app: unknown) {
		this.app = app;
	}

	open(): void {}

	close(): void {}

	onOpen(): void {}

	onClose(): void {}

	setTitle(): this {
		return this;
	}
}

class ButtonComponent {
	setButtonText(): this {
		return this;
	}

	setCta(): this {
		return this;
	}

	onClick(): this {
		return this;
	}
}

export class TextComponent {
	private value = "";

	inputEl = {
		addEventListener(): void {},
		focus(): void {},
		select(): void {},
	};

	getValue(): string {
		return this.value;
	}

	setPlaceholder(): this {
		return this;
	}

	setValue(value: string): this {
		this.value = value;
		return this;
	}

	onChange(): this {
		return this;
	}
}

export class Setting {
	constructor(containerEl: unknown) {
		void containerEl;
	}

	setName(): this {
		return this;
	}

	addText(callback: (text: TextComponent) => unknown): this {
		callback(new TextComponent());
		return this;
	}

	addButton(callback: (button: ButtonComponent) => unknown): this {
		callback(new ButtonComponent());
		return this;
	}
}

export class Notice {
	constructor(message: string) {
		void message;
	}
}

export abstract class Value {
	abstract renderTo(): void;
	abstract toString(): string;
}

export class NullValue extends Value {
	renderTo(): void {}

	toString(): string {
		return "null";
	}
}

export class DateValue extends Value {
	renderTo(): void {}

	toString(): string {
		return "2026-04-24";
	}
}

export function parsePropertyId(propertyId: string): {
	type: string;
	name: string;
} {
	const [type, ...nameParts] = propertyId.split(".");
	return {
		type,
		name: nameParts.join("."),
	};
}

export function normalizePath(path: string): string {
	return path
		.replace(/\\/g, "/")
		.replace(/\/+/g, "/")
		.replace(/^\//, "")
		.replace(/\/$/, "");
}
