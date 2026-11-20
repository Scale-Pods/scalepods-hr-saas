import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

const mockMaybeSingle = vi.fn();
const mockEq = vi.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: vi.fn(async () => ({
    from: (...args: unknown[]) => mockFrom(...args) as unknown,
  })) as unknown,
}));

describe("GET & POST /api/auth/check-domain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exempts scalepods.co permanently", async () => {
    const req = new NextRequest("http://localhost/api/auth/check-domain?domain=scalepods.co");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.allowed).toBe(true);
    expect(data.isExempt).toBe(true);
    expect(data.domain).toBe("scalepods.co");
  });

  it("exempts subdomains of scalepods.co (e.g. admin@hr.scalepods.co)", async () => {
    const req = new NextRequest("http://localhost/api/auth/check-domain", {
      method: "POST",
      body: JSON.stringify({ email: "admin@hr.scalepods.co" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.allowed).toBe(true);
    expect(data.isExempt).toBe(true);
  });

  it("blocks consumer webmail domains like gmail.com", async () => {
    const req = new NextRequest("http://localhost/api/auth/check-domain?email=recruiter@gmail.com");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.allowed).toBe(false);
    expect(data.code).toBe("BLOCKED_CONSUMER");
    expect(data.isExempt).toBe(false);
  });

  it("blocks disposable email domains like tempmail.com", async () => {
    const req = new NextRequest("http://localhost/api/auth/check-domain", {
      method: "POST",
      body: JSON.stringify({ email: "user@tempmail.com" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.allowed).toBe(false);
    expect(data.code).toBe("BLOCKED_CONSUMER");
  });

  it("blocks signups if domain has exhausted free tier", async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        domain: "acme.com",
        tier: "free",
        is_free_tier_exhausted: true,
        is_exempt: false,
        primary_account_id: "00000000-0000-0000-0000-000000000001",
      },
      error: null,
    });

    const req = new NextRequest("http://localhost/api/auth/check-domain?domain=acme.com");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.allowed).toBe(false);
    expect(data.code).toBe("FREE_TIER_EXHAUSTED");
    expect(data.isExhausted).toBe(true);
  });

  it("blocks duplicate signups if domain is on free tier", async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        domain: "acme.com",
        tier: "free",
        is_free_tier_exhausted: false,
        is_exempt: false,
        primary_account_id: "00000000-0000-0000-0000-000000000001",
      },
      error: null,
    });

    const req = new NextRequest("http://localhost/api/auth/check-domain?email=bob@acme.com");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.allowed).toBe(false);
    expect(data.code).toBe("DOMAIN_EXISTS_FREE");
  });

  it("allows new valid company domains", async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const req = new NextRequest("http://localhost/api/auth/check-domain?email=hr@newstartup.io");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.allowed).toBe(true);
    expect(data.domain).toBe("newstartup.io");
    expect(data.isExhausted).toBe(false);
  });
});
