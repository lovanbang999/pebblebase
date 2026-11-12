# Engineering guidance

Paths and commands in this file are relative to this Git repository, not its
parent workspace. See [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md) for setup,
commands, test prerequisites, and the review workflow.

## Architecture and ownership

- `cmd/server/` and `cmd/desktop/` are the HTTP server and Wails v2 entry points.
  Both use `internal/app.Bootstrap`. The desktop serves the API through Wails'
  AssetServer and also starts a loopback listener, trying port 8080 before an
  ephemeral port. Native window operations use Wails bindings.
- `internal/api/` owns HTTP handlers, authorization integration, adapter caching,
  and composition. It currently imports concrete adapters to construct them.
  Keep engine operations behind `internal/adapter` contracts without requiring
  an unrelated factory refactor.
- `internal/adapter/` contains PostgreSQL, MySQL, MongoDB, SQLite, Redis, SQL
  Server, and ClickHouse implementations. Check optional capabilities at their
  call sites; neither interface names nor another driver's behavior proves support.
- `internal/consolesession/` manages owned, expiring console transactions.
  Manual console transactions currently support PostgreSQL and MySQL.
- `internal/storage/` saves connection records in `connections.json`, encrypting
  saved DSNs. Bootstrap opens `meta.db` for users, audit, saved queries, migration
  history, and AI configuration. Encryption protects selected secrets, not the
  entire metadata database.
- Other services include authentication, audit, catalog/schema metadata, schema
  diff, seeding, AI providers, and auto-updates under `internal/`.
- `web/src/` contains the shared React browser/desktop UI. TanStack Query manages
  server data; Zustand and other local stores manage client state.
  `web/src/lib/api.ts` and `types.ts` describe frontend API usage and contracts.
- `docs-site/` is the Astro/Starlight documentation, including English and
  Vietnamese pages. Packaging sources are in `scripts/`, `build/`, and
  `cmd/desktop/build/`; these directories contain authored files as well as output.

## Change invariants

- Keep Go JSON responses and frontend types/callers compatible. Handle missing,
  nullable, binary, BSON, and large numeric values explicitly.
- Preserve backend role checks, connection read-only controls, production-write
  confirmation, and console-session ownership. Frontend checks and loopback
  binding do not replace server authorization.
- Parameterize values in generated SQL and quote validated identifiers for the
  target dialect. Raw query execution is a product feature; review its access
  controls separately from generated query construction.
- Honor cancellation and bound work. Release database rows/cursors, pinned
  transactions, streams, goroutines, and pools on failure and shutdown.
- Preserve persistence compatibility and recoverability. Keep credentials,
  tokens, and AI keys out of logs, errors, histories, exports, and fixtures.
  Trace route protection and outbound requests when changing AI or updates.
- Scope frontend caches and asynchronous results to the correct connection,
  workspace, and tab. Preserve staged edits and stable virtualized row identity.
- Preserve browser fallbacks and Linux, Windows, and macOS behavior. Compilation
  and Chromium tests do not establish native webview behavior.

## Conventions

- Format Go changes with `gofmt`; handle errors explicitly and follow existing
  package boundaries.
- Use functional React components, PascalCase component filenames, and
  `use`-prefixed hooks. Follow existing hook and effect-cleanup patterns.
- Follow the checked-in Prettier and Oxlint configurations. The active frontend
  linter is Oxlint. Follow the actual TypeScript configuration; it does not
  currently enable `strict`.
- Add user-facing strings to both `web/src/locales/en.json` and `vi.json`.
  Check corresponding translated documentation when documented behavior changes.
- Keep dependency manifests and lockfiles consistent. Use Yarn for `web/` and
  npm for `docs-site/`. Do not hand-edit generated assets.

## Choosing validation

Use focused regression coverage for changed behavior, then the relevant checks
below. Detailed commands and prerequisites live in the contribution guide.

| Change             | Relevant evidence                                                  |
| ------------------ | ------------------------------------------------------------------ |
| Go/API behavior    | Embedded frontend assets, focused Go tests, Go suite and vet       |
| Database adapter   | Unit/compliance tests and affected engine's live tests             |
| React/TypeScript   | Vitest, Oxlint, Prettier, frontend build; affected E2E/manual flow |
| Desktop/packaging  | Relevant platform build and native smoke checks                    |
| Docs/configuration | Links, source accuracy, applicable schema/docs build               |

Report skipped integration tests and unavailable platforms explicitly. Do not
describe a skipped live database test as verified behavior. No numeric coverage
threshold is configured.

## Review expectations

Use Conventional Commits and focused branches from `main`. Explain the behavior
change, validation, and remaining limitations in the PR; include screenshots for
visible UI changes.

Tie review findings to source evidence and changed behavior. Prioritize
correctness, security, data loss, and regressions; distinguish existing defects
from introduced defects. Avoid formatting-only feedback covered by tooling,
speculative capability claims, and unrelated architectural rewrites.

Extend existing documentation rather than create parallel guides:
[architecture](docs-site/src/content/docs/reference/architecture.md),
[desktop](DESKTOP_GUIDE.md), [deployment](DOCKER_GUIDE.md), and
[security policy](.github/SECURITY.md). Verify claims against source when these
documents disagree with the implementation.
