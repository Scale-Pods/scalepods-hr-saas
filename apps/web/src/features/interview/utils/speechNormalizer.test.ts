import { describe, expect, it } from "vitest";
import { normalizeTechnicalSpeech } from "./speechNormalizer";

describe("speechNormalizer", () => {
  it("preserves exact candidate words and common English verbs", () => {
    // "reacted" must NOT be converted to "React"
    expect(normalizeTechnicalSpeech("We reacted quickly to the outage")).toBe(
      "We reacted quickly to the outage",
    );

    // "first api" must NOT be converted to "FastAPI"
    expect(normalizeTechnicalSpeech("My first API was built in Python")).toBe(
      "My first API was built in Python",
    );

    // "torch" must NOT be converted to "PyTorch"
    expect(normalizeTechnicalSpeech("I passed the torch to the junior engineer")).toBe(
      "I passed the torch to the junior engineer",
    );

    // Common phrases with 8 must NOT be converted to "n8n"
    expect(normalizeTechnicalSpeech("In 8 in 10 cases this worked well")).toBe(
      "In 8 in 10 cases this worked well",
    );
  });

  it("accurately normalizes spoken technical terms and phonetic variations", () => {
    expect(normalizeTechnicalSpeech("I used n-8-n for workflow automation")).toBe(
      "I used n8n for workflow automation",
    );
    expect(normalizeTechnicalSpeech("We built with fast api and graph ql")).toBe(
      "We built with FastAPI and GraphQL",
    );
    expect(normalizeTechnicalSpeech("Deployed on ver cell with supa base")).toBe(
      "Deployed on Vercel with Supabase",
    );
    expect(normalizeTechnicalSpeech("I have experience with pie torch and tensor flow")).toBe(
      "I have experience with PyTorch and TensorFlow",
    );
  });
});
