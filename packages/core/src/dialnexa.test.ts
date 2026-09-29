import { describe, expect, it } from "vitest";
import {
  campaignCreateSchema,
  DEFAULT_DIALNEXA_CONFIG,
  DIALNEXA_MODELS,
  DIALNEXA_VOICES,
  dialnexaVoiceConfigSchema,
} from "./index";

describe("DialNexa voice configurations & schema", () => {
  it("exports valid preset models and voices", () => {
    expect(DIALNEXA_MODELS.length).toBeGreaterThanOrEqual(4);
    expect(DIALNEXA_VOICES.length).toBeGreaterThanOrEqual(4);
    expect(DIALNEXA_MODELS.some((m) => m.id === "gpt-4o-mini")).toBe(true);
    expect(DIALNEXA_VOICES.some((v) => v.id === "rachel")).toBe(true);
  });

  it("validates DEFAULT_DIALNEXA_CONFIG with dialnexaVoiceConfigSchema", () => {
    const parsed = dialnexaVoiceConfigSchema.safeParse(DEFAULT_DIALNEXA_CONFIG);
    expect(parsed.success).toBe(true);
  });

  it("validates campaignCreateSchema with voice_call_config included", () => {
    const payload = {
      action: "create",
      account_id: "11111111-1111-1111-1111-111111111111",
      name: "Senior Frontend Engineer",
      jd_text: "React and TypeScript requirements...",
      number_of_rounds: 1,
      rounds: [
        {
          round_number: 1,
          round_type: "ai_interview",
          cutoff_score: 75,
        },
      ],
      voice_call_config: {
        model: "claude-3-5-sonnet",
        voice: "adam",
        prompt: "Screen candidate for frontend architecture experience",
        first_message: "Hello {{candidate_name}}",
        max_duration_seconds: 300,
      },
    };

    const parsed = campaignCreateSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.voice_call_config?.model).toBe("claude-3-5-sonnet");
      expect(parsed.data.voice_call_config?.voice).toBe("adam");
    }
  });

  it("allows voice_call_config without model specified", () => {
    const validConfigWithoutModel = {
      voice: "rachel",
      prompt: "Some prompt without model",
    };
    const parsed = dialnexaVoiceConfigSchema.safeParse(validConfigWithoutModel);
    expect(parsed.success).toBe(true);
  });

  it("rejects invalid voice_call_config when required voice or prompt are empty", () => {
    const invalidConfig = {
      voice: "",
      prompt: "",
    };
    const parsed = dialnexaVoiceConfigSchema.safeParse(invalidConfig);
    expect(parsed.success).toBe(false);
  });

  it("provides sampleAudioUrl and sampleText for all preset voices", () => {
    for (const voice of DIALNEXA_VOICES) {
      expect(voice.sampleAudioUrl).toBeDefined();
      expect(voice.sampleAudioUrl).toMatch(/^\/voices\/.+\.wav$/);
      expect(voice.sampleText).toBeDefined();
      expect(voice.sampleText?.length).toBeGreaterThan(10);
    }
  });

  it("validates transcribers and eagerness support", () => {
    expect(DEFAULT_DIALNEXA_CONFIG.response_eagerness).toBe(0.7);
    expect(DEFAULT_DIALNEXA_CONFIG.transcriber_id).toBe("trs_deepgram_nova_2");
    expect(DEFAULT_DIALNEXA_CONFIG.agent_functions?.length).toBeGreaterThanOrEqual(3);
    expect(DEFAULT_DIALNEXA_CONFIG.post_call_analysis?.length).toBeGreaterThanOrEqual(5);

    // Eagerness must be between 0 and 1
    const invalidEagerness = {
      ...DEFAULT_DIALNEXA_CONFIG,
      response_eagerness: 1.5,
    };
    expect(dialnexaVoiceConfigSchema.safeParse(invalidEagerness).success).toBe(false);
  });

  it("validates agent functions and post-call analysis schema", () => {
    const validWithFunctions = {
      voice: "rachel",
      prompt: "Screen candidates for software role",
      response_eagerness: 0.9,
      agent_functions: [
        {
          type: "end_call",
          display_name: "End Call When Concluded",
          description: "Ends call when complete",
          enabled: true,
        },
        {
          type: "call_transfer",
          display_name: "Warm Transfer",
          description: "Transfers to recruiter",
          enabled: true,
          config: { transfer_phone_number: "+919876543210" },
        },
      ],
      post_call_analysis: [
        {
          field_name: "recommendation",
          field_type: "SELECTOR",
          field_description: "Hire recommendation",
          additional_fields: ["Strong Hire", "Reject"],
        },
      ],
    };
    const parsed = dialnexaVoiceConfigSchema.safeParse(validWithFunctions);
    expect(parsed.success).toBe(true);
  });
});
