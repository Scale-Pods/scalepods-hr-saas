import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_DIALNEXA_AGENT_ID,
  DEFAULT_DIALNEXA_OUTBOUND_FROM_NUMBER,
  DEFAULT_DIALNEXA_PHONE_NUMBER_ID,
  formatE164PhoneNumber,
  interpolateDialnexaVariables,
  resolveDialnexaVoiceId,
  resolveOutboundFromNumber,
  syncDialnexaAgentConfig,
} from "./dialnexa";

describe("DialNexa Integration Lib", () => {
  describe("formatE164PhoneNumber", () => {
    it("returns empty string on empty/null/undefined input", () => {
      expect(formatE164PhoneNumber(undefined)).toBe("");
      expect(formatE164PhoneNumber(null)).toBe("");
      expect(formatE164PhoneNumber("")).toBe("");
      expect(formatE164PhoneNumber("   ")).toBe("");
    });

    it("formats 10-digit phone number with default Indian country code (+91)", () => {
      expect(formatE164PhoneNumber("2264233051")).toBe("+912264233051");
      expect(formatE164PhoneNumber("9876543210")).toBe("+919876543210");
    });

    it("cleans up formatting spaces, dashes, and parentheses", () => {
      expect(formatE164PhoneNumber("+91 (22) 6423-3051")).toBe("+912264233051");
      expect(formatE164PhoneNumber("98765-43210")).toBe("+919876543210");
    });

    it("preserves already formatted E.164 numbers", () => {
      expect(formatE164PhoneNumber("+912264233051")).toBe("+912264233051");
      expect(formatE164PhoneNumber("+14155552671")).toBe("+14155552671");
      expect(formatE164PhoneNumber("+447911123456")).toBe("+447911123456");
    });

    it("handles 00 international prefix and country code without +", () => {
      expect(formatE164PhoneNumber("00912264233051")).toBe("+912264233051");
      expect(formatE164PhoneNumber("912264233051")).toBe("+912264233051");
    });
  });

  describe("resolveOutboundFromNumber", () => {
    it("returns custom from number formatted with country code", () => {
      const res = resolveOutboundFromNumber("2264233051");
      expect(res.fromNumber).toBe("+912264233051");
    });

    it("extracts and formats first outbound number from DialNexa agent profile", () => {
      const res = resolveOutboundFromNumber(undefined, [
        {
          id: "phn_custom_001",
          phone_number: "2264233051",
          country_iso: "91",
        },
      ]);
      expect(res.fromNumber).toBe("+912264233051");
      expect(res.phoneNumberId).toBe("phn_custom_001");
    });

    it("falls back to default ScalePods DialNexa outbound number and phone ID", () => {
      const res = resolveOutboundFromNumber(undefined, []);
      expect(res.fromNumber).toBe(DEFAULT_DIALNEXA_OUTBOUND_FROM_NUMBER);
      expect(res.phoneNumberId).toBe(DEFAULT_DIALNEXA_PHONE_NUMBER_ID);
    });
  });

  describe("resolveDialnexaVoiceId", () => {
    it("returns undefined for empty input", () => {
      expect(resolveDialnexaVoiceId(undefined)).toBeUndefined();
      expect(resolveDialnexaVoiceId("")).toBeUndefined();
    });

    it("returns exact voice_ ID if already prefixed with voice_", () => {
      expect(resolveDialnexaVoiceId("voice_custom_abc123")).toBe("voice_custom_abc123");
    });

    it("resolves popular ScalePods voice names to DialNexa voice IDs", () => {
      expect(resolveDialnexaVoiceId("aditi")).toBe("voice_94226a7ff47a43");
      expect(resolveDialnexaVoiceId("rohan")).toBe("voice_4897321fb9ef4e");
      expect(resolveDialnexaVoiceId("ananya")).toBe("voice_mfl4legvvrugxy");
      expect(resolveDialnexaVoiceId("aarav")).toBe("voice_e031f06ade5049");
      expect(resolveDialnexaVoiceId("priya")).toBe("voice_mol2pruwhpAXKK");
      expect(resolveDialnexaVoiceId("adam")).toBe("voice_mfl4leg14bh4of");
      expect(resolveDialnexaVoiceId("brian")).toBe("voice_mfl4leg8y7do5t");
      expect(resolveDialnexaVoiceId("rachel")).toBe("voice_mfl4leee3j8ysj");
      expect(resolveDialnexaVoiceId("shimmer")).toBe("voice_mfl4leg5yi6v0g");
      expect(resolveDialnexaVoiceId("alloy")).toBe("voice_mfl4leg14bh4of");
      expect(resolveDialnexaVoiceId("echo")).toBe("voice_mfl4leg14bh4of");
      expect(resolveDialnexaVoiceId("nova")).toBe("voice_mfl4leee3j8ysj");
      expect(resolveDialnexaVoiceId("charlotte")).toBe("voice_mfl4lef889jqu8");
      expect(resolveDialnexaVoiceId("lucy")).toBe("voice_mfl4lef889jqu8");
      expect(resolveDialnexaVoiceId("marcus")).toBe("voice_mt8ijdI5VUkm5I");
    });

    it("resolves case-insensitively and handles whitespace", () => {
      expect(resolveDialnexaVoiceId("  Aditi  ")).toBe("voice_94226a7ff47a43");
      expect(resolveDialnexaVoiceId("ROHAN")).toBe("voice_4897321fb9ef4e");
    });
  });

  describe("interpolateDialnexaVariables", () => {
    it("interpolates candidate and company variables into template", () => {
      const template =
        "Hello {{candidate_name}}, welcome to {{company_name}} for the {{job_title}} role.";
      const res = interpolateDialnexaVariables(template, {
        candidate_name: "Sarah Connor",
        company_name: "Cyberdyne",
        job_title: "Security Engineer",
      });
      expect(res).toBe("Hello Sarah Connor, welcome to Cyberdyne for the Security Engineer role.");
    });
  });

  describe("syncDialnexaAgentConfig", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("includes resolved voice_id and voice parameters in DialNexa patch payload", async () => {
      let capturedBody: Record<string, unknown> | null = null;
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
          if (init?.method === "PATCH") {
            capturedBody = JSON.parse(init.body as string);
            return Promise.resolve({
              ok: true,
              json: async () => ({
                success: true,
                statusCode: 200,
                data: { current_version_number: "57" },
              }),
            });
          }
          // GET agent
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              data: {
                current_version_number: "56",
                versions: [{ version_number: "56", is_published: false }],
              },
            }),
          });
        }),
      );

      const res = await syncDialnexaAgentConfig({
        agent_id: DEFAULT_DIALNEXA_AGENT_ID,
        voice: "aditi",
        voice_speed: 1.05,
        voice_pitch: 2,
        voice_temperature: 0.9,
        prompt: "You are an interviewer.",
        first_message: "Hi {{candidate_name}}!",
        candidate_name: "John Doe",
      });

      expect(res.success).toBe(true);
      expect(capturedBody).not.toBeNull();
      expect(capturedBody).toMatchObject({
        is_published: true,
        voice_id: "voice_94226a7ff47a43",
        voice_model_id: "mfl4be3m9z3xd4",
        voice_speed: 1.05,
        voice_pitch: 2,
        voice_temperature: 0.9,
        welcome_message: "Hi {{candidate_name}}!",
        boost_dynamic_variables: true,
      });

      vi.unstubAllGlobals();
    });

    it("replaces old campaign role with new campaign role in prompt and welcome_message", async () => {
      let capturedBody: Record<string, unknown> | null = null;
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
          if (init?.method === "PATCH") {
            capturedBody = JSON.parse(init.body as string);
            return Promise.resolve({
              ok: true,
              json: async () => ({
                success: true,
                statusCode: 200,
                data: { current_version_number: "58" },
              }),
            });
          }
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              data: {
                current_version_number: "57",
                versions: [{ version_number: "57", is_published: true }],
              },
            }),
          });
        }),
      );

      const res = await syncDialnexaAgentConfig({
        agent_id: DEFAULT_DIALNEXA_AGENT_ID,
        role_title: "AI Engineer",
        prompt:
          "You are an AI screener conducting a qualification interview with candidate {{candidate_name}} for the Sales and Marketing intern position. Assess technical fit for the position of Sales and Marketing intern.",
        first_message:
          "Hi {{candidate_name}}, I'm calling from ScalePods regarding your application for the Sales and Marketing intern position. Is now a good time?",
      });

      expect(res.success).toBe(true);
      expect(capturedBody).not.toBeNull();
      const body = capturedBody as unknown as { prompt_text: string; welcome_message: string };
      expect(body.welcome_message).toContain("AI Engineer");
      expect(body.welcome_message).not.toContain("Sales and Marketing intern");
      expect(body.prompt_text).toContain("AI Engineer");
      expect(body.prompt_text).not.toContain("Sales and Marketing intern");

      vi.unstubAllGlobals();
    });

    it("clamps welcome_message to 240 characters or less to respect DialNexa VARCHAR(255) constraint", async () => {
      let capturedBody: Record<string, unknown> | null = null;
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
          if (init?.method === "PATCH") {
            capturedBody = JSON.parse(init.body as string);
            return Promise.resolve({
              ok: true,
              json: async () => ({
                success: true,
                statusCode: 200,
                data: { current_version_number: "60" },
              }),
            });
          }
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              data: {
                current_version_number: "59",
                versions: [{ version_number: "59", is_published: true }],
              },
            }),
          });
        }),
      );

      const longGreeting =
        "Hello {{candidate_name}}! This is Jordan from engineering talent at ScalePods regarding your application for the Principal Full Stack Artificial Intelligence and Deep Learning Cloud Systems Engineer position. We would love to spend about 15 minutes discussing your background and deep learning projects — is now a good time for a call?";

      const res = await syncDialnexaAgentConfig({
        agent_id: DEFAULT_DIALNEXA_AGENT_ID,
        role_title:
          "Principal Full Stack Artificial Intelligence and Deep Learning Cloud Systems Engineer",
        first_message: longGreeting,
      });

      expect(res.success).toBe(true);
      expect(capturedBody).not.toBeNull();
      const body = capturedBody as unknown as { welcome_message: string };
      expect(body.welcome_message.length).toBeLessThanOrEqual(240);
      expect(body.welcome_message.endsWith("...")).toBe(true);

      vi.unstubAllGlobals();
    });
  });
});
