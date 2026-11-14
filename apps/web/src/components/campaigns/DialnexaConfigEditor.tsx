"use client";

import {
  DEFAULT_DIALNEXA_FUNCTIONS,
  DIALNEXA_VOICES,
  type DialnexaFunctionConfig,
  type DialnexaVoiceConfig,
  VOICE_CALL_TYPES,
  type VoiceCallTopic,
  type VoiceCallTypeId,
} from "@scalepods/core";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  FileText,
  Flame,
  Info,
  PhoneCall,
  PhoneOff,
  Play,
  RefreshCw,
  Square,
  Volume2,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function InfoTooltip({ title, content, tip }: { title?: string; content: string; tip?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex items-center align-middle">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(!open);
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-all text-[10px] font-bold cursor-pointer ml-1.5 focus:outline-hidden ring-1 ring-border/50"
        aria-label={title || "Information"}
        title={title || "Click to learn more"}
      >
        <Info className="h-2.5 w-2.5" />
      </button>
      {open && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-72 max-w-[85vw] rounded-xl border border-border bg-popover/95 p-3 text-xs text-popover-foreground shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 pointer-events-auto">
          {title && (
            <div className="flex items-center gap-1.5 font-semibold text-foreground mb-1 text-[12px] border-b border-border/40 pb-1">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              <span>{title}</span>
            </div>
          )}
          <p className="text-[11px] leading-relaxed text-muted-foreground">{content}</p>
          {tip && (
            <div className="mt-2 pt-1.5 border-t border-border/50 text-[11px] text-cyan-600 dark:text-cyan-400 font-medium flex items-start gap-1.5 bg-cyan-500/5 -mx-1 px-2 py-1 rounded-md">
              <span className="shrink-0 text-xs">💡</span>
              <span className="leading-tight">{tip}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export interface DialnexaConfigEditorProps {
  value: DialnexaVoiceConfig;
  onChange: (value: DialnexaVoiceConfig) => void;
  jobTitle?: string;
  className?: string;
  onSave?: (value: DialnexaVoiceConfig) => Promise<void> | void;
  isSaving?: boolean;
}

export function DialnexaConfigEditor({
  value,
  onChange,
  jobTitle,
  className,
  onSave,
  isSaving = false,
}: DialnexaConfigEditorProps) {
  const detectedInitialType = useMemo<VoiceCallTypeId>(() => {
    const promptLower = (value.prompt || "").toLowerCase();
    if (
      promptLower.includes("technical talent screener") ||
      promptLower.includes("primary tech stack") ||
      promptLower.includes("programming languages")
    ) {
      return "technical";
    }
    if (
      promptLower.includes("cultural fit") ||
      promptLower.includes("culture & availability") ||
      promptLower.includes("values alignment")
    ) {
      return "cultural_fit";
    }
    return "general_screening";
  }, [value.prompt]);

  const [selectedCallTypeId, setSelectedCallTypeId] =
    useState<VoiceCallTypeId>(detectedInitialType);
  const [callTypeTopics, setCallTypeTopics] = useState<VoiceCallTopic[]>(() => {
    if (Array.isArray(value.topics) && value.topics.length > 0) {
      return value.topics.map((t) => ({ ...t }));
    }
    const typeDef =
      VOICE_CALL_TYPES.find((t) => t.id === detectedInitialType) || VOICE_CALL_TYPES[1];
    return typeDef.defaultTopics.map((t) => ({ ...t }));
  });
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [newTopicText, setNewTopicText] = useState<string>("");

  const [voiceAccentFilter, setVoiceAccentFilter] = useState<
    "all" | "Indian" | "American" | "British" | "Australian"
  >("all");

  const filteredVoices = useMemo(() => {
    if (voiceAccentFilter === "all") return DIALNEXA_VOICES;
    return DIALNEXA_VOICES.filter((v) => v.accent === voiceAccentFilter);
  }, [voiceAccentFilter]);

  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const functionsList: DialnexaFunctionConfig[] =
    value.agent_functions && value.agent_functions.length > 0
      ? value.agent_functions
      : DEFAULT_DIALNEXA_FUNCTIONS;

  const currentEagerness = value.response_eagerness ?? 0.1;

  // ── Testing State ──
  const [testPhoneNumber, setTestPhoneNumber] = useState("+91");
  const [testCandidateName, setTestCandidateName] = useState("Alex Morgan");
  const [isDispatchingCall, setIsDispatchingCall] = useState(false);
  const [phoneCallStatus, setPhoneCallStatus] = useState<string | null>(null);
  const [phoneCallId, setPhoneCallId] = useState<string | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const dispatchTimeRef = useRef<number | null>(null);

  const stopAudio = useCallback(() => {
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
  }, []);

  const fallbackSpeech = useCallback((voiceMeta: (typeof DIALNEXA_VOICES)[number]) => {
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
  }, []);

  const playVoiceSample = (voiceId: string) => {
    if (playingVoiceId === voiceId) {
      stopAudio();
      return;
    }

    stopAudio();
    const voiceMeta = DIALNEXA_VOICES.find((v) => v.id === voiceId);
    if (!voiceMeta) return;

    setPlayingVoiceId(voiceId);

    if (voiceMeta.sampleAudioUrl) {
      try {
        const audio = new Audio(voiceMeta.sampleAudioUrl);
        audioRef.current = audio;
        audio.onended = () => {
          setPlayingVoiceId(null);
          audioRef.current = null;
        };
        audio.onerror = () => {
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

  useEffect(() => {
    return () => {
      stopAudio();
    };
  }, [stopAudio]);

  const applyCallType = (typeId: VoiceCallTypeId) => {
    const callType = VOICE_CALL_TYPES.find((t) => t.id === typeId);
    if (!callType) return;
    const topics = callType.defaultTopics.map((t) => ({ ...t }));
    setSelectedCallTypeId(typeId);
    setCallTypeTopics(topics);
    setEditingTopicId(null);
    setNewTopicText("");

    let prompt = callType.buildPrompt(topics);
    let firstMessage = callType.buildFirstMessage();
    if (jobTitle?.trim()) {
      prompt = prompt.replace(/\{\{job_title\}\}/g, jobTitle.trim());
      firstMessage = firstMessage.replace(/\{\{job_title\}\}/g, jobTitle.trim());
    }

    onChange({
      ...value,
      call_type_id: typeId,
      topics,
      model: callType.model,
      max_duration_seconds: callType.max_duration_seconds,
      response_eagerness: callType.response_eagerness,
      responsiveness: callType.responsiveness,
      interruption_sensitivity: callType.interruption_sensitivity,
      transcriber_id: callType.transcriber_id,
      ambient_noise: callType.ambient_noise,
      backchanneling: callType.backchanneling,
      voicemail_detection: callType.voicemail_detection,
      hangup_on_voicemail: callType.hangup_on_voicemail,
      end_call_on_silence_sec: callType.end_call_on_silence_sec,
      llm_temperature: callType.llm_temperature,
      prompt,
      first_message: firstMessage,
    });
  };

  const updateCallTypeTopics = (newTopics: VoiceCallTopic[]) => {
    setCallTypeTopics(newTopics);
    const callType = VOICE_CALL_TYPES.find((t) => t.id === selectedCallTypeId);
    if (!callType) return;
    let prompt = callType.buildPrompt(newTopics);
    if (jobTitle?.trim()) {
      prompt = prompt.replace(/\{\{job_title\}\}/g, jobTitle.trim());
    }
    onChange({
      ...value,
      prompt,
      topics: newTopics,
      call_type_id: selectedCallTypeId,
    });
  };

  const fetchCallStatus = useCallback(
    async (callId?: string | null, phone?: string | null) => {
      const idToUse = callId || phoneCallId;
      const phoneToUse = phone || testPhoneNumber;
      if (!idToUse && !phoneToUse) return null;

      try {
        const sinceTime = dispatchTimeRef.current || Date.now() - 30000;
        const param =
          idToUse && idToUse !== "dispatched"
            ? `call_id=${encodeURIComponent(idToUse)}`
            : `phone=${encodeURIComponent(phoneToUse)}&is_test_call=true&since=${sinceTime}`;
        const res = await fetch(`/api/voice-screen/call-status?${param}`);
        if (res.ok) {
          const data = await res.json();
          const targetCall = data.call || (Array.isArray(data.calls) && data.calls[0]) || null;
          if (targetCall) {
            if (!idToUse || idToUse === "dispatched") {
              const callTime = targetCall.called_time
                ? new Date(targetCall.called_time).getTime()
                : targetCall.initiated_time
                  ? new Date(targetCall.initiated_time).getTime()
                  : 0;
              if (
                dispatchTimeRef.current &&
                callTime &&
                callTime < dispatchTimeRef.current - 5000
              ) {
                return null;
              }
            }
            return targetCall;
          }
        }
      } catch (err) {
        console.warn("Error fetching call status:", err);
      }
      return null;
    },
    [phoneCallId, testPhoneNumber],
  );

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, []);

  const dispatchRealPhoneCall = async () => {
    if (!testPhoneNumber || testPhoneNumber.length < 8) {
      toast.error("Please enter a valid phone number with country code (e.g. +91 98765 43210)");
      return;
    }

    dispatchTimeRef.current = Date.now();
    setPhoneCallId(null);
    setIsDispatchingCall(true);
    setCallError(null);
    setPhoneCallStatus("Dispatching outbound test call...");

    try {
      const callType =
        VOICE_CALL_TYPES.find((t) => t.id === selectedCallTypeId) || VOICE_CALL_TYPES[1];
      let activePrompt = value.prompt;
      if (callType && callTypeTopics.length > 0) {
        activePrompt = callType.buildPrompt(callTypeTopics);
        if (jobTitle?.trim()) {
          activePrompt = activePrompt.replace(/\{\{job_title\}\}/g, jobTitle.trim());
        }
      }

      const res = await fetch("/api/voice-screen/test-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone_number: testPhoneNumber,
          candidate_name: testCandidateName.trim() || "Alex Morgan",
          role_title: jobTitle || "ScalePods Voice Agent Test",
          prompt: activePrompt,
          custom_prompt: activePrompt,
          topics: callTypeTopics,
          discussion_topics: callTypeTopics,
          from_phone_number:
            value.outbound_from_number || value.from_phone_number || "+912264233051",
          from_number: value.outbound_from_number || value.from_number || "+912264233051",
          voice_call_config: {
            ...value,
            prompt: activePrompt,
            topics: callTypeTopics,
            call_type_id: selectedCallTypeId,
            outbound_from_number:
              value.outbound_from_number || value.from_phone_number || "+912264233051",
            from_phone_number:
              value.from_phone_number || value.outbound_from_number || "+912264233051",
            from_number: value.from_number || value.outbound_from_number || "+912264233051",
            caller_id: value.caller_id || value.outbound_from_number || "+912264233051",
          },
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.error) {
        let errorText =
          typeof data.error === "string"
            ? data.error
            : typeof data.error === "object" && data.error !== null
              ? (data.error as { message?: string; error?: string }).message ||
                (data.error as { message?: string; error?: string }).error ||
                JSON.stringify(data.error)
              : typeof data.message === "string"
                ? data.message
                : "Failed to trigger outbound test call";

        const isWorkflowError =
          /error in the workflow|error in workflow|workflow execution failed/i.test(errorText);
        if (isWorkflowError) {
          const detail =
            (typeof data.detail === "string" && data.detail) ||
            (typeof data.detail === "object" && data.detail !== null
              ? (data.detail as { message?: string; errorMessage?: string }).errorMessage ||
                (data.detail as { message?: string; errorMessage?: string }).message
              : undefined);
          errorText =
            detail && !/error in the workflow|error in workflow/i.test(detail)
              ? detail
              : "Workflow execution failed. Please verify your phone number and agent settings, then try again.";
        }

        toast.error(errorText);
        setCallError(isWorkflowError ? null : errorText);
        setPhoneCallStatus(null);
      } else {
        const callIdStr =
          typeof data.call_id === "string" || typeof data.call_id === "number"
            ? String(data.call_id)
            : "dispatched";
        setPhoneCallId(callIdStr);
        setPhoneCallStatus(
          `Test call dispatched (Call ID: ${callIdStr}). Your phone will ring shortly!`,
        );
        toast.success(`Outbound test call dispatched to ${testPhoneNumber}!`);

        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }

        let attempts = 0;
        fetchCallStatus(callIdStr, testPhoneNumber);
        pollTimerRef.current = setInterval(async () => {
          attempts++;
          const call = await fetchCallStatus(callIdStr, testPhoneNumber);
          if (
            (call?.status === "completed" && call?.recording_url && call?.transcript) ||
            attempts >= 36
          ) {
            if (pollTimerRef.current) {
              clearInterval(pollTimerRef.current);
              pollTimerRef.current = null;
            }
          }
        }, 4000);
      }
    } catch (err) {
      let errorMsg = err instanceof Error ? err.message : "Network error triggering test call";
      const isWorkflowError =
        /error in the workflow|error in workflow|workflow execution failed/i.test(errorMsg);
      if (isWorkflowError) {
        errorMsg = "Workflow execution failed. Please verify your settings and try again.";
      }
      toast.error(errorMsg);
      setCallError(isWorkflowError ? null : errorMsg);
      setPhoneCallStatus(null);
    } finally {
      setIsDispatchingCall(false);
    }
  };

  const selectedVoiceMeta = DIALNEXA_VOICES.find((v) => v.id === value.voice);

  return (
    <div
      className={cn(
        "rounded-2xl border border-border/80 bg-linear-to-b from-card/95 via-card/85 to-card/65 p-5 sm:p-6 shadow-md backdrop-blur-xl space-y-6",
        className,
      )}
    >
      {/* Header & Overview */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
        <div className="flex items-center gap-3.5">
          <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent text-primary ring-1 ring-primary/30 shadow-inner">
            <PhoneCall className="h-5 w-5" />
            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-base font-bold text-foreground tracking-tight">
                DialNexa Voice AI Agent
              </h4>
              <Badge
                variant="secondary"
                className="gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[11px] font-medium"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Automated Outbound
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Guided setup for voice call type, AI voice, discussion topics, and live test calls.
            </p>
          </div>
        </div>

        {/* Status Summary Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium border bg-muted/60 text-foreground border-border/60">
            <Volume2 className="h-3 w-3 text-cyan-500" />
            <span>Voice: {selectedVoiceMeta?.label || value.voice}</span>
          </span>

          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium border bg-muted/60 text-muted-foreground border-border/60">
            <Flame className="h-3 w-3 text-amber-500" />
            <span>Eagerness: {Math.round(currentEagerness * 100)}%</span>
          </span>

          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium border bg-muted/60 text-muted-foreground border-border/60">
            <Zap className="h-3 w-3 text-purple-500" />
            <span>{functionsList.filter((f) => f.enabled).length} Functions</span>
          </span>
        </div>
      </div>

      <div className="space-y-5 animate-in fade-in duration-200">
        {/* ── STEP 1: Pick Call Type ── */}
        <div className="rounded-2xl border border-border/80 bg-card/90 p-5 shadow-xs space-y-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-xs ring-1 ring-primary/20">
              1
            </div>
            <div>
              <h5 className="text-sm font-bold text-foreground flex items-center gap-1">
                Choose Call Type
                <InfoTooltip
                  title="Call Type"
                  content="All latency, model, duration, and AI settings are pre-optimised for each call type. You only customise the voice and the discussion topics."
                  tip="Pick the type closest to your hiring goal — you can always switch."
                />
              </h5>
              <p className="text-xs text-muted-foreground">
                All AI settings are pre-configured. Just pick the right type for your role.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {VOICE_CALL_TYPES.map((ct) => {
              const isSelected = selectedCallTypeId === ct.id;
              return (
                <button
                  key={ct.id}
                  type="button"
                  onClick={() => applyCallType(ct.id)}
                  className={cn(
                    "rounded-xl border p-4 text-left transition-all cursor-pointer flex flex-col gap-2.5 relative group",
                    isSelected
                      ? "border-primary bg-primary/10 ring-2 ring-primary/30 shadow-xs"
                      : "border-border/70 bg-background/60 hover:border-primary/40 hover:bg-muted/30",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-2xl leading-none">{ct.emoji}</span>
                    {isSelected && (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] shrink-0">
                        <Check className="h-3 w-3 stroke-[3]" />
                      </span>
                    )}
                  </div>
                  <div>
                    <h6 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                      {ct.name}
                    </h6>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                      {ct.tagline}
                    </p>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                    {ct.description}
                  </p>
                  <div className="flex items-center gap-1.5 flex-wrap mt-auto pt-1 border-t border-border/40">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {Math.round(ct.max_duration_seconds / 60)} min max
                    </span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {ct.badge}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── STEP 2: Pick Voice ── */}
        {selectedCallTypeId && (
          <div className="rounded-2xl border border-border/80 bg-card/90 p-5 shadow-xs space-y-3.5 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 font-bold text-xs ring-1 ring-cyan-500/20">
                2
              </div>
              <div>
                <h5 className="text-sm font-bold text-foreground flex items-center gap-1">
                  Choose AI Voice
                  <InfoTooltip
                    title="AI Voice"
                    content="The voice the candidate hears on the call. Click the play button to preview. All voices are available in all call types."
                    tip="Indian accents work best for India-based candidates."
                  />
                </h5>
                <p className="text-xs text-muted-foreground">
                  Click ▶ to preview. The rest of the AI configuration is fixed.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {(["all", "Indian", "American", "British", "Australian"] as const).map((accent) => (
                <button
                  key={accent}
                  type="button"
                  onClick={() => setVoiceAccentFilter(accent)}
                  className={cn(
                    "rounded-full px-3 py-1 text-[11px] font-semibold transition-all cursor-pointer border",
                    voiceAccentFilter === accent
                      ? "bg-cyan-600 text-white border-cyan-600 shadow-xs"
                      : "bg-muted/50 text-muted-foreground border-border/50 hover:bg-muted hover:text-foreground",
                  )}
                >
                  {accent === "all"
                    ? "All Voices"
                    : `${accent === "Indian" ? "🇮🇳" : accent === "American" ? "🇺🇸" : accent === "British" ? "🇬🇧" : "🇦🇺"} ${accent}`}
                </button>
              ))}
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 max-h-72 overflow-y-auto pr-1">
              {filteredVoices.map((voice) => {
                const isActive = value.voice === voice.id;
                const isPlaying = playingVoiceId === voice.id;
                return (
                  <div
                    key={voice.id}
                    className={cn(
                      "flex items-center gap-2 rounded-xl border p-2 transition-all group",
                      isActive
                        ? "border-cyan-500 bg-cyan-500/10 ring-1 ring-cyan-500/30"
                        : "border-border/60 hover:border-cyan-500/40 hover:bg-muted/30",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onChange({ ...value, voice: voice.id })}
                      className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
                      title={`Select ${voice.label}`}
                    >
                      <div
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold",
                          isActive
                            ? "bg-cyan-500 text-white"
                            : "bg-muted text-muted-foreground group-hover:bg-cyan-500/20",
                        )}
                      >
                        {voice.flag ||
                          (voice.gender === "Female" ? "♀" : voice.gender === "Male" ? "♂" : "∅")}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-semibold text-foreground truncate">
                            {voice.label}
                          </span>
                          {isActive && (
                            <Check className="h-3 w-3 text-cyan-500 shrink-0 stroke-[3]" />
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {voice.gender} · {voice.accent}
                        </p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => playVoiceSample(voice.id)}
                      className={cn(
                        "shrink-0 flex h-6 w-6 items-center justify-center rounded-full transition-all cursor-pointer",
                        isPlaying
                          ? "bg-cyan-500 text-white animate-pulse"
                          : "bg-muted/70 text-muted-foreground hover:bg-cyan-500/20 hover:text-cyan-600",
                      )}
                      aria-label={isPlaying ? `Stop ${voice.label}` : `Preview ${voice.label}`}
                    >
                      {isPlaying ? (
                        <Square className="h-2.5 w-2.5" />
                      ) : (
                        <Play className="h-2.5 w-2.5 ml-0.5" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            {selectedVoiceMeta && (
              <div className="rounded-xl bg-cyan-500/5 border border-cyan-500/20 px-3.5 py-2.5 text-xs text-muted-foreground flex items-start gap-2">
                <Volume2 className="h-4 w-4 text-cyan-500 mt-0.5 shrink-0" />
                <span>
                  <span className="font-semibold text-foreground">{selectedVoiceMeta.label}</span> —{" "}
                  {selectedVoiceMeta.description}
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 3: Discussion Topics ── */}
        {selectedCallTypeId && value.voice && (
          <div className="rounded-2xl border border-border/80 bg-card/90 p-5 shadow-xs space-y-3.5 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 font-bold text-xs ring-1 ring-violet-500/20">
                  3
                </div>
                <div>
                  <h5 className="text-sm font-bold text-foreground flex items-center gap-1">
                    Discussion Topics
                    <InfoTooltip
                      title="Discussion Topics"
                      content="The AI will naturally cover each topic during the call. You can add, edit, reorder or remove topics. The AI prompt is automatically rebuilt whenever you change topics."
                      tip="Keep topics concise — one idea per line works best."
                    />
                  </h5>
                  <p className="text-xs text-muted-foreground">
                    Edit what the AI discusses. Everything else is pre-configured.
                  </p>
                </div>
              </div>
              <Badge variant="outline" className="text-xs shrink-0">
                {callTypeTopics.length} topic{callTypeTopics.length !== 1 ? "s" : ""}
              </Badge>
            </div>

            <div className="space-y-2">
              {callTypeTopics.map((topic, idx) => (
                <div key={topic.id} className="flex items-start gap-2 group">
                  <span className="flex h-6 w-6 mt-1 shrink-0 items-center justify-center rounded-md bg-violet-500/10 text-violet-600 text-[11px] font-bold">
                    {idx + 1}
                  </span>
                  {editingTopicId === topic.id ? (
                    <div className="flex flex-1 gap-1.5">
                      <Input
                        value={topic.text}
                        onChange={(e) => {
                          const updated = callTypeTopics.map((t) =>
                            t.id === topic.id ? { ...t, text: e.target.value } : t,
                          );
                          updateCallTypeTopics(updated);
                        }}
                        onBlur={() => setEditingTopicId(null)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") setEditingTopicId(null);
                        }}
                        autoFocus
                        className="h-8 text-xs flex-1"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-emerald-600 hover:bg-emerald-500/10 cursor-pointer"
                        onClick={() => setEditingTopicId(null)}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-1 items-start gap-1.5 rounded-lg border border-border/50 px-2.5 py-1.5 bg-background/60 hover:border-violet-400/40 hover:bg-muted/20 transition-all">
                      <p className="flex-1 text-xs text-foreground leading-snug py-0.5">
                        {topic.text}
                      </p>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          type="button"
                          onClick={() => setEditingTopicId(topic.id)}
                          className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-violet-600 hover:bg-violet-500/10 cursor-pointer transition-all"
                          aria-label="Edit topic"
                        >
                          <FileText className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = callTypeTopics.filter((t) => t.id !== topic.id);
                            updateCallTypeTopics(updated);
                          }}
                          className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-red-500 hover:bg-red-500/10 cursor-pointer transition-all"
                          aria-label="Remove topic"
                        >
                          <PhoneOff className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              <div className="flex items-center gap-2 pt-1">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground text-[11px] font-bold">
                  +
                </span>
                <Input
                  value={newTopicText}
                  onChange={(e) => setNewTopicText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newTopicText.trim()) {
                      const updated = [
                        ...callTypeTopics,
                        { id: `custom-${Date.now()}`, text: newTopicText.trim() },
                      ];
                      updateCallTypeTopics(updated);
                      setNewTopicText("");
                    }
                  }}
                  placeholder="Type a new topic and press Enter…"
                  className="h-8 text-xs flex-1"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!newTopicText.trim()}
                  onClick={() => {
                    if (!newTopicText.trim()) return;
                    const updated = [
                      ...callTypeTopics,
                      { id: `custom-${Date.now()}`, text: newTopicText.trim() },
                    ];
                    updateCallTypeTopics(updated);
                    setNewTopicText("");
                  }}
                  className="h-8 text-xs cursor-pointer"
                >
                  Add
                </Button>
              </div>
            </div>

            <div className="rounded-lg bg-muted/40 border border-border/50 p-3 text-[11px] text-muted-foreground flex items-start gap-2">
              <Info className="h-3.5 w-3.5 text-violet-500 mt-0.5 shrink-0" />
              <span>
                The AI will cover topics in order, asking natural follow-up questions as needed. You
                don't need to write scripts — the AI handles conversation flow automatically.
              </span>
            </div>
          </div>
        )}

        {/* ── STEP 4: Test Call ── */}
        {selectedCallTypeId && value.voice && callTypeTopics.length > 0 && (
          <div className="rounded-2xl border border-border/80 bg-card/90 p-5 shadow-xs space-y-3.5 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold text-xs ring-1 ring-emerald-500/20">
                4
              </div>
              <div>
                <h5 className="text-sm font-bold text-foreground flex items-center gap-1">
                  Test Call
                  <InfoTooltip
                    title="Test Call"
                    content="Sends a real call to your phone so you can hear exactly what candidates will experience."
                    tip="Use a real mobile number — the call rings within 15 seconds."
                  />
                </h5>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>Dial your phone to hear the AI before going live.</span>
                  <span className="inline-flex items-center gap-1 rounded-md bg-muted/60 border border-border/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground font-medium">
                    From: +91 22 6423 3051
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                type="text"
                value={testCandidateName}
                onChange={(e) => setTestCandidateName(e.target.value)}
                placeholder="Candidate Name (e.g. Alex Morgan)"
                className="h-9 text-sm sm:w-48"
                aria-label="Test Candidate Name"
              />
              <Input
                type="tel"
                value={testPhoneNumber}
                onChange={(e) => setTestPhoneNumber(e.target.value)}
                placeholder="+91 98765 43210"
                className="h-9 text-sm flex-1"
                aria-label="Test Phone Number"
              />
              <Button
                type="button"
                onClick={() => dispatchRealPhoneCall()}
                disabled={isDispatchingCall || testPhoneNumber.length < 8}
                className="h-9 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer shrink-0"
              >
                {isDispatchingCall ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    Calling…
                  </>
                ) : (
                  <>
                    <PhoneCall className="h-3.5 w-3.5" />
                    Test Call Now
                  </>
                )}
              </Button>
              {onSave && (
                <Button
                  type="button"
                  onClick={() => onSave(value)}
                  disabled={isSaving}
                  className="h-9 gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold cursor-pointer shrink-0"
                >
                  {isSaving ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Save to Campaign
                    </>
                  )}
                </Button>
              )}
            </div>

            {phoneCallStatus && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {phoneCallStatus}
              </div>
            )}
            {callError && !/error in the workflow|error in workflow/i.test(callError) && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {callError}
              </div>
            )}
          </div>
        )}

        {/* ── What's fixed callout ── */}
        {selectedCallTypeId &&
          (() => {
            const ct = VOICE_CALL_TYPES.find((t) => t.id === selectedCallTypeId);
            if (!ct) return null;
            return (
              <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3 space-y-2">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-amber-500" />
                  Pre-configured for {ct.name}
                </p>
                <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                  <span className="rounded-full bg-muted border border-border/50 px-2.5 py-0.5">
                    🧠 Model: {ct.model}
                  </span>
                  <span className="rounded-full bg-muted border border-border/50 px-2.5 py-0.5">
                    ⏱ {Math.round(ct.max_duration_seconds / 60)} min limit
                  </span>
                  <span className="rounded-full bg-muted border border-border/50 px-2.5 py-0.5">
                    🎙 {ct.transcriber_id.replace("trs_", "").replace(/_/g, " ")}
                  </span>
                  <span className="rounded-full bg-muted border border-border/50 px-2.5 py-0.5">
                    ⚡ Eagerness: {ct.response_eagerness}
                  </span>
                  <span className="rounded-full bg-muted border border-border/50 px-2.5 py-0.5">
                    🔇 Silence cutoff: {ct.end_call_on_silence_sec}s
                  </span>
                </div>
              </div>
            );
          })()}

        {/* Save & Apply Confirmation Callout */}
        {onSave && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 shadow-2xs">
            <div className="space-y-0.5">
              <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                Ready to deploy these voice screening settings?
              </p>
              <p className="text-[11px] text-muted-foreground">
                Saves the selected voice, questions, and parameters to the campaign and publishes
                them live to DialNexa.
              </p>
            </div>
            <Button
              type="button"
              onClick={() => onSave(value)}
              disabled={isSaving}
              className="h-9 gap-2 text-xs font-semibold cursor-pointer shrink-0"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Saving & Publishing…
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Save & Publish Configuration
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
