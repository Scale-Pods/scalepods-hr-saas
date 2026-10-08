"use client";

import { ArrowRight, Check, Copy, ExternalLink, Mic, Sparkles, Volume2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

interface CustomVoiceGuideModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectVoiceId?: (voiceId: string) => void;
}

export function CustomVoiceGuideModal({
  open,
  onOpenChange,
  onSelectVoiceId,
}: CustomVoiceGuideModalProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const handleApplyVoice = (id: string) => {
    if (onSelectVoiceId) {
      onSelectVoiceId(id);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto p-6 bg-[#0b1020] border-border/80 text-foreground">
        <DialogHeader className="space-y-2 text-left">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Volume2 className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                How to Get a Custom Voice ID
                <Badge className="bg-cyan-500/15 text-cyan-400 border-cyan-500/30 text-[10px] font-mono">
                  DialNexa
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                Use any custom cloned recruiter voice or community voice from ElevenLabs.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Steps Walkthrough */}
        <div className="space-y-4 pt-2">
          {/* Step 1 */}
          <div className="rounded-xl border border-border/70 bg-card/60 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs font-semibold text-white">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500/20 text-[11px] font-bold text-cyan-400">
                  1
                </span>
                Sign in to ElevenLabs & choose a voice
              </span>
              <a
                href="https://elevenlabs.io/app/voice-lab"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-medium transition-colors"
              >
                Open VoiceLab <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed pl-7">
              Go to <strong className="text-white">elevenlabs.io</strong>. You can either select an
              existing voice from the <strong className="text-white">Voice Library</strong> or click{" "}
              <strong className="text-white">+ Add Voice</strong> (VoiceLab) to create an{" "}
              <span className="text-cyan-300">Instant Voice Clone</span> using 1–2 minutes of your
              recruiter&apos;s audio.
            </p>
          </div>

          {/* Step 2 */}
          <div className="rounded-xl border border-border/70 bg-card/60 p-4 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-white">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500/20 text-[11px] font-bold text-cyan-400">
                2
              </span>
              Copy the 20-character Voice ID
            </div>
            <p className="text-xs text-slate-300 leading-relaxed pl-7">
              In ElevenLabs, open <strong className="text-white">Voices ➔ My Voices</strong>. Click
              on your voice to open its details, then copy the alphanumeric{" "}
              <strong className="text-white">Voice ID</strong> (example:{" "}
              <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[11px] text-cyan-300">
                21m00Tcm4TlvDq8ikWAM
              </code>
              ).
            </p>
          </div>

          {/* Step 3 */}
          <div className="rounded-xl border border-border/70 bg-card/60 p-4 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-white">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500/20 text-[11px] font-bold text-cyan-400">
                3
              </span>
              Paste & Test inside DialNexa Studio
            </div>
            <p className="text-xs text-slate-300 leading-relaxed pl-7">
              Paste your Voice ID into the <strong className="text-white">Custom Voice ID</strong>{" "}
              field in DialNexa. Then use the <strong className="text-white">Live Simulator</strong>{" "}
              or trigger a test phone call to test the pronunciation and conversational cadence
              before launching.
            </p>
          </div>

          {/* Quick-Pick Popular Sample Voices */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                Popular Verified Voice IDs (Click to Use)
              </div>
              <span className="text-[11px] text-slate-400">
                Pre-tested with DialNexa phone screening
              </span>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {POPULAR_ELEVENLABS_VOICES.map((voice) => (
                <div
                  key={voice.id}
                  className="rounded-lg border border-border/60 bg-black/30 p-3 flex flex-col justify-between gap-2.5 transition-all hover:border-cyan-500/40"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                        <Mic className="h-3 w-3 text-cyan-400" />
                        {voice.name}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {voice.gender} · {voice.accent}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 line-clamp-2">{voice.description}</p>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/40">
                    <code className="text-[10px] font-mono text-slate-300 truncate max-w-[120px]">
                      {voice.id}
                    </code>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopy(voice.id)}
                        className="h-6 px-2 text-[10px] text-slate-300 hover:text-white"
                        title="Copy Voice ID"
                      >
                        {copiedId === voice.id ? (
                          <span className="flex items-center gap-1 text-emerald-400">
                            <Check className="h-3 w-3" /> Copied
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <Copy className="h-3 w-3" /> Copy
                          </span>
                        )}
                      </Button>
                      {onSelectVoiceId && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => handleApplyVoice(voice.id)}
                          className="h-6 px-2 text-[10px] bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30"
                        >
                          Use Voice
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="mt-4 pt-4 border-t border-border/60 flex items-center justify-between sm:justify-between w-full">
          <Link
            href="/guide/custom-voice-id"
            className="text-xs text-slate-400 hover:text-cyan-400 flex items-center gap-1 transition-colors"
          >
            Read full guide article <ArrowRight className="h-3 w-3" />
          </Link>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs"
            >
              Close
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
