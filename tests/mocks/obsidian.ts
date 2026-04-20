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

	constructor(controller: unknown) {
		super();
		void controller;
	}
}
