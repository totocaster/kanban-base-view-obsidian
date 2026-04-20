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

export abstract class Value {
	abstract renderTo(): void;
	abstract toString(): string;
}

export class NullValue extends Value {
	renderTo(): void {}

	toString(): string {
		return "";
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
