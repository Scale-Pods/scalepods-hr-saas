import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRpc } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    rpc: mockRpc,
  }),
}));

import { GET, POST } from "./route";

describe("/api/interview/reschedule-request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
  });

  it("GET returns 400 when token is missing", async () => {
    const req = new NextRequest("http://localhost:3000/api/interview/reschedule-request");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("GET returns context from get_interviewer_reschedule_context", async () => {
    mockRpc.mockResolvedValueOnce({
      data: { is_valid: true, status: "active", candidate_name: "Ada" },
      error: null,
    });
    const req = new NextRequest(
      "http://localhost:3000/api/interview/reschedule-request?token=abcdef1234567890",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.candidate_name).toBe("Ada");
    expect(mockRpc).toHaveBeenCalledWith("get_interviewer_reschedule_context", {
      p_token: "abcdef1234567890",
    });
  });

  it("POST issues booking token and calls n8n webhook", async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        success: true,
        round_instance_id: "ri-1",
        booking_token: "cand-tok-123",
        candidate_name: "Ada",
        candidate_email: "ada@example.com",
      },
      error: null,
    });

    const req = new NextRequest("http://localhost:3000/api/interview/reschedule-request", {
      method: "POST",
      body: JSON.stringify({
        token: "abcdef1234567890",
        reason: "Schedule conflict",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      success: true,
      candidate_name: "Ada",
      candidate_email: "ada@example.com",
    });

    expect(mockRpc).toHaveBeenCalledWith("request_interviewer_reschedule", {
      p_token: "abcdef1234567890",
      p_reason: "Schedule conflict",
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/webhook/interviewer-reschedule-request"),
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("/book/ri-1?tok=cand-tok-123&mode=reschedule"),
      }),
    );
  });

  it("POST returns 409 when already requested", async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: "reschedule_already_requested" },
    });

    const req = new NextRequest("http://localhost:3000/api/interview/reschedule-request", {
      method: "POST",
      body: JSON.stringify({ token: "abcdef1234567890" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(409);
  });
});
