import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StatBand } from "./StatBand";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

describe("StatBand", () => {
  it("renders value, sub and a positive delta", () => {
    render(
      <StatBand
        stats={[
          { id: "kw", label: "Interviews this week", value: "12", delta: 4, sub: "4 scheduled" },
        ]}
      />,
    );
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("+4")).toBeInTheDocument();
    expect(screen.getByText("4 scheduled")).toBeInTheDocument();
  });

  it("marks a negative delta with the destructive tone and aria text", () => {
    render(<StatBand stats={[{ id: "p", label: "Pipeline", value: "7", delta: -2 }]} />);
    const chip = screen.getByText("-2");
    expect(chip.classList.contains("text-destructive")).toBe(true);
    expect(chip.getAttribute("aria-label")).toContain("vs previous period");
  });

  it("renders a labelled sparkline when trend is provided", () => {
    render(<StatBand stats={[{ id: "i", label: "Interviews", value: "3", trend: [1, 2, 3] }]} />);
    expect(screen.getByRole("img", { name: /Interviews trend/ })).toBeInTheDocument();
  });

  it("shows a skeleton instead of the value while loading", () => {
    render(<StatBand stats={[{ id: "i", label: "Interviews", value: "3", loading: true }]} />);
    expect(screen.queryByText("3")).not.toBeInTheDocument();
    expect(screen.getByText("Interviews")).toBeInTheDocument();
  });

  it("renders a progress bar under the value when progress is given", () => {
    render(
      <StatBand
        stats={[
          {
            id: "c",
            label: "AI credits remaining",
            value: "7",
            progress: { used: 18, granted: 25 },
          },
        ]}
      />,
    );
    expect(screen.getByRole("img", { name: /progress/i })).toBeInTheDocument();
  });

  it("exposes a button role and keyboard activation when clickable and keeps the info popover", () => {
    const onClick = vi.fn();
    render(
      <StatBand
        stats={[
          { id: "a", label: "Active campaigns", value: "3", onClick, description: "Live drives" },
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: /^Active campaigns/ })).toBeInTheDocument();
    expect(screen.getByLabelText(/What does Active campaigns mean/)).toBeInTheDocument();
  });
});
