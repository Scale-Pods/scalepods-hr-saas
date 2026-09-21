import { beforeEach, describe, expect, it } from "vitest";
import { useSidebarStore } from "./sidebar";

describe("sidebar store", () => {
  beforeEach(() => {
    localStorage.clear();
    useSidebarStore.setState({ collapsed: false });
  });

  it("toggles collapsed", () => {
    useSidebarStore.getState().toggle();
    expect(useSidebarStore.getState().collapsed).toBe(true);
  });

  it("persists the choice to localStorage", () => {
    useSidebarStore.getState().setCollapsed(true);
    expect(localStorage.getItem("sp-sidebar")).toContain('"collapsed":true');
  });
});
