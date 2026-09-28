import { describe, expect, it } from "vitest";
import {
  campaignCreateSchema,
  DEFAULT_DIALNEXA_CONFIG,
  DIALNEXA_MODELS,
  DIALNEXA_TEMPLATES,
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
});
