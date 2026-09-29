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

export interface DialnexaTranscriberOption {
  id: string;
  label: string;
  provider: "Deepgram" | "Soniox" | "Sarvam" | "Whisper";
  description: string;
  badge: string;
  supportsEagerness: boolean;
}

export const DIALNEXA_TRANSCRIBERS: DialnexaTranscriberOption[] = [
  {
    id: "trs_deepgram_nova_2",
    label: "Deepgram Nova 2 / Nova 3",
    provider: "Deepgram",
    description: "Industry leading speech recognition with sub-300ms transcription latency.",
    badge: "Ultra Low Latency",
    supportsEagerness: false,
  },
  {
    id: "trs_soniox",
    label: "Soniox Multilingual",
    provider: "Soniox",
    description:
      "Exceptional accuracy for bilingual English/Hinglish conversations and dynamic turn-taking.",
    badge: "Eagerness Optimized",
    supportsEagerness: true,
  },
  {
    id: "trs_sarvam",
    label: "Sarvam AI Indian English & Vernacular",
    provider: "Sarvam",
    description:
      "Tuned specifically for Indian accents, multilingual code-switching, and regional phonetics.",
    badge: "Regional Dialects",
    supportsEagerness: true,
  },
  {
    id: "trs_whisper",
    label: "OpenAI Whisper Large v3",
    provider: "Whisper",
    description: "High lexical accuracy for technical vocabulary and heavy industry jargon.",
    badge: "High Accuracy",
    supportsEagerness: false,
  },
];

export const DEFAULT_DIALNEXA_FUNCTIONS = [
  {
    id: "func_end_call",
    type: "end_call" as const,
    display_name: "End Call When Concluded",
    description:
      "Judges the conversation flow and ends the call once the screening objective is met or the candidate asks to disconnect.",
    enabled: true,
    config: {},
  },
  {
    id: "func_call_transfer",
    type: "call_transfer" as const,
    display_name: "Warm Transfer to Human Recruiter",
    description:
      "Transfers the candidate directly to a senior recruiter or hiring coordinator if they require immediate human assistance.",
    enabled: false,
    config: {
      transfer_phone_number: "+912264233051",
      transfer_message: "Please hold while I connect you with our talent acquisition team.",
    },
  },
  {
    id: "func_calendar_check",
    type: "check_calendar_availability" as const,
    display_name: "Check Interview Calendar Slots",
    description:
      "Queries open calendar availability for scheduling Round 2 technical interviews in real-time.",
    enabled: true,
    config: {},
  },
  {
    id: "func_calendar_book",
    type: "book_calendar" as const,
    display_name: "Book Next Round Interview",
    description:
      "Locks in an agreed date/time slot directly into the hiring team's calendar before hanging up.",
    enabled: false,
    config: {},
  },
  {
    id: "func_custom_webhook",
    type: "custom" as const,
    display_name: "Post Screening Signal to ATS",
    description:
      "Dispatches intermediate candidate signals and verified compensation/notice data to a webhook.",
    enabled: false,
    config: {
      endpoint_url: "https://api.scalepods.internal/v1/recruiter/signals",
    },
  },
];

export const DEFAULT_POST_CALL_ANALYSIS = [
  {
    id: "pca_recommendation",
    field_name: "overall_recommendation",
    field_type: "SELECTOR" as const,
    field_description: "Overall candidate screening outcome recommendation",
    additional_fields: ["Strong Hire", "Proceed to Next Round", "Needs Review", "Reject"],
    display_order: 0,
  },
  {
    id: "pca_tech_score",
    field_name: "technical_qualification_score",
    field_type: "NUMBER" as const,
    field_description:
      "Rating of candidate's relevant tech domain experience from 1 (low) to 10 (exceptional)",
    display_order: 1,
  },
  {
    id: "pca_communication",
    field_name: "communication_skills_score",
    field_type: "NUMBER" as const,
    field_description: "Assessment of fluency, clarity, and professionalism from 1 to 10",
    display_order: 2,
  },
  {
    id: "pca_notice_period",
    field_name: "notice_period_days",
    field_type: "NUMBER" as const,
    field_description: "Stated notice period in calendar days (0 if immediate joiner)",
    display_order: 3,
  },
  {
    id: "pca_compensation",
    field_name: "compensation_expectation",
    field_type: "TEXT" as const,
    field_description: "Current CTC and expected compensation stated by the candidate",
    display_order: 4,
  },
  {
    id: "pca_interest",
    field_name: "candidate_interest_level",
    field_type: "SELECTOR" as const,
    field_description: "Candidate's enthusiasm and alignment with the role",
    additional_fields: ["High", "Medium", "Low", "Not Interested"],
    display_order: 5,
  },
  {
    id: "pca_strengths",
    field_name: "key_strengths_summary",
    field_type: "TEXT" as const,
    field_description:
      "Bullet points highlighting top skills, domain accomplishments, and role fit",
    display_order: 6,
  },
];

export const DEFAULT_BOOSTED_KEYWORDS =
  "ScalePods, TypeScript, React, Next.js, Node.js, Python, PostgreSQL, Supabase, AWS, Docker, Kubernetes, microservices, REST API, GraphQL, CI/CD, Agile, notice period, CTC, compensation";

export const DEFAULT_DIALNEXA_CONFIG: DialnexaVoiceConfig = {
  agent_id: "agent_Lg812J59k27OXl",
  model: "gpt-4o-mini",
  voice: "rachel",
  first_message: DIALNEXA_TEMPLATES[0].first_message,
  prompt: DIALNEXA_TEMPLATES[0].prompt,
  language: "en-US",
  max_duration_seconds: 300,

  // Turn-Taking & Latency (Eagerness & Responsiveness)
  response_eagerness: 0.7, // 0 (patient) to 1 (eager)
  responsiveness: 0.8,
  interruption_sensitivity: 0.5,
  backchanneling: true,
  backchannel_frequency: 0.5,
  backchannel_keywords: "I understand, got it, sure, go ahead, makes sense",
  end_call_on_silence_sec: 20,
  reminder_message_interval: 10,

  // Acoustic & Voice Polish
  ambient_noise: true,
  denoising_mode: "remove_noise",
  denoise_strength: 1,
  voice_speed: 1.0,
  voice_pitch: 0,
  voice_temperature: 1.0,
  voice_volume: 0,
  llm_temperature: 0.4,

  // STT Transcribers & Accelerators
  transcriber_id: "trs_deepgram_nova_2",
  fallback_stt_enabled: true,
  stt_fallback_transcriber_id: "trs_soniox",
  boosted_keywords: DEFAULT_BOOSTED_KEYWORDS,
  boost_dynamic_variables: true,
  predictive_preprocessing_enabled: true,
  prompt_caching_enabled: false,
  fallback_llm_enabled: true,
  llm_fallback_delay_ms: 200,
  llm_fallback_model: "gpt-4o-mini",

  // Voicemail Handling
  voicemail_detection: true,
  hangup_on_voicemail: false,
  voicemail_message:
    "Hi, this is the talent team at ScalePods following up on your application. We will reach back out via email to schedule a convenient time.",

  // Agent Functions
  agent_functions: DEFAULT_DIALNEXA_FUNCTIONS,

  // Post-Call Extraction Scorecard
  post_call_analysis: DEFAULT_POST_CALL_ANALYSIS,
};
