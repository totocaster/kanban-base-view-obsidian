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

	onClick(): this {
		return this;
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
