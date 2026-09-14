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

- **Go Backend**: Ensure code compiles cleanly with `go test ./...` and `go fmt ./...`.
- **React Frontend**: Ensure TypeScript checks pass with `npm run build` inside `web/`.

#### Step 4: Commit Message Format

We strictly enforce [Conventional Commits](https://www.conventionalcommits.org/):

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
