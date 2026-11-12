# Contributing to Pebblebase

Thank you for your interest in contributing to Pebblebase! We welcome contributions from developers of all skill levels. This guide explains how to report bugs, suggest features, and submit code changes.

---

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md). Please read it to understand expected behavior and enforcement standards.

---

## How Can I Contribute?

### 1. Reporting Bugs

Before creating a bug report, please check existing GitHub Issues to see if the problem has already been reported.

When creating a bug report, please include:

- **Operating System & Architecture** (e.g., Ubuntu 24.04 amd64, macOS Sonoma arm64)
- **Go version & Node.js version**
- **Database driver & version** (e.g., PostgreSQL 16, MySQL 8, MongoDB 7)
- **Steps to reproduce** the issue clearly
- **Expected vs Actual behavior**
- Relevant log output or terminal tracebacks

### 2. Suggesting Enhancements

Feature requests are tracked via GitHub Issues. Please include:

- Clear title and description of the proposed feature
- Use cases and motivation for why this would benefit the community
- Any mockups or architectural considerations if applicable

### 3. Submitting Pull Requests

Follow these steps to propose code changes:

#### Step 1: Fork and Clone

```bash
git clone https://github.com/YOUR_USERNAME/pebblebase.git
cd pebblebase
```

#### Step 2: Create a Feature Branch

Always create a new branch from `main`:

```bash
git checkout main
git pull origin main
git checkout -b feat/your-feature-name
```

Branch naming conventions:

- `feat/<name>`: New feature or enhancement
- `fix/<name>`: Bug fix
- `refactor/<name>`: Code restructuring without logic changes
- `docs/<name>`: Documentation improvements
- `chore/<name>`: Dependency updates, CI/CD, or maintenance

#### Step 3: Make Your Changes & Test

Follow [AGENTS.md](../AGENTS.md) for shared engineering guidance and choose the
checks in [Development and validation](#development-and-validation) for your change.
Build frontend assets before Go validation because `embed.go` embeds `web/dist/`.

#### Step 4: Commit Message Format

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

- <Bullet 1: Technical change summary>
- <Bullet 2: Validation or test details>
```

Examples:

- `feat(adapter): add mongodb cursor pagination support`
- `fix(ui): resolve vertical alignment of filter popover controls`
- `docs: update deployment guidelines for single binary execution`

#### Step 5: Submit Pull Request

Push your branch to GitHub and create a Pull Request targeting `main`. Ensure your PR description clearly explains the changes and links to any relevant issue numbers (e.g., `Closes #42`).

Include validation results, skipped checks and their reasons, and screenshots for
visible UI changes. Keep runtime fixes, dependency upgrades, and unrelated
refactors separate from review-configuration changes.

## Development and validation

Use the Go version declared in `go.mod` (currently 1.26.0). Application CI uses
Node.js 22 and Wails CLI 2.16.0; documentation CI uses Node.js 20. Use Yarn for
`web/` and npm for `docs-site/`, preserving their respective lockfiles.

### Frontend and embedded assets

From `web/`:

```sh
yarn install --frozen-lockfile
yarn build
yarn test
yarn lint
yarn format:check
```

`yarn build` checks TypeScript and builds the embedded frontend. `yarn test`
runs Vitest with jsdom and Testing Library; it needs no listening server.
`yarn lint` runs Oxlint, and `yarn format:check` runs Prettier.

For development, run `yarn dev` in `web/` and `go run ./cmd/server` at the
repository root. Vite proxies `/api` to port 8080. Build assets first so the
embedded server also has a usable frontend.

### Go and database adapters

After building frontend assets, run from the repository root:

```sh
go vet ./...
go test -v -count=1 ./...
```

Format changed Go files with `gofmt`. Run focused package tests during
development and add regression coverage for changed behavior.

Live database tests need disposable databases. The existing Docker Compose
runner starts fixtures, configures test connections, and runs adapter tests:

```sh
bash scripts/run_adapter_tests.sh --all
# Or select an affected engine:
bash scripts/run_adapter_tests.sh --engine=postgres
```

The runner requires Docker Compose and removes its test containers and volumes
on exit unless `--keep` is supplied. Never point integration tests at valuable
data. SQLite tests use local fixtures; many Redis tests use miniredis.

| Engine     | Live-test environment variable   |
| ---------- | -------------------------------- |
| PostgreSQL | `PEBBLEBASE_TEST_DSN`            |
| MySQL      | `PEBBLEBASE_TEST_MYSQL_DSN`      |
| MongoDB    | `TEST_MONGODB_URI`               |
| Redis      | `PEBBLEBASE_TEST_REDIS_DSN`      |
| ClickHouse | `PEBBLEBASE_TEST_CLICKHOUSE_DSN` |
| SQL Server | `PEBBLEBASE_TEST_MSSQL_DSN`      |

Some integration tests skip when configuration is absent or a service is
unreachable. Inspect test output and report skips; a successful command alone
does not prove that a live engine was tested.

### Browser E2E tests

The current Playwright configuration targets Chromium and uses Unix shell
commands. It requires Python 3, a compiled server at the repository root, and
Playwright's browser dependencies. After building frontend assets:

```sh
# Repository root
go build -o pebblebase ./cmd/server
cd web
yarn playwright install --with-deps chromium
yarn test:e2e
```

Playwright launches its own server on port 8080 and does not reuse an existing
server. Its command deletes `/tmp/pb_e2e_data` before startup. Global setup
generates SQLite seed/performance fixtures in `testdata/` and authentication
state under `web/e2e/.auth/`. Use a disposable environment with port 8080 free.
This suite does not verify Wails native webviews.

### Desktop and documentation

See [DESKTOP_GUIDE.md](../DESKTOP_GUIDE.md), `wails.json`, and the packaging scripts
for platform prerequisites. CI verifies Linux amd64, Windows amd64, and macOS
universal builds. Changes to native window behavior, filesystem paths, shortcuts,
or updates also need relevant native smoke checks.

For documentation changes, run in `docs-site/`:

```sh
npm ci
npm run build
```

Check links and source accuracy, and update the corresponding Vietnamese pages
when product documentation changes.

### What CI currently runs

The [CI workflow](workflows/ci.yml) runs Go tests after building frontend assets,
frontend formatting/build checks, and desktop build/package verification.
Despite its name, the frontend job does not currently run Oxlint. Vitest,
Playwright, and the database container runner are also not invoked by this
workflow. There is no numeric coverage gate.

The [documentation workflow](workflows/deploy-docs.yml) builds and deploys on
matching pushes to `main` or manual dispatch; it does not validate documentation
on pull requests. The [release workflow](workflows/release.yml) packages desktop
releases on version tags or manual dispatch.

## CodeRabbit review workflow

The repository-root `.coderabbit.yaml` configures reviews and loads `AGENTS.md`
as shared guidance. Automatic reviews are enabled for eligible non-draft PRs,
including subsequent pushes. CodeRabbit's `base_branches` setting adds branches
to the repository default; it is not an exclusive branch allowlist.

For the initial integration trial, a maintainer should confirm that the CodeRabbit
GitHub App has access to the repository, then open the configuration/guidance PR
for review. Use these PR comments when needed:

- `@coderabbitai configuration`: inspect effective settings and their sources.
- `@coderabbitai full review`: request a full review.

Confirm that CodeRabbit accepts the configuration, uses the engineering guidance,
and reviews a subsequent genuine documentation refinement incrementally. Keep
CodeRabbit optional in branch protection during this trial. Validate the Go and
frontend path instructions on the next relevant code changes; a documentation
PR alone cannot demonstrate their effectiveness.

Validate YAML changes against the
[official schema](https://www.coderabbit.ai/integrations/schema.v2.json), including
types, enums, and required fields. Confirm effective settings in the actual PR:
schema validation does not establish installation, plan availability, or
organization overrides. See the
[configuration reference](https://docs.coderabbit.ai/reference/configuration)
and [review commands](https://docs.coderabbit.ai/reference/review-commands).

---

## Development Guidelines

### Go Style Guide

- Follow official Go conventions (`gofmt`, `go vet`).
- Keep interfaces small and single-purpose (`internal/adapter`).
- Handle errors explicitly; do not swallow errors silently.

### TypeScript / React Style Guide

- Use functional components with React 19 hooks.
- Follow Tailwind CSS v4 design token conventions.
- Place user-facing strings in `web/src/locales/` for i18n support.
