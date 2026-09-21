import { describe, expect, it } from "vitest";
import { isProtectedPath, isPublicPath } from "./auth-paths";

describe("isProtectedPath", () => {
  it("protects recruiter routes and their children", () => {
    expect(isProtectedPath("/dashboard")).toBe(true);
    expect(isProtectedPath("/campaigns/123")).toBe(true);
    expect(isProtectedPath("/billing")).toBe(true);
  });

  it("leaves candidate, auth and landing routes public", () => {
    expect(isProtectedPath("/book/x")).toBe(false);
    expect(isProtectedPath("/auth")).toBe(false);
    expect(isProtectedPath("/interview/check")).toBe(false);
    expect(isProtectedPath("/")).toBe(false);
  });

  it("does not treat a prefix fragment as protected", () => {
    expect(isProtectedPath("/campaigns-archive")).toBe(false);
  });
});

describe("isPublicPath", () => {
  it("treats the landing page and api routes as public", () => {
    expect(isPublicPath("/")).toBe(true);
    expect(isPublicPath("/api/health")).toBe(true);
  });
});
