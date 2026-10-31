# Pebblebase

Pebblebase is a desktop and self-hosted web database client. It combines a React and TypeScript interface with a Go API and adapters for PostgreSQL, MySQL, MongoDB, Redis, SQL Server, SQLite, and ClickHouse.

## Features

- Application shell with dark/light themes, menus, command palette, resizable tool windows, and keyboard shortcuts.
- Database explorer, connection/environment indicators, workspaces, and restorable tabs.
- Virtualized table and collection editor with structured filters, sorting, staged edits, import/export, and read-only protection.
- SQL and Mongo query console with statement execution, result history, and PostgreSQL/MySQL manual transactions.
- Schema metadata, DDL and index inspection, ER diagrams, and PostgreSQL schema diff.
- Find Everywhere across selected workspace sources, with production opt-in per search.
- Declared and inferred reference peek/jump, app-wide back/forward navigation, and Run from Log.
- Admin, Developer, and Viewer roles; active account controls; encrypted connection and AI credentials.
- Settings for theme, font size, shortcuts, query defaults, and provider-managed AI assistant tools.

## Run locally

Requirements: Go 1.26, Node.js, and Yarn. Start the web development server from `web/`:

```sh
cd web
yarn install --frozen-lockfile
yarn dev
```

Run the Go API from the repository root in a second terminal:

```sh
go run ./cmd/server
```

The desktop application uses Wails v2. Install the Wails CLI and platform build dependencies, then use the repository's Wails configuration:

```sh
wails dev
```

## Build and verify

Run these from `web/`:

```sh
yarn build          # TypeScript check and Vite production build
yarn test           # Vitest unit tests; no listening server required
yarn lint           # Oxlint
yarn format:check   # Prettier check
```

Run Go checks from the repository root:

```sh
go vet ./...
go test -v -count=1 ./...
go build -o build/pebblebase ./cmd/server
```

Build the embedded web assets with `yarn build` before building or running a production Go binary.

## Keyboard shortcuts

The following entries match the Settings keymap. On macOS, `Ctrl` is displayed as `Cmd`; the `Alt+1` and `Alt+2` tool-window shortcuts use their registered `Cmd+1` and `Cmd+2` equivalents.

| Shortcut | Action |
| --- | --- |
| `Ctrl+K` | Search Everywhere / command palette |
| `Ctrl+Shift+F` | Find Everywhere |
| `Ctrl+Shift+L` | Run from Log |
| `Ctrl+Alt+←` / `Ctrl+Alt+→` | Navigate Back / Forward |
| `Ctrl+Alt+1..9` | Switch workspace |
| `Ctrl+Enter` | Run query |
| `Ctrl+E` | Query History |
| `Ctrl+W` | Close active tab |
| `Alt+1` | Show/hide Database tool window |
| `Alt+2` | Show/hide Scripts tool window |
| `Alt+Q` | Open query console |
| `Alt+E` | Open ER diagram |

## Security notes

Connection writes are blocked for read-only sources. Production console writes require confirmation. API keys and connection credentials are stored through the application's encrypted secret storage and are not included in query history or exported data.
