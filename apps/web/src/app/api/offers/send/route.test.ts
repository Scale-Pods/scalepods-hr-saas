import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("/api/offers/send", () => {
  it("rejects invalid request payloads with 400", async () => {
    const req = new NextRequest("http://localhost:3000/api/offers/send", {
      method: "POST",
      body: JSON.stringify({ invalid: true }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Validation failed");
  });

  it("rejects unauthorized requests with 401 when no token is supplied", async () => {
    const req = new NextRequest("http://localhost:3000/api/offers/send", {
      method: "POST",
      body: JSON.stringify({
        campaign_id: "00000000-0000-0000-0000-000000000001",
        application_id: "00000000-0000-0000-0000-000000000002",
        field_values: {
          position_title: "Staff Engineer",
          salary: "150,000",
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });
});
