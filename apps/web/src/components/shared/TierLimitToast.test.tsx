import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { isHardStop, TierLimitToast } from "./TierLimitToast";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("isHardStop", () => {
  it("treats hard_stop and an unlabelled block as hard stops", () => {
    expect(isHardStop("hard_stop")).toBe(true);
    expect(isHardStop(undefined)).toBe(true);
  });

  it("treats held reasons as informational", () => {
    expect(isHardStop("held_for_window")).toBe(false);
    expect(isHardStop("held_for_cap")).toBe(false);
  });
});

describe("TierLimitToast", () => {
  it("shows an upgrade CTA and destructive emphasis for hard_stop", () => {
    render(
      <TierLimitToast
        title="Plan limit reached"
        message="Upgrade to continue"
        reason="hard_stop"
      />,
    );
    const link = screen.getByRole("link", { name: "Upgrade plan" });
    expect(link).toHaveAttribute("href", "/billing");
    expect(screen.getByRole("status").className).toContain("destructive");
  });

  it("renders held states as informational without a CTA or red styling", () => {
    render(
      <TierLimitToast
        title="Plan limit reached"
        message="Held until the next window"
        reason="held_for_window"
      />,
    );
    expect(screen.queryByRole("link", { name: "Upgrade plan" })).not.toBeInTheDocument();
    expect(screen.getByRole("status").className).not.toContain("destructive");
  });

  it("renders a Retry action when provided", () => {
    const onRetry = vi.fn();
    render(<TierLimitToast title="Something went wrong" message="Network" onRetry={onRetry} />);
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
