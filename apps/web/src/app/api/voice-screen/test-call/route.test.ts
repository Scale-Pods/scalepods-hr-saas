import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";

describe("Voice Screen Test Call API Route", () => {
  it("returns 400 if phone_number is missing", async () => {
    const req = new Request("http://localhost:3000/api/voice-screen/test-call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/Phone number is required/);
  });

  it("normalizes phone and triggers call dispatch via primary n8n backend", async () => {
    const originalFetch = global.fetch;
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/webhook/voice-screen")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              status: "call_initiated",
              call_id: "n8n_call_mock_12345",
            }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 201,
        json: async () => ({ id: "fallback_call" }),
      });
    });
    global.fetch = mockFetch;

    try {
      const req = new Request("http://localhost:3000/api/voice-screen/test-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone_number: "9876543210",
          candidate_name: "John Doe",
          role_title: "Senior Fullstack Engineer",
          voice_call_config: {
            response_eagerness: 0.85,
            voice: "rachel",
            prompt: "Test screening prompt",
          },
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.mode).toBe("n8n_backend");
      expect(data.call_id).toBe("n8n_call_mock_12345");
      expect(data.to_phone_number).toBe("+919876543210");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/webhook/voice-screen"),
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"is_test_call":true'),
        }),
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("returns error response if n8n backend returns non-200", async () => {
    const originalFetch = global.fetch;
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/webhook/voice-screen")) {
        return Promise.resolve({
          ok: false,
          status: 400,
          text: async () => JSON.stringify({ error: "Invalid n8n voice parameters" }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, text: async () => "{}" });
    });
    global.fetch = mockFetch;

    try {
      const req = new Request("http://localhost:3000/api/voice-screen/test-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone_number: "+919876543210",
          candidate_name: "Test User",
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Invalid n8n voice parameters");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("returns 500 when n8n backend is unreachable", async () => {
    const originalFetch = global.fetch;
    const mockFetch = vi.fn().mockImplementation(() => {
      return Promise.reject(new Error("n8n network timeout"));
    });
    global.fetch = mockFetch;

    try {
      const req = new Request("http://localhost:3000/api/voice-screen/test-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone_number: "+919876543210",
          candidate_name: "Timeout Test",
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toMatch(/Failed to dispatch test call via n8n backend/);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("syncs dynamic prompt and greeting to DialNexa agent before dispatching call", async () => {
    const originalFetch = global.fetch;
    const fetchCalls: { url: string; options: RequestInit | undefined }[] = [];
    const mockFetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      fetchCalls.push({ url, options });
      if (url.includes("/v1/agents/")) {
        if (options?.method === "PATCH") {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              status: "success",
              data: { id: "agent_Lg812J59k27OXl" },
            }),
          });
        }
        // GET agent version
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            data: { current_version_number: 13 },
          }),
        });
      }
      if (url.includes("/webhook/voice-screen")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              status: "call_initiated",
              call_id: "call_dialnexa_9988",
            }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    });
    global.fetch = mockFetch;

    try {
      const req = new Request("http://localhost:3000/api/voice-screen/test-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone_number: "+919100456239",
          candidate_name: "Manish",
          role_title: "Sales and Marketing intern",
          company_name: "ScalePods",
          voice_call_config: {
            agent_id: "agent_Lg812J59k27OXl",
            prompt:
              "Interview candidate {{candidate_name}} for the {{job_title}} role at {{company_name}}.",
            first_message: "Hello {{candidate_name}}, welcome to {{company_name}}!",
            response_eagerness: 0.85,
            responsiveness: 0.9,
          },
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const patchCall = fetchCalls.find(
        (c) => c.url.includes("/v1/agents/agent_Lg812J59k27OXl") && c.options?.method === "PATCH",
      );
      expect(patchCall).toBeDefined();

      const patchBody = JSON.parse(String(patchCall?.options?.body));
      expect(patchBody.version_number).toBe(13);
      expect(patchBody.prompt_text).toBe(
        "Interview candidate Manish for the Sales and Marketing intern role at ScalePods.",
      );
      expect(patchBody.welcome_message).toBe("Hello Manish, welcome to ScalePods!");
      expect(patchBody.response_eagerness).toBe(0.85);
      expect(patchBody.responsiveness).toBe(0.9);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
