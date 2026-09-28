"use client";

import { DIALNEXA_TEMPLATES, DIALNEXA_VOICES, type DialnexaVoiceConfig } from "@scalepods/core";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Mic,
  PhoneCall,
  Play,
  Sliders,
  Sparkles,
  Square,
  Volume2,
  Wand2,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface DialnexaConfigEditorProps {
  value: DialnexaVoiceConfig;
  onChange: (value: DialnexaVoiceConfig) => void;
  jobTitle?: string;
  className?: string;
}

const VARIABLE_PILLS = [
  { token: "{{candidate_name}}", label: "Candidate Name", example: "Jane Doe" },
  { token: "{{job_title}}", label: "Job Title", example: "Senior Engineer" },
  { token: "{{company_name}}", label: "Company Name", example: "ScalePods" },
];

export function DialnexaConfigEditor({
  value,
  onChange,
  jobTitle,
  className,
}: DialnexaConfigEditorProps) {
  const customVoiceId = useId();

  const isPresetVoice = DIALNEXA_VOICES.some((v) => v.id === value.voice);
  const [voiceSelectValue, setVoiceSelectValue] = useState<string>(
    isPresetVoice ? value.voice : "custom",
  );
  const [customVoiceText, setCustomVoiceText] = useState<string>(isPresetVoice ? "" : value.voice);

  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [activeNavTab, setActiveNavTab] = useState<"voice" | "prompt" | "greeting" | "all">(
    "voice",
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stopAudio = () => {
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      } catch {
        // ignore audio pause error
      }
      audioRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore speech cancel error
      }
    }
    setPlayingVoiceId(null);
  };

  const playVoiceSample = (voiceId: string) => {
    if (playingVoiceId === voiceId) {
      stopAudio();
      return;
    }

    stopAudio();
    const voiceMeta = DIALNEXA_VOICES.find((v) => v.id === voiceId);
    if (!voiceMeta) return;

    setPlayingVoiceId(voiceId);

    // 1. Try real recorded WAV clip from /voices/<voiceId>.wav
    if (typeof window !== "undefined" && typeof Audio !== "undefined" && voiceMeta.sampleAudioUrl) {
      try {
        const audio = new Audio(voiceMeta.sampleAudioUrl);
        audioRef.current = audio;

        audio.onended = () => {
          setPlayingVoiceId(null);
          audioRef.current = null;
        };

        audio.onerror = () => {
          // Fallback to speech synthesis if audio file cannot be loaded
          fallbackSpeech(voiceMeta);
        };

        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch(() => {
            fallbackSpeech(voiceMeta);
          });
        }
      } catch {
        fallbackSpeech(voiceMeta);
      }
    } else {
      fallbackSpeech(voiceMeta);
    }
  };

  const fallbackSpeech = (voiceMeta: (typeof DIALNEXA_VOICES)[number]) => {
    if (typeof window !== "undefined" && "speechSynthesis" in window && voiceMeta.sampleText) {
      try {
        const utterance = new SpeechSynthesisUtterance(voiceMeta.sampleText);
        utterance.rate = voiceMeta.id === "sarah" ? 1.15 : voiceMeta.id === "adam" ? 0.95 : 1.0;
        utterance.pitch = voiceMeta.gender === "Female" ? 1.1 : 0.9;
        utterance.onend = () => setPlayingVoiceId(null);
        utterance.onerror = () => setPlayingVoiceId(null);
        window.speechSynthesis.speak(utterance);
      } catch {
        setPlayingVoiceId(null);
      }
    } else {
      setPlayingVoiceId(null);
    }
  };

  useEffect(() => {
    return () => {
      stopAudio();
    };
  }, []);

  const handleVoiceSelectChange = (newVal: string) => {
    setVoiceSelectValue(newVal);
    if (newVal === "custom") {
      onChange({ ...value, voice: customVoiceText.trim() || "rachel" });
    } else {
      onChange({ ...value, voice: newVal });
    }
  };

  const handleCustomVoiceChange = (text: string) => {
    setCustomVoiceText(text);
    onChange({ ...value, voice: text.trim() || "rachel" });
  };

  const applyTemplate = (templateId: string) => {
    const tmpl = DIALNEXA_TEMPLATES.find((t) => t.id === templateId);
    if (!tmpl) return;
    setActiveTemplate(templateId);

    let updatedPrompt = tmpl.prompt;
    let updatedFirstMessage = tmpl.first_message;

    if (jobTitle && jobTitle.trim()) {
      updatedPrompt = updatedPrompt.replace(/\{\{job_title\}\}/g, jobTitle.trim());
      updatedFirstMessage = updatedFirstMessage.replace(/\{\{job_title\}\}/g, jobTitle.trim());
    }

    onChange({
      ...value,
      prompt: updatedPrompt,
      first_message: updatedFirstMessage,
    });
  };

  const insertVariable = (field: "prompt" | "first_message", token: string) => {
    if (field === "first_message") {
      const current = value.first_message || "";
      onChange({ ...value, first_message: `${current} ${token}`.trim() });
    } else {
      const current = value.prompt || "";
      onChange({ ...value, prompt: `${current} ${token}`.trim() });
    }
  };

  const selectedVoiceMeta = DIALNEXA_VOICES.find((v) => v.id === value.voice);

  return (
    <div
      className={cn(
        "rounded-2xl border border-border/80 bg-linear-to-b from-card/90 to-card/60 p-5 shadow-xs backdrop-blur-md space-y-6",
        className,
      )}
    >
      {/* Header & DialNexa Branding */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <PhoneCall className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-foreground">DialNexa Voice AI Agent</h4>
              <Badge
                variant="secondary"
                className="gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[11px]"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Automated Outbound
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Configures the AI voice agent dispatched by n8n for candidate telephone screenings.
            </p>
          </div>
        </div>

        {/* Status preview pills - interactive shortcuts */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveNavTab("voice")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer border",
              activeNavTab === "voice"
                ? "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30"
                : "bg-muted/60 text-foreground border-border/60 hover:bg-muted",
            )}
            title="Jump to Voice settings"
          >
            <Volume2 className="h-3 w-3 text-cyan-500" />
            <span>Voice: {selectedVoiceMeta?.label || value.voice}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveNavTab("voice")}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer border",
              activeNavTab === "voice"
                ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
                : "bg-muted/60 text-muted-foreground border-border/60 hover:bg-muted",
            )}
            title="Jump to Call Duration settings"
          >
            <Clock className="h-3 w-3 text-amber-500" />
            <span>{Math.round((value.max_duration_seconds || 300) / 60)}m limit</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveNavTab("prompt")}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer border",
              activeNavTab === "prompt"
                ? "bg-primary/15 text-primary border-primary/30"
                : "bg-muted/60 text-muted-foreground border-border/60 hover:bg-muted",
            )}
            title="Jump to System Prompt settings"
          >
            <Sparkles className="h-3 w-3 text-primary" />
            <span>Prompt: {value.prompt ? `${value.prompt.length}c` : "Empty"}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveNavTab("greeting")}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer border",
              activeNavTab === "greeting"
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                : "bg-muted/60 text-muted-foreground border-border/60 hover:bg-muted",
            )}
            title="Jump to Opening Greeting"
          >
            <Mic className="h-3 w-3 text-emerald-500" />
            <span>{value.first_message ? "Greeting Set" : "No Greeting"}</span>
          </button>
        </div>
      </div>

      {/* Primary Section Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-border/70 bg-card/60 p-1.5 shadow-2xs">
        <div className="inline-flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveNavTab("voice")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer",
              activeNavTab === "voice"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
            )}
          >
            <Volume2 className="h-3.5 w-3.5" />
            <span>1. Voice & Audio</span>
            <span
              className={cn(
                "rounded-full px-1.5 py-0.2 text-[10px] font-mono",
                activeNavTab === "voice"
                  ? "bg-white/20 text-white"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {selectedVoiceMeta?.label || value.voice}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveNavTab("prompt")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer",
              activeNavTab === "prompt"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
            )}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>2. System Prompt</span>
            <span
              className={cn(
                "rounded-full px-1.5 py-0.2 text-[10px] font-mono",
                activeNavTab === "prompt"
                  ? "bg-white/20 text-white"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {value.prompt ? `${value.prompt.length}c` : "0c"}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveNavTab("greeting")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer",
              activeNavTab === "greeting"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
            )}
          >
            <Mic className="h-3.5 w-3.5" />
            <span>3. Opening Greeting</span>
            {value.first_message ? (
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            ) : null}
          </button>

          <button
            type="button"
            onClick={() => setActiveNavTab("all")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all cursor-pointer border border-transparent",
              activeNavTab === "all"
                ? "bg-card text-foreground border-border/80 shadow-xs"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
            title="View and edit all sections on one page"
          >
            <Sliders className="h-3.5 w-3.5" />
            <span>All Sections</span>
          </button>
        </div>

        <span className="text-[11px] font-mono text-muted-foreground px-2">
          {activeNavTab === "all"
            ? "Overview mode"
            : `Step ${activeNavTab === "voice" ? "1" : activeNavTab === "prompt" ? "2" : "3"} of 3`}
        </span>
      </div>

      {/* ── Section 1: Voice & Duration ── */}
      <div
        className={cn("space-y-4", activeNavTab !== "voice" && activeNavTab !== "all" && "hidden")}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Voice Selection Dropdown Card */}
          <div className="flex flex-col justify-between rounded-xl border border-border/90 bg-card/80 p-4 shadow-xs space-y-3.5 transition-colors hover:border-primary/40">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Volume2 className="h-4 w-4 text-cyan-500" />
                DialNexa Synthetic Voice (TTS)
              </span>
              <Badge
                variant="outline"
                className="text-[10px] font-medium tracking-wide uppercase px-1.5 py-0.5 bg-muted/50 text-muted-foreground border-border/80"
              >
                Dropdown
              </Badge>
            </div>

            <div className="space-y-2">
              <Select value={voiceSelectValue} onValueChange={handleVoiceSelectChange}>
                <SelectTrigger className="h-11 w-full bg-background border-border/90 px-3.5 text-foreground shadow-xs hover:border-primary/50 focus:ring-primary/20">
                  <div className="flex items-center gap-2.5 truncate">
                    <span className="font-semibold text-foreground text-sm">
                      {voiceSelectValue === "custom"
                        ? customVoiceText.trim()
                          ? `Custom: ${customVoiceText.trim()}`
                          : "Custom Voice ID…"
                        : selectedVoiceMeta?.label || value.voice}
                    </span>
                    {selectedVoiceMeta && (
                      <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-mono text-muted-foreground border border-border/60">
                        {selectedVoiceMeta.gender} · {selectedVoiceMeta.provider}
                      </span>
                    )}
                  </div>
                </SelectTrigger>
                <SelectContent className="border-border bg-popover shadow-2xl">
                  <div className="px-2.5 py-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase border-b border-border/60 mb-1">
                    Choose Synthetic Voice
                  </div>
                  {DIALNEXA_VOICES.map((v) => (
                    <SelectItem
                      key={v.id}
                      value={v.id}
                      className="my-0.5 rounded-lg py-2 px-2.5 focus:bg-primary/10 focus:text-primary data-[highlighted]:bg-primary/10 data-[highlighted]:text-primary"
                    >
                      <div className="flex items-center justify-between gap-4 w-full pr-3">
                        <div className="flex items-center gap-2">
                          <Volume2 className="h-3.5 w-3.5 text-cyan-500 shrink-0" />
                          <span className="font-semibold text-foreground text-sm">{v.label}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono text-muted-foreground border border-border/50">
                            {v.gender}
                          </span>
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                            {v.provider}
                          </span>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                  <SelectSeparator />
                  <SelectItem
                    value="custom"
                    className="my-0.5 rounded-lg py-2 px-2.5 focus:bg-primary/10 focus:text-primary"
                  >
                    <div className="flex items-center gap-2 text-foreground font-medium">
                      <Wand2 className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span>Custom Voice ID…</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>

              {voiceSelectValue === "custom" && (
                <div className="mt-2 space-y-1">
                  <label
                    htmlFor={customVoiceId}
                    className="text-[11px] font-medium text-foreground"
                  >
                    Custom Voice ID / Model ID
                  </label>
                  <Input
                    id={customVoiceId}
                    placeholder="e.g. 21m00Tcm4TlvDq8ikWAM"
                    value={customVoiceText}
                    onChange={(e) => handleCustomVoiceChange(e.target.value)}
                    className="h-9 text-xs font-mono bg-background border-border"
                  />
                </div>
              )}

              {/* Selected Voice Sample Preview Box */}
              {selectedVoiceMeta && (
                <div className="rounded-lg border border-border/70 bg-muted/30 p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => playVoiceSample(selectedVoiceMeta.id)}
                        className={cn(
                          "flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold shadow-xs transition-all cursor-pointer",
                          playingVoiceId === selectedVoiceMeta.id
                            ? "bg-amber-500 text-white animate-pulse"
                            : "bg-primary text-primary-foreground hover:bg-primary/90",
                        )}
                        title={`Listen to sample of ${selectedVoiceMeta.label}'s voice`}
                      >
                        {playingVoiceId === selectedVoiceMeta.id ? (
                          <>
                            <Square className="h-3 w-3 fill-current" />
                            <span>Stop Sample</span>
                          </>
                        ) : (
                          <>
                            <Play className="h-3 w-3 fill-current" />
                            <span>Sample Voice</span>
                          </>
                        )}
                      </button>
                      <span className="text-[11px] font-medium text-foreground">
                        {selectedVoiceMeta.label} ({selectedVoiceMeta.provider})
                      </span>
                    </div>

                    {playingVoiceId === selectedVoiceMeta.id && (
                      <div className="flex items-center gap-1 text-cyan-500">
                        <span className="h-2.5 w-0.5 rounded-full bg-cyan-500 animate-bounce" />
                        <span className="h-3.5 w-0.5 rounded-full bg-cyan-500 animate-bounce [animation-delay:0.15s]" />
                        <span className="h-2 w-0.5 rounded-full bg-cyan-500 animate-bounce [animation-delay:0.3s]" />
                        <span className="text-[10px] font-mono text-cyan-600 dark:text-cyan-400 ml-1">
                          Playing…
                        </span>
                      </div>
                    )}
                  </div>

                  {selectedVoiceMeta.sampleText && (
                    <p className="text-[11px] text-muted-foreground italic line-clamp-2">
                      "{selectedVoiceMeta.sampleText}"
                    </p>
                  )}
                </div>
              )}

              {/* Audition all preset voices bar */}
              <div className="space-y-1 pt-1">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span className="font-semibold uppercase tracking-wider">
                    Audition all voices
                  </span>
                  <span>Click ▶ to preview</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                  {DIALNEXA_VOICES.map((v) => {
                    const isPlaying = playingVoiceId === v.id;
                    const isSelected = value.voice === v.id;
                    return (
                      <div
                        key={v.id}
                        className={cn(
                          "flex items-center justify-between rounded-lg border px-2 py-1 text-xs transition-all",
                          isSelected
                            ? "border-primary/60 bg-primary/10 shadow-xs"
                            : "border-border/60 bg-card hover:bg-muted/40",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => handleVoiceSelectChange(v.id)}
                          className="font-medium text-left truncate hover:text-primary transition-colors text-foreground flex-1 cursor-pointer"
                          title={`Select ${v.label}`}
                        >
                          {v.label}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            playVoiceSample(v.id);
                          }}
                          className={cn(
                            "ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors cursor-pointer",
                            isPlaying
                              ? "bg-amber-500 text-white animate-pulse"
                              : "bg-muted text-muted-foreground hover:bg-primary hover:text-primary-foreground",
                          )}
                          title={`Preview ${v.label}'s sample audio`}
                          aria-label={`Preview ${v.label}'s sample audio`}
                        >
                          {isPlaying ? (
                            <Square className="h-2 w-2 fill-current" />
                          ) : (
                            <Play className="h-2 w-2 fill-current ml-0.5" />
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Selects the synthetic speaker profile used when DialNexa places screening calls.
            </p>
          </div>

          {/* Screening Duration Limit Card */}
          <div className="flex flex-col justify-between rounded-xl border border-border/90 bg-card/80 p-4 shadow-xs space-y-3 transition-colors hover:border-primary/40">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-amber-500" />
                Screening Call Duration Limit
              </span>
              <Badge
                variant="outline"
                className="text-[10px] font-medium tracking-wide uppercase px-1.5 py-0.5 bg-muted/50 text-muted-foreground border-border/80"
              >
                Number Field
              </Badge>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={30}
                  step={1}
                  value={Math.round((value.max_duration_seconds || 300) / 60)}
                  onChange={(e) => {
                    const mins = parseInt(e.target.value, 10);
                    onChange({
                      ...value,
                      max_duration_seconds: Number.isNaN(mins) ? 300 : Math.max(1, mins) * 60,
                    });
                  }}
                  className="h-11 w-24 text-sm font-semibold text-center bg-background border-border"
                />
                <span className="text-xs font-medium text-foreground">minutes per call</span>
              </div>

              {/* Quick duration presets */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground">Presets:</span>
                {[3, 5, 10, 15].map((mins) => {
                  const isSelected = Math.round((value.max_duration_seconds || 300) / 60) === mins;
                  return (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => onChange({ ...value, max_duration_seconds: mins * 60 })}
                      className={cn(
                        "rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors border cursor-pointer",
                        isSelected
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground border-border/60",
                      )}
                    >
                      {mins}m
                    </button>
                  );
                })}
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Auto-hangup threshold: call automatically concludes if conversation exceeds this
              duration.
            </p>
          </div>
        </div>

        {/* Section 1 Footer Navigation */}
        {activeNavTab !== "all" && (
          <div className="flex items-center justify-between pt-2 border-t border-border/60">
            <span className="text-xs text-muted-foreground">
              Step 1 of 3: Voice & Call Duration
            </span>
            <button
              type="button"
              onClick={() => setActiveNavTab("prompt")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-xs cursor-pointer"
            >
              <span>Next: System Prompt</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* ── Section 2: Templates & System Prompt ── */}
      <div
        className={cn("space-y-4", activeNavTab !== "prompt" && activeNavTab !== "all" && "hidden")}
      >
        {/* Template Quick Starters */}
        <div className="space-y-2.5 rounded-xl border border-border/80 bg-card/60 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Wand2 className="h-4 w-4 text-primary" />
              Quick Prompt Templates
            </span>
            <span className="text-[11px] text-muted-foreground">
              Click any preset to load tailored recruiter instructions
            </span>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-3">
            {DIALNEXA_TEMPLATES.map((tmpl) => (
              <button
                type="button"
                key={tmpl.id}
                onClick={() => applyTemplate(tmpl.id)}
                className={cn(
                  "group flex flex-col items-start gap-1.5 rounded-xl border p-3.5 text-left transition-all hover:border-primary hover:shadow-xs cursor-pointer",
                  activeTemplate === tmpl.id
                    ? "border-primary bg-primary/10 ring-1 ring-primary/40 shadow-xs"
                    : "border-border/80 bg-card hover:bg-muted/30",
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                    {tmpl.name}
                  </span>
                  {activeTemplate === tmpl.id ? (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-2.5 w-2.5" />
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground font-mono opacity-60 group-hover:opacity-100">
                      Apply →
                    </span>
                  )}
                </div>
                <p className="line-clamp-2 text-[11px] text-muted-foreground leading-normal">
                  {tmpl.description}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* System Prompt / Telephony Instructions Textarea */}
        <div className="space-y-2 rounded-xl border border-border/80 bg-card/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-amber-500" />
                DialNexa Agent Instructions & System Prompt
              </span>
              <Badge
                variant="outline"
                className="text-[10px] font-medium tracking-wide uppercase px-1.5 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
              >
                Multi-line Prompt
              </Badge>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-muted-foreground mr-1">Insert variable:</span>
              {VARIABLE_PILLS.map((p) => (
                <button
                  type="button"
                  key={p.token}
                  onClick={() => insertVariable("prompt", p.token)}
                  className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-mono text-foreground hover:bg-primary hover:text-primary-foreground transition-colors border border-border/60 cursor-pointer"
                  title={`Inserts ${p.token}`}
                >
                  +{p.label}
                </button>
              ))}
            </div>
          </div>
          <Textarea
            rows={9}
            value={value.prompt}
            onChange={(e) => onChange({ ...value, prompt: e.target.value })}
            placeholder="Enter system prompt and conversation instructions for the DialNexa phone screening agent..."
            className="font-mono text-xs leading-relaxed resize-y bg-background border-border/90 p-3"
          />
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              Variables:{" "}
              <code className="text-foreground font-semibold">{"{{candidate_name}}"}</code>,{" "}
              <code className="text-foreground font-semibold">{"{{job_title}}"}</code>,{" "}
              <code className="text-foreground font-semibold">{"{{company_name}}"}</code> are
              dynamically replaced by n8n.
            </span>
            <span className="font-mono">{value.prompt?.length || 0} characters</span>
          </div>
        </div>

        {/* Section 2 Footer Navigation */}
        {activeNavTab !== "all" && (
          <div className="flex items-center justify-between pt-2 border-t border-border/60">
            <button
              type="button"
              onClick={() => setActiveNavTab("voice")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Back: Voice Selection</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveNavTab("greeting")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-xs cursor-pointer"
            >
              <span>Next: Opening Greeting</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* ── Section 3: Opening Greeting ── */}
      <div
        className={cn(
          "space-y-4",
          activeNavTab !== "greeting" && activeNavTab !== "all" && "hidden",
        )}
      >
        {/* First Message / Greeting Field */}
        <div className="space-y-2 rounded-xl border border-border/80 bg-card/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Mic className="h-4 w-4 text-emerald-500" />
                Agent Greeting (First Spoken Message)
              </span>
              <Badge
                variant="outline"
                className="text-[10px] font-medium tracking-wide uppercase px-1.5 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
              >
                Opening Line
              </Badge>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-muted-foreground mr-1">Insert variable:</span>
              {VARIABLE_PILLS.map((p) => (
                <button
                  type="button"
                  key={p.token}
                  onClick={() => insertVariable("first_message", p.token)}
                  className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-mono text-foreground hover:bg-primary hover:text-primary-foreground transition-colors border border-border/60 cursor-pointer"
                  title={`Inserts ${p.token}`}
                >
                  +{p.label}
                </button>
              ))}
            </div>
          </div>
          <Input
            value={value.first_message || ""}
            onChange={(e) => onChange({ ...value, first_message: e.target.value })}
            placeholder="e.g. Hi {{candidate_name}}, this is Alex from the talent team regarding your application for {{job_title}}..."
            className="h-10 text-xs font-normal bg-background border-border/90"
          />
          <p className="text-[11px] text-muted-foreground">
            What the DialNexa synthetic voice speaks immediately when the candidate picks up the
            phone call.
          </p>
        </div>

        {/* Section 3 Footer Navigation */}
        {activeNavTab !== "all" && (
          <div className="flex items-center justify-between pt-2 border-t border-border/60">
            <button
              type="button"
              onClick={() => setActiveNavTab("prompt")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Back: System Prompt</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveNavTab("all")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/70 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <span>View All Settings</span>
              <Sliders className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
