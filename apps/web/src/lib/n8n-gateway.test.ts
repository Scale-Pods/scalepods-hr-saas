import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callN8nGateway } from "./n8n-gateway";

vi.mock("@/env", () => ({
  getEnv: () => ({
    NEXT_PUBLIC_N8N_BASE_URL: "https://n8n.example.com",
  }),
}));

describe("callN8nGateway", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("translates duplicate candidate workflow error to Candidate already added message", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      status: 400,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            message: "Workflow execution failed with error: candidate_already_uploaded",
          }),
        ),
    } as unknown as Response);

    const { payload } = await callN8nGateway("hiring/application-intake", "mock-token", {});
    expect(payload).toEqual({
      message: "Candidate already added to this campaign",
      error: "Candidate already added to this campaign",
      code: "candidate_already_uploaded",
    });
  });

  it("translates 23505 duplicate code to Candidate already added message", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      status: 400,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            code: "23505",
            message: "duplicate key value violates unique constraint",
          }),
        ),
    } as unknown as Response);

    const { payload } = await callN8nGateway("hiring/application-intake", "mock-token", {});
    expect(payload).toEqual({
      code: "candidate_already_uploaded",
      error: "Candidate already added to this campaign",
      message: "Candidate already added to this campaign",
    });
  });

  it("translates generic error in the workflow to user friendly message", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      status: 500,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            message: "There was an error in the workflow execution",
          }),
        ),
    } as unknown as Response);

    const { payload } = await callN8nGateway("hiring/application-intake", "mock-token", {});
    expect(payload).toEqual({
      error: "Workflow execution failed. Please check your inputs and try again.",
      message: "Workflow execution failed. Please check your inputs and try again.",
    });
  });
});
