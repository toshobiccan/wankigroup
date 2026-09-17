import { describe, it, expect } from "vitest";
import { ROLES, DEFAULT_ROLE, ROLE_COLORS, normalizeRole, cssColor } from "../src/game/roles.js";

describe("roles", () => {
  it("lists all five tiers with guest as the default", () => {
    expect(ROLES).toEqual(["guest", "player", "scholar", "mod", "admin"]);
    expect(DEFAULT_ROLE).toBe("guest");
  });

  it("has a color for every role", () => {
    for (const role of ROLES) expect(typeof ROLE_COLORS[role]).toBe("number");
  });

  it("normalizeRole passes through known roles and falls back to guest otherwise", () => {
    expect(normalizeRole("admin")).toBe("admin");
    expect(normalizeRole("wizard")).toBe("guest");
    expect(normalizeRole(undefined)).toBe("guest");
    expect(normalizeRole(null)).toBe("guest");
  });

  it("cssColor returns a lowercase #rrggbb string matching ROLE_COLORS", () => {
    expect(cssColor("mod")).toBe("#4d8df0");
    expect(cssColor("nonsense")).toBe(cssColor("guest"));
  });
});
