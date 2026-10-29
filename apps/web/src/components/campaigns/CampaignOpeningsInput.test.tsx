import { campaignCreateSchema } from "@scalepods/core";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Input } from "@/components/ui/input";

function TestOpeningsInput() {
  const [numberOfOpenings, setNumberOfOpenings] = useState<number | string>(1);

  return (
    <div>
      <label htmlFor="number-of-openings">Number of Openings (Capacity) *</label>
      <Input
        id="number-of-openings"
        type="number"
        min={0}
        value={numberOfOpenings}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") {
            setNumberOfOpenings("");
            return;
          }
          const clean = raw.replace(/^0+(?=\d)/, "");
          const parsed = parseInt(clean, 10);
          if (!Number.isNaN(parsed) && parsed >= 0) {
            setNumberOfOpenings(clean === "0" ? 0 : parsed);
          }
        }}
        onBlur={() => {
          if (
            numberOfOpenings === "" ||
            Number.isNaN(Number(numberOfOpenings)) ||
            Number(numberOfOpenings) < 0
          ) {
            setNumberOfOpenings(0);
          }
        }}
      />
    </div>
  );
}

describe("Campaign Openings Configuration", () => {
  it("renders with default value of 1", () => {
    render(<TestOpeningsInput />);
    const input = screen.getByLabelText(/Number of Openings/i) as HTMLInputElement;
    expect(input.value).toBe("1");
    expect(input.getAttribute("min")).toBe("0");
  });

  it("allows clearing the field and typing 0 directly without resetting to 1", async () => {
    const user = userEvent.setup();
    render(<TestOpeningsInput />);
    const input = screen.getByLabelText(/Number of Openings/i) as HTMLInputElement;

    await user.clear(input);
    expect(input.value).toBe("");

    await user.type(input, "0");
    expect(input.value).toBe("0");
  });

  it("allows typing 0 after 1 to smoothly produce 10", async () => {
    const user = userEvent.setup();
    render(<TestOpeningsInput />);
    const input = screen.getByLabelText(/Number of Openings/i) as HTMLInputElement;

    // input starts at 1, typing 0 at the end should give 10
    await user.type(input, "0");
    expect(input.value).toBe("10");
  });

  it("allows typing any positive number up to infinity (e.g. 500, 100000)", async () => {
    const user = userEvent.setup();
    render(<TestOpeningsInput />);
    const input = screen.getByLabelText(/Number of Openings/i) as HTMLInputElement;

    await user.clear(input);
    await user.type(input, "500000");
    expect(input.value).toBe("500000");
  });

  it("gracefully falls back to 0 on blur if left empty", async () => {
    const user = userEvent.setup();
    render(<TestOpeningsInput />);
    const input = screen.getByLabelText(/Number of Openings/i) as HTMLInputElement;

    await user.clear(input);
    expect(input.value).toBe("");
    fireEvent.blur(input);
    expect(input.value).toBe("0");
  });

  it("validates that campaignCreateSchema accepts 0 and large openings", () => {
    const basePayload = {
      action: "create",
      account_id: "ce0a8919-6cc7-4cef-b591-32e35e4edaa7",
      name: "Engineering Lead",
      jd_text: "Lead engineering team.",
      number_of_rounds: 1,
      rounds: [
        {
          round_number: 1,
          round_type: "ai_interview",
          cutoff_score: 75,
        },
      ],
      cadence_config: { stages: {} },
      voice_call_config: undefined,
    };

    // 0 openings
    const resZero = campaignCreateSchema.safeParse({
      ...basePayload,
      number_of_openings: 0,
    });
    expect(resZero.success).toBe(true);

    // 10 openings
    const resTen = campaignCreateSchema.safeParse({
      ...basePayload,
      number_of_openings: 10,
    });
    expect(resTen.success).toBe(true);

    // 1,000,000 openings
    const resMillion = campaignCreateSchema.safeParse({
      ...basePayload,
      number_of_openings: 1000000,
    });
    expect(resMillion.success).toBe(true);

    // Negative openings should fail
    const resNegative = campaignCreateSchema.safeParse({
      ...basePayload,
      number_of_openings: -1,
    });
    expect(resNegative.success).toBe(false);
  });
});
