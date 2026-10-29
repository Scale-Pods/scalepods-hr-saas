import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TimePicker } from "./time-picker";

describe("TimePicker Component", () => {
  it("renders with placeholder when value is empty", () => {
    render(<TimePicker value="" onChange={vi.fn()} placeholder="Pick slot time" />);
    expect(screen.getByRole("button", { name: /pick slot time/i })).toBeDefined();
  });

  it("displays formatted 12-hour time when 24h value is provided", () => {
    render(<TimePicker value="09:30" onChange={vi.fn()} />);
    expect(screen.getByText("09:30 AM")).toBeDefined();
  });

  it("displays PM format correctly for afternoon time", () => {
    render(<TimePicker value="17:00" onChange={vi.fn()} />);
    expect(screen.getByText("05:00 PM")).toBeDefined();
  });

  it("opens popover and allows selecting quick workday presets", () => {
    const handleChange = vi.fn();
    render(<TimePicker value="09:00" onChange={handleChange} />);

    // Open popover
    const trigger = screen.getByRole("button", { name: /09:00 am/i });
    fireEvent.click(trigger);

    // Click 2:00 PM preset
    const presetBtn = screen.getByRole("button", { name: "2:00 PM" });
    fireEvent.click(presetBtn);

    expect(handleChange).toHaveBeenCalledWith("14:00");
  });

  it("allows selecting hours, minutes and toggling AM/PM", () => {
    const handleChange = vi.fn();
    render(<TimePicker value="10:00" onChange={handleChange} />);

    const trigger = screen.getByRole("button", { name: /10:00 am/i });
    fireEvent.click(trigger);

    // Switch to PM
    const pmBtn = screen.getByRole("button", { name: "PM" });
    fireEvent.click(pmBtn);
    expect(handleChange).toHaveBeenCalledWith("22:00");
  });
});
