import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageHeader } from "./PageHeader";

describe("PageHeader", () => {
  it("renders the title as a level-1 heading", () => {
    render(<PageHeader title="Campaigns" />);
    expect(screen.getByRole("heading", { level: 1, name: "Campaigns" })).toBeInTheDocument();
  });

  it("renders the subtitle when provided", () => {
    render(<PageHeader title="Campaigns" subtitle="All active hiring drives" />);
    expect(screen.getByText("All active hiring drives")).toBeInTheDocument();
  });

  it("renders an actions slot", () => {
    render(<PageHeader title="Campaigns" actions={<button type="button">New campaign</button>} />);
    expect(screen.getByRole("button", { name: "New campaign" })).toBeInTheDocument();
  });

  it("omits the subtitle paragraph when not provided", () => {
    const { container } = render(<PageHeader title="Campaigns" />);
    expect(container.querySelectorAll("p")).toHaveLength(0);
  });
});
