import { describe, expect, it } from "vitest";

import { normalizeBasePath, toAppPathname, withBasePath } from "./base-path";

describe("GitHub Pages base path", () => {
  it("keeps local development at the domain root", () => {
    expect(normalizeBasePath(undefined)).toBe("");
    expect(normalizeBasePath("/")).toBe("");
    expect(withBasePath("/login", "")).toBe("/login");
  });

  it("normalizes repository subpaths", () => {
    expect(normalizeBasePath("dewu-")).toBe("/dewu-");
    expect(normalizeBasePath(" /dewu-/ ")).toBe("/dewu-");
  });

  it("prefixes PWA routes and keeps the application root trailing slash", () => {
    expect(withBasePath("/", "/dewu-")).toBe("/dewu-/");
    expect(withBasePath("icons/icon-192.png", "/dewu-/")).toBe(
      "/dewu-/icons/icon-192.png",
    );
  });

  it("converts browser pathnames back to logical application routes", () => {
    expect(toAppPathname("/dewu-/login", "/dewu-")).toBe("/login");
    expect(toAppPathname("/dewu-/login/", "/dewu-")).toBe("/login");
    expect(toAppPathname("/dewu-/", "/dewu-")).toBe("/");
    expect(toAppPathname("/login", "/dewu-")).toBe("/login");
  });
});
