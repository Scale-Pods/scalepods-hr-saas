import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CardGrid } from "./CardGrid";

describe("CardGrid", () => {
  it("renders the requested responsive column classes", () => {
    const { container } = render(
      <CardGrid cols={{ base: 1, sm: 2, lg: 4 }} className="extra">
        <div>a</div>
        <div>b</div>
      </CardGrid>,
    );
    const grid = container.firstChild as HTMLElement;
    expect(grid.classList.contains("grid")).toBe(true);
    expect(grid.classList.contains("grid-cols-1")).toBe(true);
    expect(grid.classList.contains("sm:grid-cols-2")).toBe(true);
    expect(grid.classList.contains("lg:grid-cols-4")).toBe(true);
    expect(grid.classList.contains("extra")).toBe(true);
  });

  it("defaults to a single column with a gap of 4", () => {
    const { container } = render(
      <CardGrid>
        <div>a</div>
      </CardGrid>,
    );
    const grid = container.firstChild as HTMLElement;
    expect(grid.classList.contains("grid-cols-1")).toBe(true);
    expect(grid.classList.contains("gap-4")).toBe(true);
  });
});
