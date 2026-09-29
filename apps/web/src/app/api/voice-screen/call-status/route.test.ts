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
});
