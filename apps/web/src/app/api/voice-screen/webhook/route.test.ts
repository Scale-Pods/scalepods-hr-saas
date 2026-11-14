import type { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("Voice Screen Webhook Route", () => {
  it("ignores verification pings gracefully", async () => {
    const req = new Request("http://localhost:3000/api/voice-screen/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_type: "verification" }),
    });
    const res = await POST(req as unknown as NextRequest);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.message).toBe("DialNexa webhook verified");
  });

  it("ignores test call webhooks without storing to database", async () => {
    const req = new Request("http://localhost:3000/api/voice-screen/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payload: {
          id: "call_test_999",
          is_test_call: true,
          candidate_id: "cand_123",
          postcallanalysis: {
            overall_score: 85,
            sentiment: "POSITIVE",
          },
        },
      }),
    });
    const res = await POST(req as unknown as NextRequest);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.is_test_call).toBe(true);
    expect(data.message).toContain("not stored in database");
  });

  it("ignores test calls identified by recruiter test candidate name", async () => {
    const req = new Request("http://localhost:3000/api/voice-screen/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payload: {
          id: "call_test_888",
          candidate_name: "Recruiter Test",
          candidate_id: "cand_123",
          postcallanalysis: {
            overall_score: 90,
          },
        },
      }),
    });
    const res = await POST(req as unknown as NextRequest);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.is_test_call).toBe(true);
  });
});
