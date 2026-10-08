export interface SampleVoice {
  id: string;
  name: string;
  description: string;
  accent: string;
  gender: string;
}

export const POPULAR_ELEVENLABS_VOICES: SampleVoice[] = [
  {
    id: "21m00Tcm4TlvDq8ikWAM",
    name: "Rachel",
    accent: "American",
    gender: "Female",
    description: "Calm, articulate, and professional talent prescreening voice.",
  },
  {
    id: "pNInz6obpgDQGcFmaJgB",
    name: "Adam",
    accent: "American",
    gender: "Male",
    description: "Warm, authoritative, and executive recruiter tone.",
  },
  {
    id: "EXAVITQu4vr4xnSDxMaL",
    name: "Sarah",
    accent: "American",
    gender: "Female",
    description: "Enthusiastic, approachable, and engaging interview flow.",
  },
  {
    id: "ErXwobaYiN019PkySvjV",
    name: "Antoni",
    accent: "American",
    gender: "Male",
    description: "Balanced, friendly, and clear corporate presence.",
  },
  {
    id: "TxGEqnHWrfWFTfGW9XjX",
    name: "Josh",
    accent: "American",
    gender: "Male",
    description: "Natural, casual, and energetic technical recruiter.",
  },
  {
    id: "AZnzlk1XvdvUeBnXmlld",
    name: "Domi",
    accent: "American",
    gender: "Female",
    description: "Crisp, confident, and highly articulate phone screening.",
  },
];
