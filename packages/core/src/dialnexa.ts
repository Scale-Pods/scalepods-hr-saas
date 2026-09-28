import type { DialnexaVoiceConfig } from "./types";

export interface DialnexaModelOption {
  id: string;
  label: string;
  provider: "OpenAI" | "Anthropic" | "Google" | "Groq" | "Custom";
  badge: string;
}

export interface DialnexaVoiceOption {
  id: string;
  label: string;
  provider: "ElevenLabs" | "OpenAI" | "Custom";
  gender: "Female" | "Male" | "Neutral";
  description: string;
  sampleAudioUrl?: string;
  sampleText?: string;
}

export const DIALNEXA_MODELS: DialnexaModelOption[] = [
  {
    id: "gpt-4o-mini",
    label: "GPT-4o Mini",
    provider: "OpenAI",
    badge: "Fast & Recommended",
  },
  {
    id: "gpt-4o",
    label: "GPT-4o",
    provider: "OpenAI",
    badge: "Highest Intelligence",
  },
  {
    id: "claude-3-5-sonnet",
    label: "Claude 3.5 Sonnet",
    provider: "Anthropic",
    badge: "Natural Conversationalist",
  },
  {
    id: "gemini-1.5-flash",
    label: "Gemini 1.5 Flash",
    provider: "Google",
    badge: "Ultra Low Latency",
  },
  {
    id: "gemini-1.5-pro",
    label: "Gemini 1.5 Pro",
    provider: "Google",
    badge: "Deep Reasoning",
  },
  {
    id: "llama-3.3-70b-versatile",
    label: "LLaMA 3.3 70B (Groq)",
    provider: "Groq",
    badge: "Blazing Speed",
  },
];

export const DIALNEXA_VOICES: DialnexaVoiceOption[] = [
  {
    id: "rachel",
    label: "Rachel",
    provider: "ElevenLabs",
    gender: "Female",
    description: "Calm, articulate, and professional talent voice",
    sampleAudioUrl: "/voices/rachel.wav",
    sampleText:
      "Hello, I'm Rachel. I'll be conducting your initial screening call on behalf of the talent team.",
  },
  {
    id: "adam",
    label: "Adam",
    provider: "ElevenLabs",
    gender: "Male",
    description: "Warm, authoritative, and corporate tone",
    sampleAudioUrl: "/voices/adam.wav",
    sampleText:
      "Hello, this is Adam. I look forward to discussing your background and experience for this position.",
  },
  {
    id: "sarah",
    label: "Sarah",
    provider: "ElevenLabs",
    gender: "Female",
    description: "Enthusiastic, approachable, and engaging",
    sampleAudioUrl: "/voices/sarah.wav",
    sampleText:
      "Hi there! I'm Sarah. Thanks for taking the time to speak with me today about this exciting opportunity.",
  },
  {
    id: "nova",
    label: "Nova",
    provider: "OpenAI",
    gender: "Female",
    description: "Crisp, modern, and energetic conversational voice",
    sampleAudioUrl: "/voices/nova.wav",
    sampleText:
      "Hi, I'm Nova. I'm excited to connect with you and review your qualifications for the role.",
  },
  {
    id: "alloy",
    label: "Alloy",
    provider: "OpenAI",
    gender: "Neutral",
    description: "Balanced, neutral, and clear articulation",
    sampleAudioUrl: "/voices/alloy.wav",
    sampleText:
      "Greetings. I am Alloy, your automated screening assistant for today's voice assessment.",
  },
];

export const DIALNEXA_TEMPLATES = [
  {
    id: "general_prescreen",
    name: "General Screening",
    description:
      "Candidate intro, work history verification, notice period, and compensation alignment.",
    prompt: `You are an AI Talent Partner representing ScalePods conducting a preliminary voice screening phone call with candidate {{candidate_name}} for the position of {{job_title}}.

Objectives:
1. Verify {{candidate_name}}'s interest in the {{job_title}} role.
2. Discuss their relevant background and core domain experience.
3. Inquire about their notice period, availability to start, and remote/hybrid preference.
4. Briefly check salary expectations if appropriate.
5. Answer basic questions about the team and timeline.
6. Wrap up warmly and let them know the recruiting team will review the conversation notes before next steps.

Guidelines:
- Keep your answers concise (1-3 sentences) suitable for a natural phone call.
- Be polite, encouraging, and professional.
- Do not make binding hiring promises or offer compensation numbers.`,
    first_message:
      "Hi {{candidate_name}}, this is Alex from the recruiting team regarding your application for the {{job_title}} role. Do you have 3 to 5 minutes for a quick screening chat?",
  },
  {
    id: "technical_prescreen",
    name: "Technical Qualification",
    description: "Direct assessment of hands-on skills, architecture, tools, and recent projects.",
    prompt: `You are a Technical Talent Screener for {{job_title}}. You are speaking with candidate {{candidate_name}}.

Objectives:
1. Greet {{candidate_name}} and confirm their application for {{job_title}}.
2. Ask them to briefly describe their primary tech stack and most significant recent project.
3. Assess familiarity with key requirements listed in the job description: architecture patterns, problem solving, and production deployments.
4. Check their timeline and current notice period.
5. Inform them that successful candidates advance to the technical interview round.

Guidelines:
- Listen actively and probe gently on technical depth.
- Keep questions clear and conversational.
- Do not quiz with trivia; focus on real project experience.`,
    first_message:
      "Hello {{candidate_name}}! I'm calling from the hiring team regarding your {{job_title}} application. I'd love to ask a couple of quick questions about your technical background and experience—is now a good time?",
  },
  {
    id: "culture_availability",
    name: "Culture & Availability",
    description: "Communication style, team collaboration dynamics, and schedule fit.",
    prompt: `You are a Talent Acquisition Partner screening candidate {{candidate_name}} for {{job_title}}.

Objectives:
1. Check {{candidate_name}}'s current employment status and availability for upcoming interview rounds.
2. Inquire what motivated them to apply for {{job_title}}.
3. Ask about their ideal team culture and collaboration style.
4. Confirm location, time zone, and work arrangement preferences.
5. Summarize next steps and thank them for their time.

Guidelines:
- Maintain an upbeat, conversational, and welcoming demeanor.
- Keep responses compact for smooth telephony audio flow.`,
    first_message:
      "Hi {{candidate_name}}, thank you for applying for the {{job_title}} role! Do you have a couple of minutes to chat about your availability and what you're looking for in your next position?",
  },
];

export const DEFAULT_DIALNEXA_CONFIG: DialnexaVoiceConfig = {
  model: "gpt-4o-mini",
  voice: "rachel",
  first_message: DIALNEXA_TEMPLATES[0].first_message,
  prompt: DIALNEXA_TEMPLATES[0].prompt,
  language: "en-US",
  max_duration_seconds: 300,
};
