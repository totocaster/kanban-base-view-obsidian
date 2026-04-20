## Note on `rawKanbanView` and runtime API

I wanted column reordering to respect the built-in Bases `groupBy` UI instead of adding a second grouping selector in plugin settings. Another selector would create a second source of truth for the same concept, which felt confusing and easy to desync from the active Base view.

In practice, the public `BasesViewConfig` surface exposed the active sort state but did not expose the current built-in `groupBy` selection in a usable way for this feature, and I could not find a documented public accessor for it. To keep the UI aligned with the actual active Bases view, the plugin reads the active kanban view's runtime `query.views` entry through `rawKanbanView`.

This is an intentional tradeoff: it uses observed runtime shape because the documented public API did not appear to expose the active `groupBy`, but it avoids introducing duplicate settings and keeps column ordering scoped to the grouping the user actually picked in Bases.

Initial implementation landed in commit `844be83`.

I might be missing something though. Would like to discuss.

## Note on ordering behavior

Card ordering has two "modes" (not a user facing term), automatic and manual.

In automatic mode, the board simply follows the active Bases sort. If the user chooses a sort from the Obsidian Bases UI, the cards should appear in that order and no manual card arrangement is treated as active.

In manual mode, the user has started rearranging cards directly. At that point, the board behaves like a fixed snapshot of the current grouped board rather than continuing to follow the live Bases sort for card order.

Manual mode is reset as soon as the user changes the Bases sort again.
