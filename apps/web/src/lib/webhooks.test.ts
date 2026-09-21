import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callWorkflow, TierLimitError } from "./webhooks";

const fetchMock = vi.fn();

function fakeResponse(body: unknown, status = 200, statusText = "OK") {
  return {
    status,
    statusText,
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

describe("callWorkflow", () => {
  it("maps 403 to TierLimitError with the reason", async () => {
    fetchMock.mockResolvedValue(
      fakeResponse({ error: "Plan limit reached", reason: "hard_stop" }, 403),
    );

    await expect(callWorkflow("campaigns", { body: {} })).rejects.toBeInstanceOf(TierLimitError);
  });

  it("maps 402 credit exhaustion to TierLimitError", async () => {
    fetchMock.mockResolvedValue(fakeResponse({ error: "No credits remaining" }, 402));

    await expect(callWorkflow("campaigns")).rejects.toMatchObject({ status: 402 });
  });

  it("surfaces a non-JSON body as the error detail", async () => {
    fetchMock.mockResolvedValue(fakeResponse("upstream boom", 500, "Server Error"));

    await expect(callWorkflow("campaigns")).rejects.toMatchObject({ status: 500 });
  });

  it("injects the bearer token and merges query params", async () => {
    fetchMock.mockResolvedValue(fakeResponse({ ok: true }));

    await callWorkflow("reports", {
      method: "GET",
      accessToken: "tok",
      query: { account_id: "a1" },
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/webhook/reports?account_id=a1");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer tok" });
  });

  it("strips a /webhook suffix from the configured base URL", async () => {
    process.env.NEXT_PUBLIC_N8N_BASE_URL = "https://n8n.test/webhook";
    fetchMock.mockResolvedValue(fakeResponse({ ok: true }));

    await callWorkflow("campaigns");

    expect(String(fetchMock.mock.calls[0][0])).toBe("https://n8n.test/webhook/campaigns");
    process.env.NEXT_PUBLIC_N8N_BASE_URL = "https://n8n.test";
  });

  it("returns the payload with _httpStatus", async () => {
    fetchMock.mockResolvedValue(fakeResponse({ usage: { ai_interview: 3 } }));

    const res = await callWorkflow<{ usage: { ai_interview: number } }>("reports");

    expect(res._httpStatus).toBe(200);
    expect(res.usage.ai_interview).toBe(3);
  });
});
