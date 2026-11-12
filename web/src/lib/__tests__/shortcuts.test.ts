import { describe, it, expect } from "vitest";
import { evaluateDesktopShortcut, isPermissionDeniedError } from "../platform";

describe("isPermissionDeniedError", () => {
  it("recognizes permission failures from the updater", () => {
    expect(
      isPermissionDeniedError(
        new Error(
          "failed to replace binary: open /usr/bin/pebblebase: permission denied",
        ),
      ),
    ).toBe(true);
    expect(isPermissionDeniedError("operation not permitted")).toBe(true);
    expect(isPermissionDeniedError("network timeout")).toBe(false);
  });
});

describe("evaluateDesktopShortcut", () => {
  it("returns 'closeTab' when Ctrl+W is pressed and an active tab is open", () => {
    const action = evaluateDesktopShortcut(
      {
        ctrlKey: true,
        metaKey: false,
        shiftKey: false,
        altKey: false,
        key: "w",
      },
      { isDesktop: false, isDebug: false, hasActiveTab: true },
    );
    expect(action).toBe("closeTab");
  });

  it("returns 'suppressClose' when Cmd+W is pressed on macOS without an active tab", () => {
    const action = evaluateDesktopShortcut(
      {
        ctrlKey: false,
        metaKey: true,
        shiftKey: false,
        altKey: false,
        key: "w",
      },
      { isDesktop: true, isDebug: false, hasActiveTab: false },
    );
    expect(action).toBe("suppressClose");
  });

  it("suppresses Ctrl+R reload in production desktop builds outside debug mode", () => {
    const action = evaluateDesktopShortcut(
      {
        ctrlKey: true,
        metaKey: false,
        shiftKey: false,
        altKey: false,
        key: "r",
      },
      { isDesktop: true, isDebug: false, hasActiveTab: true },
    );
    expect(action).toBe("reload");
  });

  it("allows Ctrl+R reload when in debug mode", () => {
    const action = evaluateDesktopShortcut(
      {
        ctrlKey: true,
        metaKey: false,
        shiftKey: false,
        altKey: false,
        key: "r",
      },
      { isDesktop: true, isDebug: true, hasActiveTab: true },
    );
    expect(action).toBeNull();
  });

  it("allows Ctrl+R reload in regular browser mode", () => {
    const action = evaluateDesktopShortcut(
      {
        ctrlKey: true,
        metaKey: false,
        shiftKey: false,
        altKey: false,
        key: "r",
      },
      { isDesktop: false, isDebug: false, hasActiveTab: true },
    );
    expect(action).toBeNull();
  });

  it("suppresses DevTools shortcuts (Ctrl+Shift+I and F12) in production desktop builds", () => {
    const ctrlShiftI = evaluateDesktopShortcut(
      {
        ctrlKey: true,
        metaKey: false,
        shiftKey: true,
        altKey: false,
        key: "i",
      },
      { isDesktop: true, isDebug: false, hasActiveTab: true },
    );
    expect(ctrlShiftI).toBe("devtools");

    const f12 = evaluateDesktopShortcut(
      {
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        altKey: false,
        key: "F12",
      },
      { isDesktop: true, isDebug: false, hasActiveTab: true },
    );
    expect(f12).toBe("devtools");
  });

  it("allows DevTools shortcuts in desktop debug mode", () => {
    const ctrlShiftI = evaluateDesktopShortcut(
      {
        ctrlKey: true,
        metaKey: false,
        shiftKey: true,
        altKey: false,
        key: "i",
      },
      { isDesktop: true, isDebug: true, hasActiveTab: true },
    );
    expect(ctrlShiftI).toBeNull();
  });

  it("ignores non-conflicting keys like navigation or typing", () => {
    const action = evaluateDesktopShortcut(
      {
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        altKey: false,
        key: "Enter",
      },
      { isDesktop: true, isDebug: false, hasActiveTab: true },
    );
    expect(action).toBeNull();
  });
});
