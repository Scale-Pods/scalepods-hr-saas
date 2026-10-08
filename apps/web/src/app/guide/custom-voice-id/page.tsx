import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Lightbulb,
  Mic,
  Sliders,
  Sparkles,
  Volume2,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { POPULAR_ELEVENLABS_VOICES } from "@/lib/voices";

export const metadata: Metadata = {
  title: "How to Get a Custom Voice ID for DialNexa | ScalePods Guide",
  description:
    "Learn how to use ElevenLabs custom cloned recruiter voices or voice library IDs with ScalePods DialNexa conversational phone screening.",
};

const STEPS = [
  {
    number: "01",
    title: "Sign in to ElevenLabs & Access Voices",
    badge: "Step 1",
    description:
      "DialNexa streams high-fidelity conversational text-to-speech directly from ElevenLabs. Start by accessing your ElevenLabs console.",
    actions: [
      "Navigate to elevenlabs.io and sign in to your recruiter or company workspace.",
      "In the left-hand navigation menu, open Voices ➔ VoiceLab (or Voice Library).",
      "Free accounts can access community voices; custom voice cloning requires an active Starter or Creator subscription.",
    ],
    tip: "You do not need to manage your own ElevenLabs API keys for ScalePods—ScalePods connects via your verified Custom Voice ID.",
  },
  {
    number: "02",
    title: "Choose a Voice or Clone Your Recruiter",
    badge: "Step 2",
    description:
      "You can choose between thousands of pre-made voices or clone your exact recruiting team member's voice for brand consistency.",
    actions: [
      "Option A — Voice Library: Browse curated professional voices filtered by accent, gender, and conversational tone. Click 'Add to VoiceLab'.",
      "Option B — Instant Voice Clone: Click '+ Add Voice' ➔ 'Instant Voice Clone'. Upload 1 to 3 minutes of high-quality, clear speaking audio without background music or reverb.",
      "Name your voice (e.g., 'Acme Talent Partner - Alex') and save it to your VoiceLab.",
    ],
    tip: "For phone screening, voices tagged as 'Conversational', 'Warm', or 'Professional' yield the highest candidate engagement rates.",
  },
  {
    number: "03",
    title: "Copy the 20-Character Voice ID",
    badge: "Step 3",
    description:
      "Every voice in ElevenLabs is assigned a permanent, unique 20-character alphanumeric identifier.",
    actions: [
      "In the ElevenLabs dashboard, open Voices ➔ My Voices.",
      "Locate your desired voice card and click the card or the Details / Settings button.",
      "Look for the Voice ID label (formatted like: 21m00Tcm4TlvDq8ikWAM or EXAVITQu4vr4xnSDxMaL).",
      "Click the Copy ID icon next to the field to copy it to your clipboard.",
    ],
    tip: "Make sure you copy the Voice ID, not the API key or model name. Voice IDs are always ~20 characters.",
  },
  {
    number: "04",
    title: "Configure & Calibrate in ScalePods DialNexa",
    badge: "Step 4",
    description:
      "Connect the voice to your campaign screening agent and fine-tune audio dynamics for telephone lines.",
    actions: [
      "In ScalePods, open Campaigns ➔ choose your Campaign ➔ Step 3 (Reach-out Cadence) ➔ DialNexa Voice Agent.",
      "Under Voice & Audio Tuning, open the 'DialNexa Synthetic Voice (TTS)' dropdown.",
      "Select 'Custom Voice ID…' at the bottom of the list.",
      "Paste your copied Voice ID into the input field.",
      "Calibrate Voice Stability (recommended: 0.65 – 0.75) and Clarity / Similarity Boost (recommended: 0.75 – 0.85).",
    ],
    tip: "Higher stability prevents vocal pitch drift during complex candidate questions.",
  },
  {
    number: "05",
    title: "Test with Live Simulator & Phone Preview",
    badge: "Step 5",
    description:
      "Always verify voice cadence and pronunciation before launching outbound calls to real candidates.",
    actions: [
      "Open the Live Agent Simulator on the right side of the DialNexa editor.",
      "Type a test candidate response or trigger an AI greeting to hear the voice live.",
      "Click 'Test Call preview' to dispatch an actual trial phone call to your mobile number.",
      "Verify that the agent pronounces role terminology, company names, and salary bands accurately.",
    ],
    tip: "Use the 'Boosted Keywords' panel in DialNexa to prime the speech recognizer for industry jargon and acronyms.",
  },
];

export default function CustomVoiceGuidePage() {
  return (
    <div className="min-h-screen bg-[#080c18] text-[#f0f4fc]">
      {/* Top Banner & Navigation */}
      <header className="border-b border-white/[0.08] bg-[#0b1020]/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link
            href="/campaigns"
            className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Campaigns
          </Link>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-[11px] font-medium text-cyan-400">
              <Sparkles className="h-3 w-3" /> DialNexa Voice Studio
            </span>
          </div>
        </div>
      </header>

      {/* Hero Header */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-12 pb-10">
        <div className="max-w-3xl space-y-4">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-white/[0.06] border border-white/[0.1] px-2.5 py-1 text-xs font-mono text-cyan-400">
              ScalePods Guide · Voice AI
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight">
            How to Get a Custom Voice ID for DialNexa
          </h1>
          <p className="text-base text-slate-300 leading-relaxed">
            Personalize your automated phone screening calls with cloned recruiter voices or custom
            high-fidelity talent voices from ElevenLabs. This guide walks you through finding your
            Voice ID, applying it to your ScalePods campaign, and tuning audio stability for
            crystal-clear phone delivery.
          </p>

          <div className="pt-2 flex flex-wrap items-center gap-3">
            <a
              href="https://elevenlabs.io/app/voice-lab"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 text-xs font-semibold shadow-md transition-colors"
            >
              Open ElevenLabs VoiceLab <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <Link
              href="/guide/create-campaign"
              className="inline-flex items-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.04] hover:bg-white/[0.08] text-slate-200 px-4 py-2 text-xs font-medium transition-colors"
            >
              Campaign Setup Guide <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 pb-20 space-y-12">
        {/* Step-by-Step Walkthrough */}
        <div className="space-y-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Volume2 className="h-5 w-5 text-cyan-400" />
            Step-by-Step Instructions
          </h2>

          <div className="space-y-5">
            {STEPS.map((step) => (
              <section
                key={step.number}
                className="rounded-2xl border border-white/[0.08] bg-[#0d1326] p-6 space-y-4 shadow-sm"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/[0.06] pb-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-xs font-mono font-bold text-cyan-300">
                      {step.number}
                    </span>
                    <h3 className="text-base font-bold text-white tracking-tight">{step.title}</h3>
                  </div>
                  <span className="text-xs font-mono text-slate-400 self-start sm:self-auto">
                    {step.badge}
                  </span>
                </div>

                <p className="text-sm text-slate-300 leading-relaxed">{step.description}</p>

                <ul className="space-y-2.5 pt-1">
                  {step.actions.map((act) => (
                    <li key={act} className="flex items-start gap-2.5 text-xs text-slate-300">
                      <CheckCircle2 className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />
                      <span>{act}</span>
                    </li>
                  ))}
                </ul>

                {step.tip && (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3 flex items-start gap-2.5 text-xs text-amber-200/90">
                    <Lightbulb className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                    <span>
                      <strong className="text-amber-300">Pro-Tip:</strong> {step.tip}
                    </span>
                  </div>
                )}
              </section>
            ))}
          </div>
        </div>

        {/* Recommended Tuning Reference Table */}
        <section className="rounded-2xl border border-white/[0.08] bg-[#0d1326] p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Sliders className="h-5 w-5 text-cyan-400" />
            <h2 className="text-lg font-bold text-white">
              Recommended Audio Tuning for Phone Calls
            </h2>
          </div>
          <p className="text-xs text-slate-300">
            Telephone carriers (PSTN) compress voice audio to 8kHz / 16kHz bandwidth. For the best
            clarity and natural cadence over phone lines, apply these DialNexa parameters:
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-white/[0.1] text-slate-400 font-mono">
                  <th className="py-2.5 pr-4 font-semibold">Parameter</th>
                  <th className="py-2.5 px-4 font-semibold">Recommended Value</th>
                  <th className="py-2.5 pl-4 font-semibold">Purpose</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] text-slate-300">
                <tr>
                  <td className="py-2.5 pr-4 font-medium text-white">Voice Stability</td>
                  <td className="py-2.5 px-4 font-mono text-cyan-300">0.65 – 0.75</td>
                  <td className="py-2.5 pl-4">
                    Prevents sudden robotic tone changes or emotional extremes.
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 font-medium text-white">Clarity / Similarity Boost</td>
                  <td className="py-2.5 px-4 font-mono text-cyan-300">0.75 – 0.85</td>
                  <td className="py-2.5 pl-4">
                    Enhances vocal presence and reduces muffled telephone artifacts.
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 font-medium text-white">Speaking Rate</td>
                  <td className="py-2.5 px-4 font-mono text-cyan-300">1.0x – 1.05x</td>
                  <td className="py-2.5 pl-4">
                    Ensures candidates have ample time to process technical questions.
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 font-medium text-white">Interruption Sensitivity</td>
                  <td className="py-2.5 px-4 font-mono text-cyan-300">0.50 (Medium)</td>
                  <td className="py-2.5 pl-4">
                    Allows natural back-and-forth dialogue without abrupt cutoffs.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Popular Pre-Tested Voice IDs */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-amber-400" />
                Popular Verified Voice IDs
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                You can copy any of these verified ElevenLabs Voice IDs and paste them directly into
                DialNexa:
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {POPULAR_ELEVENLABS_VOICES.map((voice) => (
              <div
                key={voice.id}
                className="rounded-xl border border-white/[0.08] bg-[#0d1326] p-4 flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-bold text-white flex items-center gap-1.5">
                      <Mic className="h-3.5 w-3.5 text-cyan-400" />
                      {voice.name}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {voice.gender} · {voice.accent}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{voice.description}</p>
                </div>

                <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">Voice ID:</span>
                  <code className="text-xs font-mono font-bold text-cyan-300 bg-black/40 px-2 py-0.5 rounded">
                    {voice.id}
                  </code>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Next Steps CTA */}
        <div className="rounded-2xl border border-cyan-500/30 bg-gradient-to-r from-cyan-950/40 via-[#0d1326] to-[#0d1326] p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="space-y-1.5 text-center sm:text-left">
            <h3 className="text-lg font-bold text-white">Ready to test your Custom Voice?</h3>
            <p className="text-xs text-slate-300 max-w-xl">
              Open your campaign reach-out cadence, paste your Voice ID, and dispatch a real phone
              call to your number in seconds.
            </p>
          </div>
          <Link
            href="/campaigns"
            className="rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs px-5 py-3 shrink-0 shadow-lg transition-colors flex items-center gap-2"
          >
            Launch DialNexa Studio <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </main>
    </div>
  );
}
