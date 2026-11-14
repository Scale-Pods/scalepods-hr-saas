import { describe, expect, it, vi } from "vitest";
import { GET } from "./route";

describe("Call Status API Route", () => {
  it("returns empty list if neither phone nor call_id is supplied", async () => {
    const req = new Request("http://localhost:3000/api/voice-screen/call-status");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.calls).toEqual([]);
  });

  it("fetches single call by call_id", async () => {
    const originalFetch = global.fetch;
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/v1/calls/call_test_123")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            id: "call_test_123",
            duration: "75",
            status: "completed",
            called_time: "2026-09-29T10:00:00Z",
            end_reason: "completed",
            recording_sas_url: "https://example.com/recording.mp3",
            postcallanalysis: {
              sentiment: "POSITIVE",
              call_successful: "Successful",
            },
          }),
        });
      }
      if (url.includes("deepgram.com")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            results: {
              channels: [
                {
                  alternatives: [
                    {
                      transcript: "Hello candidate, are you ready? Yes I am.",
                      words: [
                        { word: "Hello", speaker: 0, start: 0, end: 0.5 },
                        { word: "candidate,", speaker: 0, start: 0.6, end: 1.0 },
                        { word: "Yes", speaker: 1, start: 1.5, end: 1.8 },
                        { word: "I", speaker: 1, start: 1.9, end: 2.0 },
                        { word: "am.", speaker: 1, start: 2.1, end: 2.3 },
                      ],
                    },
                  ],
                },
              ],
            },
          }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    });
    global.fetch = mockFetch;

    try {
      const req = new Request(
        "http://localhost:3000/api/voice-screen/call-status?call_id=call_test_123",
      );
      const res = await GET(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.call.id).toBe("call_test_123");
      expect(data.call.duration).toBe(75);
      expect(data.call.status).toBe("completed");
      expect(data.call.recording_url).toBe("https://example.com/recording.mp3");
      expect(data.call.transcript).toBe("Hello candidate, are you ready? Yes I am.");
      expect(data.call.turns).toHaveLength(2);
      expect(data.call.turns[0].speaker).toBe("agent");
      expect(data.call.turns[1].speaker).toBe("candidate");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("correctly identifies candidate when candidate speaks first to answer the phone", async () => {
    const originalFetch = global.fetch;
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/v1/calls/call_cand_first")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            id: "call_cand_first",
            duration: "60",
            status: "completed",
            recording_sas_url: "https://example.com/recording_cand_first.mp3",
          }),
        });
      }
      if (url.includes("deepgram.com")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            results: {
              utterances: [
                {
                  speaker: 0,
                  transcript: "Hello, who is this?",
                  start: 0.2,
                  end: 1.5,
                },
                {
                  speaker: 1,
                  transcript:
                    "Hi there, this is Alex calling from ScalePods regarding your application for the developer role.",
                  start: 1.8,
                  end: 6.2,
                },
                {
                  speaker: 0,
                  transcript: "Yes, I built full-stack microservices with Docker and PostgreSQL.",
                  start: 6.5,
                  end: 10.0,
                },
              ],
            },
          }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    });
    global.fetch = mockFetch;

    try {
      const req = new Request(
        "http://localhost:3000/api/voice-screen/call-status?call_id=call_cand_first",
      );
      const res = await GET(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.call.turns).toHaveLength(3);
      // Speaker 0 ("Hello, who is this?") is candidate
      expect(data.call.turns[0].speaker).toBe("candidate");
      expect(data.call.turns[0].text).toBe("Hello, who is this?");
      // Speaker 1 ("Hi there, this is Alex calling from ScalePods...") is agent
      expect(data.call.turns[1].speaker).toBe("agent");
      // Speaker 0 ("Yes, I built full-stack microservices with Docker and PostgreSQL.") is candidate
      expect(data.call.turns[2].speaker).toBe("candidate");
      expect(data.call.turns[2].text).toBe(
        "Yes, I built full-stack microservices with Docker and PostgreSQL.",
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("fetches matching calls by phone number", async () => {
    const originalFetch = global.fetch;
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith("/v1/calls")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [
            {
              id: "call_phone_1",
              to_number: "+919876543210",
              duration: "45",
              status: "completed",
              recording_sas_url: "https://example.com/call1.mp3",
            },
            {
              id: "call_other_2",
              to_number: "+15551234567",
              duration: "10",
              status: "completed",
            },
          ],
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    });
    global.fetch = mockFetch;

    try {
      const req = new Request(
        "http://localhost:3000/api/voice-screen/call-status?phone=+919876543210",
      );
      const res = await GET(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.calls).toHaveLength(1);
      expect(data.calls[0].id).toBe("call_phone_1");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("excludes test calls when querying for candidate calls", async () => {
    const originalFetch = global.fetch;
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith("/v1/calls")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [
            {
              id: "call_real_candidate",
              to_number: "+919876543210",
              duration: "120",
              status: "completed",
              source: "scalepods_direct_dispatch",
            },
            {
              id: "call_test_1",
              to_number: "+919876543210",
              duration: "30",
              status: "completed",
              is_test_call: true,
            },
            {
              id: "call_test_2",
              to_number: "+919876543210",
              duration: "45",
              status: "completed",
              metadata: { is_test_call: true, source: "scalepods_test_call" },
            },
            {
              id: "call_test_3",
              to_number: "+919876543210",
              duration: "25",
              status: "completed",
              notes: JSON.stringify({ candidate_name: "Recruiter Test" }),
            },
          ],
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    });
    global.fetch = mockFetch;

    try {
      // 1. Without is_test_call=true: test calls must be strictly excluded from frontend candidate views
      const req = new Request(
        "http://localhost:3000/api/voice-screen/call-status?phone=+919876543210",
      );
      const res = await GET(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.calls).toHaveLength(1);
      expect(data.calls[0].id).toBe("call_real_candidate");

      // 2. With is_test_call=true: only test calls should be returned
      const testReq = new Request(
        "http://localhost:3000/api/voice-screen/call-status?phone=+919876543210&is_test_call=true",
      );
      const testRes = await GET(testReq);
      expect(testRes.status).toBe(200);
      const testData = await testRes.json();
      expect(testData.success).toBe(true);
      const ids = testData.calls.map((c: { id: string }) => c.id);
      expect(ids).toContain("call_test_1");
      expect(ids).toContain("call_test_2");
      expect(ids).toContain("call_test_3");
      expect(ids).not.toContain("call_real_candidate");
    } finally {
      global.fetch = originalFetch;
    }
  });
});
