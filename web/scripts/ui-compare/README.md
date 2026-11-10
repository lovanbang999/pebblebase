# Pebblebase UI Compare Tool

A headless regression testing tool that performs pixel-accurate and computed-style DOM comparisons between any two Git revisions or between a Git commit and the current working tree across dual themes (`light` and `dark`).

---

## Why This Tool Exists

Pebblebase shares reusable UI primitives (`Button`, `Badge`, `Input`, `Select`, `Dialog`, `Alert`, etc.) across dozens of views. Refactorings, Tailwind CSS cleanups, or theme adjustments can introduce subtle visual regressions (e.g., losing custom hover colors, dark-mode border definitions, or font-size adjustments) that class-string diffs and unit tests cannot reliably detect.

This tool builds the actual frontend, spins up an isolated Pebblebase backend on an ephemeral port, drives the app using Playwright with animations/transitions disabled, dumps computed CSS properties for every rendered DOM element, and asserts zero visual variance.

---

## Usage

### Via Yarn / NPM

From `pebblebase/web/`:

```bash
yarn ui:compare <commit_a> <commit_b> [--states <filter>] [--themes light,dark]
```

### Direct Bash Invocation

From anywhere in the repository:

```bash
bash web/scripts/ui-compare/ui-compare.sh <commit_a> <commit_b> [--states <filter>] [--themes light,dark]
```

### Examples

- **Compare PR branch against main**:
  ```bash
  yarn ui:compare main HEAD
  ```
- **Compare current uncommitted working tree against main**:
  ```bash
  yarn ui:compare main working-tree
  ```
- **Compare a specific cleanup commit**:
  ```bash
  yarn ui:compare dec7546^ dec7546
  ```
- **Filter specific state group (e.g. RowModal only)**:
  ```bash
  yarn ui:compare main working-tree --states row-modal
  ```
- **Target a single theme**:
  ```bash
  yarn ui:compare main working-tree --themes dark
  ```

### Performance & Approximate Runtime

- **Full Suite (108 states across dual themes)**: ~2.5 minutes total (includes 2 independent frontend builds, 2 Go server binary compilations, and 108 Playwright dual-theme captures).
- **Targeted Subsets (via `--states`)**:
  - `--states row-modal`: ~15–20 seconds.
  - `--states import`: ~25–30 seconds.
  - `--states general`: ~40–50 seconds.

---

## Tool Architecture

1. **Ephemeral Git Worktrees**:
   - Creates detached worktrees in `/tmp/pb_ui_cmp_*` for the requested commits.
   - Symlinks the existing `web/node_modules` so `yarn build` runs in ~1.5s per worktree without re-installing packages.
   - Supports `working-tree` or `.` as target to test uncommitted local changes without creating git commits.

2. **Backend Server Isolation**:
   - Compiles a dedicated Go server binary embedding the target's built `web/dist` assets.
   - Always compiles using the current working tree's backend Go code so modern environment flags (`PEBBLEBASE_DISABLE_UPDATE_CHECK=true`) and API behaviors are uniform across both sides.
   - Binds to dynamic ephemeral ports (never port 8080).
   - Generates an isolated SQLite test database with pre-seeded fixtures (including `sample_records` with text, number, bool, json, and datetime columns).

3. **DOM Style Capture Runner (`capture-runner.cjs`)**:
   - Injects zero-animation CSS (`*, *::before, *::after { transition: none !important; animation: none !important; }`).
   - Authenticates and saves auth state.
   - Iterates through registered UI states in both `light` and `dark` themes.
   - Extracts computed properties for all visible elements:
     - `color`
     - `backgroundColor`
     - `borderTopColor`, `borderRightColor`, `borderBottomColor`, `borderLeftColor`
     - `outlineColor`
     - `boxShadow`
     - `opacity`
   - Generates reference screenshots in the temporary output directory.

4. **Style Differ (`diff-styles.cjs`)**:
   - Keys elements by hierarchical stable DOM paths (`data-slot`, `role`, tag, nth-of-type).
   - Compares all 9 style properties.
   - Groups differences by state and component type.
   - Exits with `0` if clean, `1` if visual regressions are found.

5. **Self-Cleaning Lifecycle**:
   - Traps `EXIT`, `INT`, and `TERM` signals to ensure background server processes, worktrees, and temporary directories in `/tmp` are removed automatically.

---

## State Registry & State Coverage

The harness includes states covering:

- **General Application (52 states)**:
  - Unauthenticated Login screen (default, button hover, invalid credentials, disabled inputs).
  - Workspace Home (explore button hover, new connection button hover).
  - New Connection Modal (driver selection, General tab, Advanced tab, Test Connection button hover).
  - Settings Modal (General tab, Password tab, Audit tab, Refresh button hover).
  - Database Tree & Navigation (expanded nodes, table selections).
  - DataGrid (default table view, cell selection, filter bar inputs & select triggers, toolbar button hovers for filter, sort, density, columns, export, import, refresh, add row, delete row).
  - Schema View tab.
  - Query Console (editor, Run Query button hover).
  - ERD View (schema visualizer toggle).
- **Import / Export Modal (36 states)**:
  - Import Modal (empty drop zone, drag-over state, file loaded with preview table, column mapping dropdown open, mapping item hover, validation warnings, success view, error alert).
  - Export Modal (JSON format, CSV format, SQL format, scope toggles for all filtered vs current page, destination toggles for clipboard copy vs file download, success alerts, download triggers).
  - Read-only connection restrictions and action button hovers (Export, Close/X, Tabs).
- **Row Modal (16 states)**:
  - Insert Mode with empty default fields across all schema types (`int`, `float`, `string`, `bool`, `json`, `datetime`).
  - Boolean `Select` dropdown trigger and open popup.
  - Hover on select item option.
  - Textarea JSON input.
  - Validation error alert (`Alert variant="destructive"`) on duplicate primary key submission.
  - Edit Mode with populated fields, read-only/disabled primary key, and delete button visible.
  - Hover states on Save, Cancel, and Delete buttons.

### Adding New States

To add a new state, edit `web/scripts/ui-compare/capture-runner.cjs`:

1. Check `shouldRunGroup("<group-name>")`.
2. Perform the DOM interaction using Playwright locators.
3. Call `await captureDualTheme(page, "<state_name>", results)`.
4. For hover states, call `await captureHoverDualTheme(page, locator, "<state_name>", results)`.

---

## Limitations

- **RowModal Simulation**: The `RowModal` validation-error state is simulated by making `window.dispatchEvent` throw when `pb:stage-row-draft` is dispatched, and edit mode is opened by invoking the `onEditRow` handler directly. Consequently, these states measure styling and visual layout only, not data persistence or backend save logic.

---

## Known Coverage Gaps

The following specialized surfaces require live third-party services or interactive canvas controls not covered by the standard local SQLite fixtures:

- **Redis Studio & Value Editors**: Hash, Set, ZSet, and String editors (requires live Redis service).
- **MongoDB Pipeline Builder**: Stage editor cards and pipeline previews (requires live MongoDB service).
- **ERD Visual Graph Interactions**: Interactive drag-and-drop node positioning on `@xyflow/react` canvas.
- **Database Migration Runner**: Running active forward/backward database schema migrations.
- **AI Settings Dialog**: Custom LLM provider endpoints and API key validation.
- **Onboarding Tour**: Interactive step-by-step tooltip popovers (intentionally bypassed in tests).
- **Update Dialog**: Auto-update notification banner (disabled via `PEBBLEBASE_DISABLE_UPDATE_CHECK=true`).

---

## Mandatory Refactoring Policy

> **Rule:** Before committing or submitting a PR that modifies CSS, Tailwind classes, or shared UI primitives (`web/src/components/ui/*`), developers **must** run:
>
> ```bash
> yarn ui:compare main working-tree
> ```
>
> The check must exit with code `0` (Zero visual differences). Any detected difference must be verified and confirmed intentional before proceeding.
