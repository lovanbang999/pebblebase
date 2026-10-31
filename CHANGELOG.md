# Changelog

## Unreleased

### Added

- Refined desktop shell with theme and font-size settings, menu bar, connection status, status bar, tool windows, command palette, dialogs, toasts, and contextual actions.
- Database explorer improvements, stable multi-kind tabs, dirty-tab prompts, data-source management, and a welcome screen.
- Virtualized table and collection editing with structured filters, staged changes, value editor, metadata subviews, import, export, and read-only safeguards.
- SQL/Mongo consoles with statement splitting, result tabs, query history, scripts, and PostgreSQL/MySQL manual transaction sessions.
- Schema metadata service, DDL/index inspection, ER diagrams, and PostgreSQL schema comparison with reviewed SQL generation.
- Workspace save/restore, workspace-scoped Find Everywhere, production opt-in for search, bounded reference lookup, FK peek/jump, and back/forward navigation.
- Run from Log support for TypeORM, Prisma, Mongoose, and Redis command logs.
- Admin, Developer, and Viewer roles, account activation controls, audit events, password reset, and forced default-password change.
- Appearance, keymap, and query settings; encrypted AI provider configuration; assistant conversation, explicit result attachment, and safe query insertion; About and update-check dialogs.
- Vitest coverage for web logic and regression tests for Go API, adapters, storage, permissions, and secret handling.

### Security

- Read-only connections reject write operations across SQL, MongoDB, and Redis handlers.
- Production console writes require confirmation. Find Everywhere excludes production sources unless explicitly included for that search.
- Query history omits results and credentials; AI keys remain encrypted and masked in configuration responses.
