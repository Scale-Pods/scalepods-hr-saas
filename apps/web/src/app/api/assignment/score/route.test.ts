import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

describe("/api/assignment/score", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects missing required fields with 400", async () => {
    const req = new NextRequest("http://localhost:3000/api/assignment/score", {
      method: "POST",
      body: JSON.stringify({ round_instance_id: "ri-1" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("forwards valid payload server-side to n8n and returns 200", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const req = new NextRequest("http://localhost:3000/api/assignment/score", {
      method: "POST",
      body: JSON.stringify({
        round_instance_id: "ri-1",
        submission_id: "sub-1",
        token: "tok-1",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("/webhook/hiring/assignment-score");
  });

  it("returns 202 gracefully if upstream scoring fails so candidate console stays clean", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("timeout"));

    const req = new NextRequest("http://localhost:3000/api/assignment/score", {
      method: "POST",
      body: JSON.stringify({
        round_instance_id: "ri-1",
        submission_id: "sub-1",
        token: "tok-1",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(202);
  });
});
