import { isNavItemActive, RECRUITER_NAV } from "./nav-items";

const dashboard = RECRUITER_NAV[0];
const campaigns = RECRUITER_NAV[1];

describe("isNavItemActive", () => {
  it("matches an exact item only on its own path", () => {
    expect(isNavItemActive("/dashboard", dashboard)).toBe(true);
    expect(isNavItemActive("/dashboard/reports", dashboard)).toBe(false);
  });

  it("matches child routes for non-exact items", () => {
    expect(isNavItemActive("/campaigns/123", campaigns)).toBe(true);
    expect(isNavItemActive("/campaigns", campaigns)).toBe(true);
  });

  it("does not match a sibling prefix", () => {
    expect(isNavItemActive("/campaigns-archive", campaigns)).toBe(false);
  });
});
