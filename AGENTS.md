# Agent notes

Study these before writing any implementation code for the Bases kanban view:

1. Obsidian developer docs home:
   https://docs.obsidian.md/Home
2. Build a plugin:
   https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin
3. Official sample plugin template:
   https://github.com/obsidianmd/obsidian-sample-plugin
4. Build a Bases view:
   https://docs.obsidian.md/plugins/guides/bases-view
5. `BasesView` API reference:
   https://docs.obsidian.md/Reference/TypeScript+API/BasesView
6. `BasesViewConfig` API reference:
   https://docs.obsidian.md/Reference/TypeScript+API/BasesViewConfig
7. `BasesEntryGroup` API reference:
   https://docs.obsidian.md/Reference/TypeScript+API/BasesEntryGroup

Repo constraints:

- Keep this repo intentionally minimal.
- Use minimal styling and lean on Obsidian's built-in structure and semantic styles as much as possible.
- Prefer built-in Lucide icons that match the feature instead of decorative placeholder icons.
- Prefer extending `src/main.ts` and only add files when the implementation clearly needs them.
- Keep the eventual feature focused on a basic kanban layout for Bases.
- Extract and test logic when available, but keep the test harness minimal and avoid heavy DOM or Obsidian-runtime simulation unless it is clearly justified.
- After each meaningful iteration of work, run `npm test`, `npm run lint`, and `npm run build` before considering the change done.
- Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) for git commits.
- Never perform git commit without users explicit instruction. Always work on current branch.
