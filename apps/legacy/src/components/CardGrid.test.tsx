import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CardGrid } from "./CardGrid";
import { MetricCard } from "./MetricCard";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

describe("CardGrid", () => {
  it("renders the requested responsive column classes", () => {
    const { container } = render(
      <CardGrid cols={{ base: 1, sm: 2, lg: 4 }} className="extra">
        <div>a</div>
        <div>b</div>
      </CardGrid>
    );
    const grid = container.firstChild as HTMLElement;
    expect(grid.classList.contains("grid")).toBe(true);
    expect(grid.classList.contains("grid-cols-1")).toBe(true);
    expect(grid.classList.contains("sm:grid-cols-2")).toBe(true);
    expect(grid.classList.contains("lg:grid-cols-4")).toBe(true);
    expect(grid.classList.contains("extra")).toBe(true);
  });
});

describe("MetricCard", () => {
  it("renders value, sub and a positive delta chip", () => {
    render(
      <MetricCard label="Interviews this week" value="12" delta={4} sub="4 scheduled" />
    );
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("+4")).toBeInTheDocument();
    expect(screen.getByText("4 scheduled")).toBeInTheDocument();
  });

  it("marks a negative delta with the destructive tone and aria text", () => {
    render(<MetricCard label="Pipeline" value="7" delta={-2} />);
    const chip = screen.getByText("-2");
    expect(chip.classList.contains("text-destructive")).toBe(true);
    expect(chip.getAttribute("aria-label")).toContain("vs previous period");
  });

  it("renders a labelled sparkline when trend is provided", () => {
    render(<MetricCard label="Interviews" value="3" trend={[1, 2, 3]} />);
    expect(screen.getByRole("img", { name: /Interviews trend/ })).toBeInTheDocument();
  });

  it("shows a skeleton instead of the value while loading", () => {
    render(<MetricCard label="Interviews" value="3" loading />);
    expect(screen.queryByText("3")).not.toBeInTheDocument();
    expect(screen.getByText("Interviews")).toBeInTheDocument();
  });
});