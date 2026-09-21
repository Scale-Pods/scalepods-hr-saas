import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Home } from "./Home";

describe("Home", () => {
  it("renders the hero and both auth options", () => {
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    );
    expect(
      screen.getByRole("heading", { name: /automate the busywork\. unlock growth\./i })
    ).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /log in/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /sign up/i }).length).toBeGreaterThan(0);
  });

  it("links auth CTAs to the auth page", () => {
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    );
    const links = screen.getAllByRole("link", { name: /log in/i });
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/auth");
    }
    const signups = screen.getAllByRole("link", { name: /sign up/i });
    for (const link of signups) {
      expect(link).toHaveAttribute("href", "/auth");
    }
  });

  it("shows the feature pillars", () => {
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>
    );
    expect(screen.getByText("Hiring Cloud")).toBeInTheDocument();
    expect(screen.getByText("Interview Cloud")).toBeInTheDocument();
    expect(screen.getByText("Pipeline Cloud")).toBeInTheDocument();
    expect(screen.getByText("Self-serve booking")).toBeInTheDocument();
  });
});