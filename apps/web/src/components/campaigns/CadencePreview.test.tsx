import type { CadenceRenderRow } from "@scalepods/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CadencePreview } from "./CadencePreview";

const mockRows: CadenceRenderRow[] = [
  {
    stage: {
      key: "shortlist",
      label: "Shortlist & booking",
      dayLabel: "Day 0",
      description: "Booking invite sent instantly.",
      channels: ["email", "whatsapp"],
      appliesTo: [],
    },
    channels: ["email", "whatsapp"],
    enabled: true,
  },
  {
    stage: {
      key: "reminder_day1",
      label: "Reminder",
      dayLabel: "Day 1",
      description: "Follow-up nudge if unbooked.",
      channels: ["email", "whatsapp"],
      appliesTo: [],
    },
    channels: ["email", "whatsapp"],
    enabled: true,
  },
  {
    stage: {
      key: "pre_interview_reminder",
      label: "Pre-interview reminder",
      dayLabel: "24h before",
      description: "Upcoming interview reminder.",
      channels: ["email", "whatsapp"],
      appliesTo: ["ai_interview", "human_interview"],
    },
    channels: ["email"],
    enabled: true,
  },
  {
    stage: {
      key: "interview_day",
      label: "Interview-day link",
      dayLabel: "Interview day",
      description: "9 AM local interview link.",
      channels: ["email"],
      appliesTo: ["ai_interview", "human_interview"],
    },
    channels: ["email"],
    enabled: true,
  },
];

describe("CadencePreview Timing Controls", () => {
  it("renders timing column and values in read-only mode", () => {
    render(<CadencePreview rows={mockRows} />);

    expect(screen.getByText("Schedule / Timing")).toBeDefined();
    expect(screen.getByText("Sent immediately (Day 0)")).toBeDefined();
    expect(screen.getByText(/1 day after invite/)).toBeDefined();
    expect(screen.getByText(/24h before slot/)).toBeDefined();
    expect(screen.getByText(/09:00 local/)).toBeDefined();
  });

  it("renders editable inputs when canEditTiming and editable are true", () => {
    const handleChangeTiming = vi.fn();
    render(
      <CadencePreview
        rows={mockRows}
        editable={true}
        canEditTiming={true}
        timingConfig={{
          reminder_day1: { dayOffset: 2, sendTime: "09:00" },
          pre_interview_reminder: { hoursBefore: 12, sendTime: "09:00" },
          interview_day: { sendHour: 10, sendTime: "10:00" },
        }}
        onChangeTiming={handleChangeTiming}
      />,
    );

    const numInputs = screen.getAllByRole("spinbutton");
    expect(numInputs.length).toBeGreaterThanOrEqual(2);

    // Change day offset for reminder_day1
    fireEvent.change(numInputs[0], { target: { value: "3" } });
    expect(handleChangeTiming).toHaveBeenCalledWith("reminder_day1", { dayOffset: 3 });

    // Change hours before for pre_interview_reminder
    fireEvent.change(numInputs[1], { target: { value: "18" } });
    expect(handleChangeTiming).toHaveBeenCalledWith("pre_interview_reminder", { hoursBefore: 18 });

    // Change time for interview_day
    const timeInputs = document.querySelectorAll('input[type="time"]');
    expect(timeInputs.length).toBeGreaterThanOrEqual(3);
    fireEvent.change(timeInputs[2], { target: { value: "08:00" } });
    expect(handleChangeTiming).toHaveBeenCalledWith("interview_day", {
      sendTime: "08:00",
      sendHour: 8,
    });
  });
});
