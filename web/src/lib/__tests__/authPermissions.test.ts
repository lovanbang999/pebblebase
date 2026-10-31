import { describe, expect, it } from "vitest";
import {
  canManageSettings,
  canManageUsers,
  canReadData,
  canWriteData,
} from "@/lib/auth";

describe("role permission matrix", () => {
  const matrix = [
    { role: "admin", read: true, write: true, users: true, settings: true },
    {
      role: "developer",
      read: true,
      write: true,
      users: false,
      settings: false,
    },
    { role: "viewer", read: true, write: false, users: false, settings: false },
  ] as const;

  it.each(matrix)(
    "applies the $role permissions",
    ({ role, read, write, users, settings }) => {
      expect(canReadData(role)).toBe(read);
      expect(canWriteData(role)).toBe(write);
      expect(canManageUsers(role)).toBe(users);
      expect(canManageSettings(role)).toBe(settings);
    },
  );

  it("denies unauthenticated roles", () => {
    expect(canReadData(null)).toBe(false);
    expect(canWriteData(undefined)).toBe(false);
    expect(canManageUsers(null)).toBe(false);
    expect(canManageSettings(undefined)).toBe(false);
  });
});
