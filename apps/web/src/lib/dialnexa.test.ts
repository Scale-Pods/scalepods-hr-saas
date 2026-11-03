import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_DIALNEXA_AGENT_ID,
  interpolateDialnexaVariables,
  resolveDialnexaVoiceId,
  syncDialnexaAgentConfig,
} from "./dialnexa";

describe("DialNexa Integration Lib", () => {
  describe("resolveDialnexaVoiceId", () => {
    it("returns undefined for empty input", () => {
      expect(resolveDialnexaVoiceId(undefined)).toBeUndefined();
      expect(resolveDialnexaVoiceId("")).toBeUndefined();
    });

    it("returns exact voice_ ID if already prefixed with voice_", () => {
      expect(resolveDialnexaVoiceId("voice_custom_abc123")).toBe("voice_custom_abc123");
    });

    it("resolves popular ScalePods voice names to DialNexa voice IDs", () => {
      expect(resolveDialnexaVoiceId("aditi")).toBe("voice_mfgsys96smn4c7");
      expect(resolveDialnexaVoiceId("rohan")).toBe("voice_18662c83888c43");
      expect(resolveDialnexaVoiceId("ananya")).toBe("voice_mfl4legvvrugxy");
      expect(resolveDialnexaVoiceId("aarav")).toBe("voice_2f4c1b31555b44");
      expect(resolveDialnexaVoiceId("priya")).toBe("voice_4f1cea5ad4dc43");
      expect(resolveDialnexaVoiceId("adam")).toBe("voice_mfl4leg14bh4of");
      expect(resolveDialnexaVoiceId("brian")).toBe("voice_mfl4leg8y7do5t");
      expect(resolveDialnexaVoiceId("rachel")).toBe("voice_mfl4leee3j8ysj");
      expect(resolveDialnexaVoiceId("lucy")).toBe("voice_mfl4lef889jqu8");
      expect(resolveDialnexaVoiceId("marcus")).toBe("voice_mt8ijdI5VUkm5I");
    });

    it("resolves case-insensitively and handles whitespace", () => {
      expect(resolveDialnexaVoiceId("  Aditi  ")).toBe("voice_mfgsys96smn4c7");
      expect(resolveDialnexaVoiceId("ROHAN")).toBe("voice_18662c83888c43");
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
        voice_id: "voice_mfgsys96smn4c7",
        voice_speed: 1.05,
        voice_pitch: 2,
        voice_temperature: 0.9,
        welcome_message: "Hi John Doe!",
      });

      vi.unstubAllGlobals();
    });
  });
});
