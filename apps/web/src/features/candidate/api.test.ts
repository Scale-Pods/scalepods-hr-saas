import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bookSlot } from "./api";

const fetchMock = vi.fn();

function fakeResponse(body: unknown, status = 200, statusText = "OK") {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => (typeof body === "string" ? JSON.parse(body) : body),
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("bookSlot", () => {
  it("sanitizes generic 'There was an error in the workflow.' into a user-friendly error", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(
        { message: "There was an error in the workflow." },
        500,
        "Internal Server Error",
      ),
    );

    await expect(
      bookSlot({
        round_instance_id: "ri-123",
        token: "tok-456",
        slot_start: "2026-11-03T10:00:00Z",
        slot_end: "2026-11-03T10:45:00Z",
      }),
    ).rejects.toThrow(
      "Unable to book this slot at this time. Please choose another slot or contact the recruiter.",
    );
  });

  it("preserves specific detail when provided in workflow error response", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse(
        {
          message: "There was an error in the workflow.",
          detail: "Interviewer calendar is disconnected. Please contact support.",
        },
        500,
        "Internal Server Error",
      ),
    );

    await expect(
      bookSlot({
        round_instance_id: "ri-123",
        token: "tok-456",
        slot_start: "2026-11-03T10:00:00Z",
        slot_end: "2026-11-03T10:45:00Z",
      }),
    ).rejects.toThrow("Interviewer calendar is disconnected. Please contact support.");
  });

  it("handles 409 conflict slot nicely", async () => {
    fetchMock.mockResolvedValue(fakeResponse({ error: "Conflict" }, 409, "Conflict"));

    await expect(
      bookSlot({
        round_instance_id: "ri-123",
        token: "tok-456",
        slot_start: "2026-11-03T10:00:00Z",
        slot_end: "2026-11-03T10:45:00Z",
      }),
    ).rejects.toThrow("Conflict");
  });
});
