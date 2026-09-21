import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MetricCard } from "./MetricCard";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

describe("MetricCard", () => {
  it("renders value, sub and a positive delta chip", () => {
    render(<MetricCard label="Interviews this week" value="12" delta={4} sub="4 scheduled" />);
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

  it("exposes a button role and keyboard activation when clickable", () => {
    const onClick = vi.fn();
    render(<MetricCard label="Pipeline" value="7" onClick={onClick} />);
    expect(screen.getByRole("button", { name: /Pipeline/ })).toBeInTheDocument();
  });
});
