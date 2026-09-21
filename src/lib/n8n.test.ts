import { afterEach, describe, expect, it, vi } from "vitest";
import { callWebhook, N8nError, TierLimitError, webhookUrl } from "./n8n";

const origFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = origFetch;
  vi.restoreAllMocks();
});

function mockFetch(status: number, body: unknown) {
  globalThis.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  ) as unknown as typeof fetch;
}

describe("callWebhook error mapping", () => {
  it("maps HTTP 402 to TierLimitError with reason", async () => {
    mockFetch(402, { error: "Monthly AI interview credits exhausted", reason: "ai_interview", detail: "Top up from Billing." });
    try {
      await callWebhook("book-slot", { body: {} });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(TierLimitError);
      const n8n = err as TierLimitError;
      expect(n8n.status).toBe(402);
      expect(n8n.reason).toBe("ai_interview");
      expect(n8n.detail).toContain("Top up");
      expect(n8n.path).toBe("book-slot");
    }
  });

  it("maps HTTP 403 hard tier-limit blocks to TierLimitError", async () => {
    mockFetch(403, { error: "Campaign limit reached on this plan" });
    try {
      await callWebhook("campaigns", { body: {} });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(TierLimitError);
      const n8n = err as TierLimitError;
      expect(n8n.status).toBe(403);
      expect(n8n.message).toContain("Campaign limit reached");
    }
  });

  it("surfaces reason + detail on a 403 tier-limit block", async () => {
    mockFetch(403, { error: "blocked", reason: "active_campaigns", detail: "3 of 3 used" });
    try {
      await callWebhook("campaigns", { body: {} });
      expect.unreachable("should have thrown");
    } catch (err) {
      const n8n = err as TierLimitError;
      expect(n8n.status).toBe(403);
      expect(n8n.reason).toBe("active_campaigns");
      expect(n8n.detail).toBe("3 of 3 used");
    }
  });

  it("passes through other non-2xx statuses as plain N8nError", async () => {
    mockFetch(500, { error: "boom" });
    try {
      await callWebhook("campaigns", { body: {} });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(N8nError);
      expect(err).not.toBeInstanceOf(TierLimitError);
      expect((err as N8nError).status).toBe(500);
    }
  });

  it("returns parsed payload with the http status attached on success", async () => {
    mockFetch(200, { ok: true, score: 88 });
    const res = await callWebhook<{ ok: boolean; score: number }>("round-evaluate", { body: {} });
    expect(res.ok).toBe(true);
    expect(res.score).toBe(88);
    expect(res._httpStatus).toBe(200);
  });

  it("surfaces the webhook body error text when the response is not JSON", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("not json", { status: 502 })) as unknown as typeof fetch;
    try {
      await callWebhook("x");
      expect.unreachable("should have thrown");
    } catch (err) {
      const n8n = err as N8nError;
      expect(n8n.status).toBe(502);
      expect(n8n.message).toContain("not json");
    }
  });

  it("never double-appends /webhook when the base URL already ends in /webhook", async () => {
    vi.stubEnv("VITE_N8N_BASE_URL", "https://n8n.example/webhook");
    try {
      expect(webhookUrl("campaigns")).toBe("https://n8n.example/webhook/campaigns");

      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      ) as unknown as typeof fetch;
      globalThis.fetch = fetchMock;

      await callWebhook<{ ok: boolean }>("campaigns", { body: {} });
      const url = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(url).toBe("https://n8n.example/webhook/campaigns");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});