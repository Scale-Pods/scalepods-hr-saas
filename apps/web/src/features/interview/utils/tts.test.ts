import { describe, expect, it } from "vitest";
import { prepareTextForTTS } from "./tts";

describe("prepareTextForTTS", () => {
  it("normalizes AI/Ai casing cleanly while preserving candidate names", () => {
    const input =
      "Hello Manish! I am Aria, your AI Interviewer today for the Ai Automation Intern position.";
    expect(prepareTextForTTS(input)).toBe(
      "Hello Manish, I am Aria, your A I Interviewer today for the A I Automation Intern position.",
    );
  });

  it("does not alter lowercase words containing 'ai' like 'detail' or 'explain'", () => {
    const input = "Can you explain the detail behind SkillGap AI and Deccan AI?";
    expect(prepareTextForTTS(input)).toBe(
      "Can you explain the detail behind Skill Gap A I and Deccan A I?",
    );
  });

  it("expands common tech acronyms, snake_case identifiers, and brand compounds", () => {
    const input =
      "How did you connect n8n, Supabase, WhatsApp Business API, Twilio, Apify, AWS, and PostgreSQL with answer_text?";
    expect(prepareTextForTTS(input)).toBe(
      "How did you connect en eight en, Soopabase, Whats App Business A P I, Twil-ee-oh, App-i-fy, A W S, and Postgres Q L with answer text?",
    );
  });

  it("handles plural AI forms, UI/UX slashes, and markdown stripping", () => {
    const input = "Compare **CI/CD**, `UI/UX`, HTML/CSS, and multiple AIs in ScalePods.";
    expect(prepareTextForTTS(input)).toBe(
      "Compare C I C D, U I U X, H T M L or C S S, and multiple A Is in Scale Pods.",
    );
  });
});
