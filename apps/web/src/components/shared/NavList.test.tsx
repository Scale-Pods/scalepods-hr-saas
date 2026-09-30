import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NavList } from "./NavList";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("NavList", () => {
  it("renders every recruiter nav link", () => {
    render(<NavList pathname="/dashboard" />);
    for (const label of ["Dashboard", "Campaigns", "Usage & Billing", "Settings"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("marks the active route with aria-current=page", () => {
    render(<NavList pathname="/campaigns" />);
    expect(screen.getByRole("link", { name: "Campaigns" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
  });

  it("marks a child route as active for a non-exact item", () => {
    render(<NavList pathname="/campaigns/123" />);
    expect(screen.getByRole("link", { name: "Campaigns" })).toHaveAttribute("aria-current", "page");
  });
});
