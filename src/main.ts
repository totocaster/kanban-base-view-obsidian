import { Plugin } from "obsidian";
import { registerKanbanView } from "./kanban-view";

export default class BasesKanbanViewPlugin extends Plugin {
	async onload(): Promise<void> {
		registerKanbanView(this);
	}
}
