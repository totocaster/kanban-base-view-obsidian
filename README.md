# Better Kanban Bases View

![Better Kanban Bases View screenshot](.github/assets/bases-kanban-view-screenshot.png)

A minimal kanban layout for Obsidian Bases.

## Install

Once approved in the Obsidian community directory, install Better Kanban Bases View from **Settings > Community plugins**.

For a manual install, download the release assets and place them in:

```text
.obsidian/plugins/bases-kanban-view-ttvl/
  manifest.json
  main.js
  styles.css
```

## Compatibility

Requires Obsidian 1.10.2 or newer. The plugin uses the Bases view API and is not marked desktop-only.

## Features

- A custom `Kanban` Bases view
- Columns derived from the active Bases grouping (see note 1 below)
- Cards that render the note title plus the properties already selected in Bases
- Formula properties selected in Bases render as card metadata with a formula icon
- Optional small or large plain-text note previews below card properties
- Drag-and-drop column reordering
- Drag-and-drop card reordering within a column
- Cross-column card moves when the board is grouped by a writable `note.*` property
- Keyboard card focus with arrow keys
- Keyboard card moving with `⌘` / `Ctrl` arrow shortcuts
- Animated keyboard card moves that respect reduced-motion preferences
- Persisted column order per grouping
- Persisted manual card order per grouping (see note 2 below)
- View options to hide empty card properties and choose the card preview size

## Keyboard usage

Cards can be focused with the mouse or with the keyboard. When a card is focused:

- `↑` and `↓` move focus within the current column.
- `←` and `→` move focus between columns, keeping the same approximate row where possible.
- If no card is focused yet, the first arrow-key navigation starts at the first card in the first non-empty column.
- Moving the mouse over a card focuses that card. After keyboard navigation or keyboard moving, stationary mouse hover is ignored until the pointer moves again.

Card movement shortcuts use Obsidian's modifier key: `⌘` on macOS / `Ctrl` on Windows and Linux. Boundary shortcuts also use `⌥` on macOS / `Alt` on Windows and Linux.

- `⌘↑` / `Ctrl+↑` and `⌘↓` / `Ctrl+↓` move the focused card one position within its column.
- `⌘←` / `Ctrl+←` and `⌘→` / `Ctrl+→` move the focused card to the adjacent column.
- `⌥⌘↑` / `Alt+Ctrl+↑` sends the focused card to the top of its column.
- `⌥⌘↓` / `Alt+Ctrl+↓` sends the focused card to the bottom of its column.
- `⌥⌘←` / `Alt+Ctrl+←` and `⌥⌘→` / `Alt+Ctrl+→` behave the same as the non-option column moves.

Keyboard card movement is available when the board has an active Bases grouping. Cross-column keyboard moves require the grouping to be a writable `note.*` property because the plugin must update note frontmatter to move the card between groups. Boards grouped by `formula.*` properties can still use column ordering and same-column card ordering, but formula columns are computed and cannot be used as writable drop targets.

## Card previews

Card previews can be set to `None`, `Small`, or `Large` from the view options. Preview text is derived from the note body, skips frontmatter and common Markdown noise, and is truncated to keep cards compact.

## Formula properties

Formula properties selected in the Bases Properties menu are shown in each card's metadata list. The view uses Obsidian's evaluated Bases values, so formula output renders through the same `Value.renderTo` path as note and file properties.

## Design goals

- Reuse the existing Sort, Group, Filter, and Properties controls instead of introducing separate kanban settings
- Keep the styling minimal so the view feels like part of Bases rather than a themed plugin
- Prefer pragmatic UX decisions over ornamentation or broad customization
- Keep interactions fast and predictable (fast updates, no jumping DOM, etc.)

---

## Privacy and safety

- No telemetry or analytics.
- No network requests.
- No account, license key, or paid service required.
- No access to files outside the vault.
- Uses Obsidian APIs to read notes shown by the active Base, create notes from kanban columns, and update note frontmatter when cards move between writable `note.*` groups.

## Development

Install dependencies and run the local checks:

```bash
npm install
npm test
npm run lint
npm run build
```

Start watch mode:

```bash
npm run dev
```

For local vault development, symlink this repo into:

```text
.obsidian/plugins/bases-kanban-view-ttvl
```

## Release

The first community release starts at `0.5.0`.

1. Update `manifest.json`, `package.json`, and `package-lock.json` to the release version.
2. Update `versions.json` only when the required Obsidian version changes.
3. Run `npm test`, `npm run lint`, and `npm run build`.
4. Create a GitHub release whose tag exactly matches `manifest.json` version.
5. Attach `main.js`, `manifest.json`, and `styles.css` to the release.

## Notes

### 1. Note on `rawKanbanView` and runtime API

I wanted column reordering to respect the built-in Bases `groupBy` UI instead of adding a second grouping selector in plugin settings. Another selector would create a second source of truth for the same concept, which felt confusing and easy to desync from the active Base view.

In practice, the public `BasesViewConfig` surface exposed the active sort state but did not expose the current built-in `groupBy` selection in a usable way for this feature, and I could not find a documented public accessor for it. To keep the UI aligned with the actual active Bases view, the plugin reads the active kanban view's runtime `query.views` entry through `rawKanbanView`.

This is an intentional tradeoff: it uses observed runtime shape because the documented public API did not appear to expose the active `groupBy`, but it avoids introducing duplicate settings and keeps column ordering scoped to the grouping the user actually picked in Bases.

### 2. Note on ordering behavior

Card ordering has two "modes" (not a user facing term), automatic and manual.

In automatic mode, the board simply follows the active Bases sort. If the user chooses a sort from the Obsidian Bases UI, the cards should appear in that order and no manual card arrangement is treated as active.

In manual mode, the user has started rearranging cards directly. At that point, the board behaves like a fixed snapshot of the current grouped board rather than continuing to follow the live Bases sort for card order.

Manual mode is reset as soon as the user changes the Bases sort again.

---

## Future work

- Better handling for date-typed properties, including daily note awareness and interaction
- Smarter property type detection and cleaner formatting, ideally configurable from the view
- Proper mobile validation; I have not tested it thoroughly yet, although `this.app.emulateMobile(true);` suggests the basic layout should be workable

## License

[MIT](./LICENSE)
