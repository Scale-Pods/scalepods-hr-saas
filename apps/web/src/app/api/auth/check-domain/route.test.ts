import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

let mockDomainData: unknown = null;
let mockAccountCount = 0;

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: vi.fn(async () => ({
    from: (table: string) => {
      if (table === "company_domains") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: mockDomainData, error: null }),
            }),
          }),
        };
      }
      if (table === "accounts") {
        return {
          select: () => ({
            eq: async () => ({ count: mockAccountCount, error: null }),
          }),
        };
      }
      return {};
    },
  })),
}));

describe("GET & POST /api/auth/check-domain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDomainData = null;
    mockAccountCount = 0;
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

  it("blocks signups if domain has exhausted free tier", async () => {
    mockDomainData = {
      domain: "acme.com",
      tier: "free",
      is_free_tier_exhausted: true,
      is_exempt: false,
      primary_account_id: "00000000-0000-0000-0000-000000000001",
    };

    const req = new NextRequest("http://localhost/api/auth/check-domain?domain=acme.com");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.allowed).toBe(false);
    expect(data.code).toBe("FREE_TIER_EXHAUSTED");
    expect(data.isExhausted).toBe(true);
  });

  it("blocks signups when Free domain reaches 3 accounts limit", async () => {
    mockDomainData = {
      domain: "acme.com",
      tier: "free",
      is_free_tier_exhausted: false,
      is_exempt: false,
      primary_account_id: "00000000-0000-0000-0000-000000000001",
    };
    mockAccountCount = 3; // already has 3 accounts

    const req = new NextRequest("http://localhost/api/auth/check-domain?email=fourth@acme.com");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.allowed).toBe(false);
    expect(data.code).toBe("DOMAIN_ACCOUNT_LIMIT_REACHED");
    expect(data.maxAccounts).toBe(3);
    expect(data.currentCount).toBe(3);
  });

  it("allows signups when Free domain has fewer than 3 accounts", async () => {
    mockDomainData = {
      domain: "acme.com",
      tier: "free",
      is_free_tier_exhausted: false,
      is_exempt: false,
      primary_account_id: "00000000-0000-0000-0000-000000000001",
    };
    mockAccountCount = 2; // has 2 accounts, 3rd is allowed

    const req = new NextRequest("http://localhost/api/auth/check-domain?email=third@acme.com");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.allowed).toBe(true);
    expect(data.maxAccounts).toBe(3);
    expect(data.currentCount).toBe(2);
  });

  it("allows up to 5 accounts for Growth and 10 for Enterprise", async () => {
    mockDomainData = {
      domain: "scalepods.tech",
      tier: "enterprise",
      is_free_tier_exhausted: false,
      is_exempt: false,
      primary_account_id: "00000000-0000-0000-0000-000000000001",
    };
    mockAccountCount = 9; // enterprise allows 10

    const req = new NextRequest("http://localhost/api/auth/check-domain?email=ten@scalepods.tech");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.allowed).toBe(true);
    expect(data.maxAccounts).toBe(10);
    expect(data.currentCount).toBe(9);
  });

  it("blocks 11th account on Enterprise plan", async () => {
    mockDomainData = {
      domain: "scalepods.tech",
      tier: "enterprise",
      is_free_tier_exhausted: false,
      is_exempt: false,
      primary_account_id: "00000000-0000-0000-0000-000000000001",
    };
    mockAccountCount = 10;

    const req = new NextRequest(
      "http://localhost/api/auth/check-domain?email=eleven@scalepods.tech",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.allowed).toBe(false);
    expect(data.code).toBe("DOMAIN_ACCOUNT_LIMIT_REACHED");
    expect(data.maxAccounts).toBe(10);
  });
});
