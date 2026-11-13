import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockCreateSignedUrl = vi.fn();
const mockDownload = vi.fn();

vi.mock("@/env", () => ({
  getEnv: () => ({
    NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "service-key",
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: async () => ({
    auth: {
      getUser: () => mockGetUser(),
    },
  }),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: (_url: string, _key: string, opts?: any) => {
    if (opts?.global?.headers?.Authorization) {
      return {
        auth: {
          getUser: () => mockGetUser(),
        },
      };
    }
    return {
      auth: {
        getUser: () => mockGetUser(),
      },
      from: (table: string) => mockFrom(table),
      storage: {
        from: (_bucket: string) => ({
          createSignedUrl: (...args: any[]) => mockCreateSignedUrl(...args),
          download: (...args: any[]) => mockDownload(...args),
          list: () => Promise.resolve({ data: [] }),
        }),
      },
    };
  },
}));

describe("GET /api/candidates/[id]/resume", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 if user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const req = new NextRequest("http://localhost:3000/api/candidates/cand-1/resume");
    const res = await GET(req, { params: Promise.resolve({ id: "cand-1" }) });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  it("returns 404 if candidate does not exist", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "acc-1" } } });
    mockFrom.mockImplementation((table: string) => {
      if (table === "candidates") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        };
      }
      return {};
    });

    const req = new NextRequest("http://localhost:3000/api/candidates/cand-1/resume");
    const res = await GET(req, { params: Promise.resolve({ id: "cand-1" }) });

    expect(res.status).toBe(404);
  });

  it("redirects to signed URL when candidate resume exists in storage", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "acc-1" } } });
    mockFrom.mockImplementation((table: string) => {
      if (table === "candidates") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: {
                    id: "cand-1",
                    account_id: "acc-1",
                    name: "Candidate One",
                    resume_url: null,
                  },
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === "applications") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: {
                      id: "app-1",
                      resume_path: "acc-1/camp-1/resume.pdf",
                    },
                  }),
              }),
            }),
          }),
        };
      }
      return {};
    });

    mockCreateSignedUrl.mockResolvedValue({
      data: {
        signedUrl:
          "https://test.supabase.co/storage/v1/object/sign/resumes/acc-1/camp-1/resume.pdf?token=abc",
      },
      error: null,
    });

    const req = new NextRequest(
      "http://localhost:3000/api/candidates/cand-1/resume?campaignId=camp-1",
    );
    const res = await GET(req, { params: Promise.resolve({ id: "cand-1" }) });

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("resume.pdf?token=abc");
  });
});
