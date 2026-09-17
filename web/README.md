# Pebblebase Studio Frontend

The frontend interface for Pebblebase is built with React 19, TypeScript, Vite, and Tailwind CSS v4. It is shared across both the standalone web server and the native Wails v2 Linux desktop client.

---

## Core Technologies

- **React 19**: Modern component architecture with optimistic state mutations and hooks.
- **TypeScript**: Strict type definitions for schema introspection, table rows, and API contracts.
- **Tailwind CSS v4**: Modern CSS-first token configuration with container queries and subpixel rendering optimization.
- **Base UI**: Accessible headless primitives for toolbars, dialogs, dropdowns, and form inputs.
- **Lucide Icons**: Vector UI icons integrated into standard button components.
- **CodeMirror**: Syntax highlighting and autocomplete for SQL and MongoDB query execution.
- **i18next**: Multilingual internationalization supporting English and Vietnamese.

---

## Dual-Runtime Architecture (Web vs Desktop)

The frontend automatically detects its host execution environment via `isDesktopApp()` defined in `src/lib/platform.ts`:

### Desktop Mode (Wails v2 Runtime)

- Activates `DesktopTitleBar` with `--wails-draggable: drag` and `--wails-draggable: no-drag` region declarations.
- Exposes native window management APIs: `minimizeDesktopWindow`, `toggleMaximizeDesktopWindow`, `isDesktopWindowMaximized`, and `closeDesktopWindow`.
- Sets CSS custom property `--titlebar-height: 38px` on the application root, positioning the sidebar container cleanly beneath the frameless studio titlebar.

### Web Browser Mode

- `DesktopTitleBar` returns `null` to avoid rendering operating-system-level window controls inside standard web browsers.
- `--titlebar-height` defaults to `0px`, allowing the sidebar to occupy the full viewport height.

---

## Theme Architecture and CSS Sanitization

- **Light and Dark Modes**: Controlled via class `.dark` and browser-level `color-scheme: light / dark` on `:root`.
- **Browser Autofill Normalization**: Overrides WebKit and Firefox internal autofill styles using `-webkit-box-shadow: 0 0 0 1000px inset` and explicit foreground text colors. This prevents browser password managers from injecting dark background fills when operating in light mode.

---

## Development Scripts

```bash
# Start local Vite development server with Hot Module Replacement
yarn dev

# Compile TypeScript and build production bundle into dist/
yarn build

# Run unit tests
yarn test

# Preview production build locally
yarn preview
```
