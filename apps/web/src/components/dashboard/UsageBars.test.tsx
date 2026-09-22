import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UsageBars } from "./UsageBars";

describe("UsageBars", () => {
  it("honors an explicit unlimited grant over a numeric tier cap", () => {
    render(
      <UsageBars
        slices={{ ai_voice_screening: { used: 0, granted: null } }}
        fallback={{ aiInterview: 10, aiVoiceScreening: 0, scheduledRound: 10 }}
        tierLabel="FREE"
      />,
    );
    expect(screen.getByText("0 / unlimited")).toBeInTheDocument();
    expect(screen.queryByText("0 / unlimited · FREE allowance")).not.toBeInTheDocument();
  });

  it("falls back to the tier cap when a slice is missing", () => {
    render(
      <UsageBars
        slices={{}}
        fallback={{ aiInterview: 5, aiVoiceScreening: 6, scheduledRound: 7 }}
        tierLabel="GROWTH"
      />,
    );
    expect(screen.getByText("0 / 5 · GROWTH allowance")).toBeInTheDocument();
    expect(screen.getByText("0 / 6 · GROWTH allowance")).toBeInTheDocument();
    expect(screen.getByText("0 / 7 · GROWTH allowance")).toBeInTheDocument();
  });

  it("renders used / granted from the slice when granted is numeric", () => {
    render(
      <UsageBars
        slices={{ ai_interview: { used: 4, granted: 110 } }}
        fallback={{ aiInterview: 10, aiVoiceScreening: 10, scheduledRound: 10 }}
        tierLabel="BASIC"
      />,
    );
    expect(screen.getByText("4 / 110")).toBeInTheDocument();
  });

  it("shows unlimited when neither slice nor tier cap is numeric", () => {
    render(
      <UsageBars
        slices={{}}
        fallback={{ aiInterview: null, aiVoiceScreening: null, scheduledRound: null }}
        tierLabel="ENTERPRISE"
      />,
    );
    expect(screen.getAllByText("0 / unlimited")).toHaveLength(3);
  });
});
