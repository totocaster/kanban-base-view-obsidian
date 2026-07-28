import { Plugin, PluginSettingTab, Setting } from "obsidian";
import type { App } from "obsidian";
import {
	DEFAULT_KANBAN_GLOBAL_SETTINGS,
	normalizeKanbanGlobalSettings,
	registerKanbanView,
	type KanbanGlobalSettings,
	type KanbanSettingsSource,
} from "./kanban-view";

export default class BasesKanbanViewPlugin extends Plugin {
	private readonly settingsStore = new KanbanSettingsStore();

	async onload(): Promise<void> {
		this.settingsStore.set(
			normalizeKanbanGlobalSettings(await this.loadData()),
		);
		registerKanbanView(this, this.settingsStore);
		this.addSettingTab(new KanbanSettingTab(this.app, this));
	}

	override async onExternalSettingsChange(): Promise<void> {
		this.settingsStore.set(
			normalizeKanbanGlobalSettings(await this.loadData()),
		);
	}

	getSettings(): Readonly<KanbanGlobalSettings> {
		return this.settingsStore.getSettings();
	}

	async updateSettings(
		changes: Partial<KanbanGlobalSettings>,
	): Promise<void> {
		const nextSettings = {
			...this.settingsStore.getSettings(),
			...changes,
		};
		this.settingsStore.set(nextSettings);
		await this.saveData(nextSettings);
	}
}

class KanbanSettingsStore implements KanbanSettingsSource {
	private settings = { ...DEFAULT_KANBAN_GLOBAL_SETTINGS };
	private readonly listeners = new Set<() => void>();

	getSettings(): Readonly<KanbanGlobalSettings> {
		return this.settings;
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	set(settings: KanbanGlobalSettings): void {
		this.settings = settings;
		for (const listener of this.listeners) {
			listener();
		}
	}
}

class KanbanSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: BasesKanbanViewPlugin,
	) {
		super(app, plugin);
	}

	override display(): void {
		const { containerEl } = this;
		const settings = this.plugin.getSettings();
		containerEl.empty();

		new Setting(containerEl)
			.setName("Note hover previews")
			.setDesc("Show the native page preview when hovering over a kanban card.")
			.addToggle((toggle) => {
				toggle
					.setValue(settings.showCardHoverPreviews)
					.onChange(async (value) => {
						await this.plugin.updateSettings({
							showCardHoverPreviews: value,
						});
					});
			});

		new Setting(containerEl)
			.setName("Date display")
			.setDesc("Choose how date properties appear on every kanban board.")
			.addDropdown((dropdown) => {
				dropdown
					.addOption("exact", "Exact dates")
					.addOption("relative", "Relative dates")
					.setValue(settings.dateDisplayMode)
					.onChange(async (value) => {
						await this.plugin.updateSettings({
							dateDisplayMode:
								value === "relative" ? "relative" : "exact",
						});
					});
			});
	}
}
