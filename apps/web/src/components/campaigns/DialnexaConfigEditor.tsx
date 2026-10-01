"use client";

import {
  DEFAULT_BOOSTED_KEYWORDS,
  DEFAULT_DIALNEXA_FUNCTIONS,
  DEFAULT_POST_CALL_ANALYSIS,
  DIALNEXA_TEMPLATES,
  DIALNEXA_TRANSCRIBERS,
  DIALNEXA_VOICES,
  type DialnexaFunctionConfig,
  type DialnexaPostCallField,
  type DialnexaVoiceConfig,
} from "@scalepods/core";
import {
  Activity,
  AlertCircle,
  Bot,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cpu,
  ExternalLink,
  FileText,
  Flame,
  Headphones,
  MessageSquareText,
  Mic,
  PhoneCall,
  PhoneForwarded,
  PhoneOff,
  Play,
  RefreshCw,
  Send,
  Sliders,
  Sparkles,
  Square,
  Volume2,
  Wand2,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
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

  useEffect(() => {
    const isPreset = DIALNEXA_VOICES.some((v) => v.id === value.voice);
    setVoiceSelectValue(isPreset ? value.voice : "custom");
    setCustomVoiceText(isPreset ? "" : value.voice || "");
  }, [value.voice]);

  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [activeNavTab, setActiveNavTab] = useState<
    | "voice"
    | "prompt"
    | "greeting"
    | "duration"
    | "eagerness"
    | "functions"
    | "stt"
    | "test"
    | "all"
  >("voice");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Fallback defaults for new fields if not already on value
  const functionsList: DialnexaFunctionConfig[] =
    value.agent_functions && value.agent_functions.length > 0
      ? value.agent_functions
      : DEFAULT_DIALNEXA_FUNCTIONS;

  const postCallList: DialnexaPostCallField[] =
    value.post_call_analysis && value.post_call_analysis.length > 0
      ? value.post_call_analysis
      : DEFAULT_POST_CALL_ANALYSIS;

  const currentEagerness = value.response_eagerness ?? 0.7;
  const currentResponsiveness = value.responsiveness ?? 0.8;
  const currentInterruption = value.interruption_sensitivity ?? 0.5;
  const currentTranscriber = value.transcriber_id ?? "trs_deepgram_nova_2";

  // ── Testing State ──
  const [testMode, setTestMode] = useState<"simulator" | "phone">("simulator");
  const [testPhoneNumber, setTestPhoneNumber] = useState("+91");
  const [testCandidateName, setTestCandidateName] = useState("Alex Morgan");
  const [isDispatchingCall, setIsDispatchingCall] = useState(false);
  const [phoneCallStatus, setPhoneCallStatus] = useState<string | null>(null);
  const [phoneCallId, setPhoneCallId] = useState<string | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const [testCallResult, setTestCallResult] = useState<{
    id: string;
    duration: number;
    status: string;
    called_time: string | null;
    recording_url: string | null;
    sentiment: string | null;
    transcript: string | null;
    turns?: Array<{ speaker: "agent" | "candidate"; text: string; start: number; end: number }>;
  } | null>(null);
  const [isPollingCall, setIsPollingCall] = useState(false);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // In-browser Simulator State
  const [simActive, setSimActive] = useState(false);
  const [simMessages, setSimMessages] = useState<
    Array<{
      id: string;
      sender: "agent" | "candidate" | "system";
      text: string;
      time: string;
      fnTrigger?: string;
    }>
  >([]);
  const [candidateInput, setCandidateInput] = useState("");
  const [isAgentThinking, setIsAgentThinking] = useState(false);
  const [simScorecard, setSimScorecard] = useState<Record<string, string | number> | null>(null);

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

  const previewGreetingAudio = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      const textToSpeak = (value.first_message || "Hello, thank you for speaking with us today.")
        .replace(/\{\{candidate_name\}\}/g, testCandidateName || "Candidate")
        .replace(/\{\{job_title\}\}/g, jobTitle || "Open Position")
        .replace(/\{\{company_name\}\}/g, "ScalePods");
      const u = new SpeechSynthesisUtterance(textToSpeak);
      u.rate = value.voice_speed || 1.0;
      window.speechSynthesis.speak(u);
    } catch {}
  };

  useEffect(() => {
    return () => {
      stopAudio();
    };
  }, [stopAudio]);

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

    if (jobTitle?.trim()) {
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

  // ── Functions Management ──
  const toggleFunction = (fnType: string) => {
    const updated = functionsList.map((f) => {
      if (f.type === fnType) {
        return { ...f, enabled: !f.enabled };
      }
      return f;
    });
    onChange({ ...value, agent_functions: updated });
  };

  const updateFunctionConfig = (fnType: string, newConfig: Record<string, unknown>) => {
    const updated = functionsList.map((f) => {
      if (f.type === fnType) {
        return { ...f, config: { ...f.config, ...newConfig } };
      }
      return f;
    });
    onChange({ ...value, agent_functions: updated });
  };

  // ── In-Browser Simulator Logic ──
  const startSimulator = () => {
    stopAudio();
    setSimActive(true);
    setSimScorecard(null);
    const initialGreeting = (value.first_message || DIALNEXA_TEMPLATES[0].first_message)
      .replace(/\{\{candidate_name\}\}/g, testCandidateName)
      .replace(/\{\{job_title\}\}/g, jobTitle || "Software Engineer")
      .replace(/\{\{company_name\}\}/g, "ScalePods");

    const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setSimMessages([
      {
        id: "msg-init-sys",
        sender: "system",
        text: `Voice Session Initialized · Transcriber: ${currentTranscriber} · Eagerness: ${currentEagerness} · Max Duration: ${Math.round((value.max_duration_seconds || 300) / 60)}m`,
        time: timeStr,
      },
      {
        id: "msg-init-agent",
        sender: "agent",
        text: initialGreeting,
        time: timeStr,
      },
    ]);

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        const u = new SpeechSynthesisUtterance(initialGreeting);
        u.rate = value.voice_speed || 1.0;
        window.speechSynthesis.speak(u);
      } catch {}
    }
  };

  const endSimulator = () => {
    stopAudio();
    setSimActive(false);

    // Mock automatic post-call analysis extraction
    setSimScorecard({
      overall_recommendation: "STRONG_YES",
      technical_qualification_score: 8.5,
      notice_period_days: 15,
      candidate_interest_level: "High",
      key_strengths_summary: "Strong system architecture background, immediate availability",
    });

    setSimMessages((prev) => [
      ...prev,
      {
        id: `msg-end-${Date.now()}`,
        sender: "system",
        text: `Call Ended (Duration: 2m 14s) · Post-Call Analysis Extracted Successfully.`,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
  };

  const sendCandidateMessage = () => {
    if (!candidateInput.trim() || !simActive) return;

    const userText = candidateInput.trim();
    setCandidateInput("");

    const newMsgs = [
      ...simMessages,
      {
        id: `msg-user-${Date.now()}`,
        sender: "candidate" as const,
        text: userText,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ];
    setSimMessages(newMsgs);
    setIsAgentThinking(true);

    const simulatedLatencyMs = Math.round((1 - currentEagerness) * 1100 + 300);

    setTimeout(() => {
      setIsAgentThinking(false);

      let reply = "";
      let fnTrigger: string | undefined;
      const lower = userText.toLowerCase();

      const transferEnabled = functionsList.find((f) => f.type === "call_transfer")?.enabled;
      const calendarEnabled = functionsList.find(
        (f) => f.type === "check_calendar_availability",
      )?.enabled;

      if (
        transferEnabled &&
        (lower.includes("transfer") ||
          lower.includes("human") ||
          lower.includes("person") ||
          lower.includes("recruiter"))
      ) {
        fnTrigger = "call_transfer";
        reply =
          "Understood! Transferring you directly to our lead recruiting coordinator now. Please hold on a moment.";
      } else if (
        lower.includes("bye") ||
        lower.includes("thank you") ||
        lower.includes("that's all") ||
        lower.includes("hang up")
      ) {
        fnTrigger = "end_call";
        reply =
          "Thank you so much for your time today. Our team will review the conversation and be in touch with next steps. Goodbye!";
      } else if (
        calendarEnabled &&
        (lower.includes("schedule") ||
          lower.includes("calendar") ||
          lower.includes("book") ||
          lower.includes("next round") ||
          lower.includes("time slot"))
      ) {
        fnTrigger = "check_calendar_availability";
        reply =
          "I've checked our hiring team's calendar. We have slots open this Thursday at 2:00 PM and Friday at 11:00 AM. Would either of those work for you?";
      } else if (
        lower.includes("experience") ||
        lower.includes("work") ||
        lower.includes("project") ||
        lower.includes("stack") ||
        lower.includes("react") ||
        lower.includes("python")
      ) {
        reply = `That sounds impressive. Could you tell me a little bit more about the biggest architecture or scaling challenge you solved in that project?`;
      } else if (
        lower.includes("salary") ||
        lower.includes("ctc") ||
        lower.includes("compensation")
      ) {
        reply = `Thanks for noting that. We align our compensation bands competitively with experience. What notice period would you require before joining?`;
      } else if (
        lower.includes("notice") ||
        lower.includes("immediate") ||
        lower.includes("month") ||
        lower.includes("days")
      ) {
        reply = `Got it, that timeline fits well with our hiring goals. Do you have any questions for me about the team structure or culture at ScalePods?`;
      } else {
        reply = `Thank you for sharing that, ${testCandidateName}. That directly aligns with what the team is looking for in the ${jobTitle || "role"}.`;
      }

      setSimMessages((prev) => [
        ...prev,
        {
          id: `msg-agent-${Date.now()}`,
          sender: "agent",
          text: reply,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          fnTrigger,
        },
      ]);

      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        try {
          const u = new SpeechSynthesisUtterance(reply);
          u.rate = value.voice_speed || 1.0;
          window.speechSynthesis.speak(u);
        } catch {}
      }

      if (fnTrigger === "end_call") {
        setTimeout(() => {
          endSimulator();
        }, 1500);
      }
    }, simulatedLatencyMs);
  };

  // ── Call Status Polling & Transcript Retrieval ──
  const fetchCallStatus = useCallback(
    async (callId?: string | null, phone?: string | null) => {
      const idToUse = callId || phoneCallId;
      const phoneToUse = phone || testPhoneNumber;
      if (!idToUse && !phoneToUse) return null;

      setIsPollingCall(true);
      try {
        const param =
          idToUse && idToUse !== "dispatched"
            ? `call_id=${encodeURIComponent(idToUse)}`
            : `phone=${encodeURIComponent(phoneToUse)}`;
        const res = await fetch(`/api/voice-screen/call-status?${param}`);
        if (res.ok) {
          const data = await res.json();
          const targetCall = data.call || (Array.isArray(data.calls) && data.calls[0]) || null;
          if (targetCall) {
            setTestCallResult(targetCall);
            return targetCall;
          }
        }
      } catch (err) {
        console.warn("Error fetching call status:", err);
      } finally {
        setIsPollingCall(false);
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

  // ── Real Phone Test Call Dispatch ──
  const dispatchRealPhoneCall = async () => {
    if (!testPhoneNumber || testPhoneNumber.length < 8) {
      setCallError("Please enter a valid phone number with country code (e.g. +91 98765 43210)");
      return;
    }

    setIsDispatchingCall(true);
    setCallError(null);
    setPhoneCallStatus("Dispatching outbound test call...");

    try {
      const res = await fetch("/api/voice-screen/test-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone_number: testPhoneNumber,
          candidate_name: testCandidateName,
          role_title: jobTitle || "ScalePods Voice Agent Test",
          voice_call_config: value,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        const errorText =
          typeof data.error === "string"
            ? data.error
            : typeof data.error === "object" && data.error !== null
              ? (data.error as { message?: string; error?: string }).message ||
                (data.error as { message?: string; error?: string }).error ||
                JSON.stringify(data.error)
              : typeof data.message === "string"
                ? data.message
                : "Failed to trigger outbound test call";
        setCallError(errorText);
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

        // Start automated polling for call telemetry, recording, and transcript
        setTestCallResult(null);
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
      setCallError(err instanceof Error ? err.message : "Network error triggering test call");
      setPhoneCallStatus(null);
    } finally {
      setIsDispatchingCall(false);
    }
  };

  const selectedVoiceMeta = DIALNEXA_VOICES.find((v) => v.id === value.voice);
  const selectedTranscriberMeta = DIALNEXA_TRANSCRIBERS.find((t) => t.id === currentTranscriber);

  // Calculate progress percentage through the 7 steps
  const stepNumberMap: Record<string, number> = {
    voice: 1,
    prompt: 2,
    greeting: 3,
    duration: 3,
    eagerness: 4,
    functions: 5,
    stt: 6,
    test: 7,
    all: 7,
  };
  const currentStepNum = stepNumberMap[activeNavTab] || 1;
  const progressPercent = activeNavTab === "all" ? 100 : Math.round((currentStepNum / 7) * 100);

  return (
    <div
      className={cn(
        "rounded-2xl border border-border/80 bg-linear-to-b from-card/95 via-card/85 to-card/65 p-5 sm:p-6 shadow-md backdrop-blur-xl space-y-6",
        className,
      )}
    >
      {/* Studio Header & DialNexa Branding */}
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
              <Badge
                variant="outline"
                className="text-[10px] text-blue-600 dark:text-blue-400 border-blue-500/30 bg-blue-500/5 font-semibold"
              >
                Voice Screening Studio
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Full suite configuration: latency tuning, turn-taking eagerness, custom functions,
              acoustic polish, and live testing.
            </p>
          </div>
        </div>

        {/* Quick KPI Overview & Direct Test Action */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveNavTab("voice")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer border",
              activeNavTab === "voice"
                ? "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30 shadow-2xs"
                : "bg-muted/60 text-foreground border-border/60 hover:bg-muted",
            )}
            title="Jump to Voice & Audio"
          >
            <Volume2 className="h-3 w-3 text-cyan-500" />
            <span>Voice: {selectedVoiceMeta?.label || value.voice}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveNavTab("eagerness")}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer border",
              activeNavTab === "eagerness"
                ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 shadow-2xs"
                : "bg-muted/60 text-muted-foreground border-border/60 hover:bg-muted",
            )}
            title="Jump to Eagerness & Turn-Taking"
          >
            <Flame className="h-3 w-3 text-amber-500" />
            <span>Eagerness: {Math.round(currentEagerness * 100)}%</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveNavTab("functions")}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer border",
              activeNavTab === "functions"
                ? "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30 shadow-2xs"
                : "bg-muted/60 text-muted-foreground border-border/60 hover:bg-muted",
            )}
            title="Jump to Agent Functions"
          >
            <Zap className="h-3 w-3 text-purple-500" />
            <span>{functionsList.filter((f) => f.enabled).length} Functions</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveNavTab("test")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold transition-all cursor-pointer border",
              activeNavTab === "test"
                ? "bg-emerald-600 text-white border-emerald-600 shadow-xs ring-2 ring-emerald-500/20"
                : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20",
            )}
            title="Open Test Console"
          >
            <Bot className="h-3.5 w-3.5 text-emerald-500" />
            <span>Test Agent</span>
          </button>
        </div>
      </div>

      {/* Primary Section Navigation Tabs */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-card/60 p-1.5 shadow-2xs backdrop-blur-sm">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar max-w-full">
            <button
              type="button"
              onClick={() => setActiveNavTab("voice")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer shrink-0",
                activeNavTab === "voice"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
              )}
            >
              <Volume2 className="h-3.5 w-3.5 text-cyan-400" />
              <span>1. Voice & Audio</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveNavTab("prompt")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer shrink-0",
                activeNavTab === "prompt"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
              )}
            >
              <Sparkles className="h-3.5 w-3.5 text-violet-400" />
              <span>2. System Prompt</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveNavTab("greeting")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer shrink-0",
                activeNavTab === "greeting"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
              )}
            >
              <Mic className="h-3.5 w-3.5 text-emerald-400" />
              <span>3. Opening Greeting</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveNavTab("eagerness")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer shrink-0",
                activeNavTab === "eagerness"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
              )}
            >
              <Flame className="h-3.5 w-3.5 text-amber-400" />
              <span>4. Eagerness & Latency</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveNavTab("functions")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer shrink-0",
                activeNavTab === "functions"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
              )}
            >
              <Zap className="h-3.5 w-3.5 text-purple-400" />
              <span>5. Functions & Tools</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveNavTab("stt")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer shrink-0",
                activeNavTab === "stt"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
              )}
            >
              <Cpu className="h-3.5 w-3.5 text-cyan-400" />
              <span>6. STT & Boost</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveNavTab("test")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer shrink-0",
                activeNavTab === "test"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10",
              )}
            >
              <Activity className="h-3.5 w-3.5" />
              <span>7. Live Test Console</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveNavTab("all")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all cursor-pointer border border-transparent shrink-0",
                activeNavTab === "all"
                  ? "bg-card text-foreground border-border/80 shadow-xs"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
              title="View all sections"
            >
              <Sliders className="h-3.5 w-3.5" />
              <span>All Sections</span>
            </button>
          </div>

          <span className="text-[11px] font-mono text-muted-foreground px-2 shrink-0">
            {activeNavTab === "all"
              ? "Overview mode"
              : `Step ${
                  activeNavTab === "voice"
                    ? "1"
                    : activeNavTab === "prompt"
                      ? "2"
                      : activeNavTab === "greeting"
                        ? "3"
                        : activeNavTab === "eagerness"
                          ? "4"
                          : activeNavTab === "functions"
                            ? "5"
                            : activeNavTab === "stt"
                              ? "6"
                              : "7"
                } of 7`}
          </span>
        </div>

        {/* Stepper Progress Bar */}
        <div className="h-1 w-full rounded-full bg-border/40 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary via-cyan-500 to-emerald-500 transition-all duration-300 ease-out rounded-full"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* ── Section 1: Voice & Audio Tuning ── */}
      <div
        className={cn("space-y-4", activeNavTab !== "voice" && activeNavTab !== "all" && "hidden")}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Synthetic Voice Card */}
          <div className="flex flex-col justify-between rounded-xl border border-border/90 bg-card/80 p-4 shadow-xs space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Volume2 className="h-4 w-4 text-cyan-500" />
                DialNexa Synthetic Voice (TTS)
              </span>
              <Badge variant="outline" className="text-[10px] font-mono">
                {selectedVoiceMeta?.provider || "Custom"}
              </Badge>
            </div>

            <div className="space-y-2">
              <Select value={voiceSelectValue} onValueChange={handleVoiceSelectChange}>
                <SelectTrigger className="h-11 w-full bg-background border-border/90 px-3.5 text-foreground shadow-xs">
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
                  {DIALNEXA_VOICES.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      <div className="flex items-center justify-between gap-4 w-full pr-3">
                        <span className="font-semibold text-foreground text-sm">{v.label}</span>
                        <span className="text-[11px] font-mono text-muted-foreground">
                          {v.gender} · {v.provider}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                  <SelectSeparator />
                  <SelectItem value="custom">Custom Voice ID…</SelectItem>
                </SelectContent>
              </Select>

              {voiceSelectValue === "custom" && (
                <div className="pt-1.5">
                  <label htmlFor={customVoiceId} className="sr-only">
                    Custom Voice ID
                  </label>
                  <Input
                    id={customVoiceId}
                    placeholder="e.g. eleven_labs_voice_abc123"
                    value={customVoiceText}
                    onChange={(e) => handleCustomVoiceChange(e.target.value)}
                    className="h-9 text-xs font-mono bg-background"
                  />
                </div>
              )}
            </div>

            {selectedVoiceMeta && (
              <div className="rounded-lg bg-muted/40 border border-border/60 p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground">{selectedVoiceMeta.label}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {selectedVoiceMeta.description}
                  </span>
                </div>
                {selectedVoiceMeta.sampleText && (
                  <p className="text-[11px] text-muted-foreground italic leading-relaxed">
                    &ldquo;{selectedVoiceMeta.sampleText}&rdquo;
                  </p>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => playVoiceSample(selectedVoiceMeta.id)}
                  className="w-full gap-2 text-xs border-primary/30 hover:bg-primary/5 cursor-pointer"
                >
                  {playingVoiceId === selectedVoiceMeta.id ? (
                    <>
                      <Square className="h-3 w-3 text-rose-500 fill-rose-500" />
                      <span>Stop Sample</span>
                    </>
                  ) : (
                    <>
                      <Play className="h-3 w-3 text-cyan-500 fill-cyan-500" />
                      <span>Sample Voice</span>
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* Quick Audition Grid */}
            <div className="space-y-1.5 pt-1">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Audition all voices
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {DIALNEXA_VOICES.map((v) => (
                  <div
                    key={v.id}
                    className={cn(
                      "flex items-center justify-between p-2 rounded-lg border text-left text-xs transition-colors",
                      value.voice === v.id
                        ? "border-primary bg-primary/10 text-primary font-semibold"
                        : "border-border/60 bg-background/50 hover:bg-muted text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <button
                      type="button"
                      title={`Select ${v.label}`}
                      onClick={() => {
                        setVoiceSelectValue(v.id);
                        onChange({ ...value, voice: v.id });
                      }}
                      className="truncate text-left flex-1 cursor-pointer font-medium"
                    >
                      {v.label}
                    </button>
                    <button
                      type="button"
                      onClick={() => playVoiceSample(v.id)}
                      className="p-1 hover:text-primary rounded cursor-pointer shrink-0 ml-1"
                      title={`Preview ${v.label}`}
                    >
                      {playingVoiceId === v.id ? (
                        <Square className="h-2.5 w-2.5 text-rose-500 fill-rose-500" />
                      ) : (
                        <Play className="h-2.5 w-2.5" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Voice Speed, Pitch & Acoustics */}
          <div className="flex flex-col justify-between rounded-xl border border-border/90 bg-card/80 p-4 shadow-xs space-y-3.5">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Headphones className="h-4 w-4 text-purple-500" />
              Acoustic Polish & Speech Speed
            </span>

            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground font-medium">Speaking Pace</span>
                  <span className="font-mono text-primary font-bold">
                    {(value.voice_speed ?? 1.0).toFixed(2)}x
                  </span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="1.5"
                  step="0.05"
                  value={value.voice_speed ?? 1.0}
                  onChange={(e) => onChange({ ...value, voice_speed: parseFloat(e.target.value) })}
                  className="w-full accent-primary mt-1"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground font-medium">Voice Pitch</span>
                  <span className="font-mono text-primary font-bold">
                    {(value.voice_pitch ?? 0) > 0
                      ? `+${value.voice_pitch ?? 0}`
                      : (value.voice_pitch ?? 0)}
                  </span>
                </div>
                <input
                  type="range"
                  min="-10"
                  max="10"
                  step="1"
                  value={value.voice_pitch ?? 0}
                  onChange={(e) =>
                    onChange({ ...value, voice_pitch: parseInt(e.target.value, 10) })
                  }
                  className="w-full accent-primary mt-1"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground font-medium">
                    Temperature (Expressiveness)
                  </span>
                  <span className="font-mono text-primary font-bold">
                    {(value.voice_temperature ?? 1.0).toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="1.5"
                  step="0.05"
                  value={value.voice_temperature ?? 1.0}
                  onChange={(e) =>
                    onChange({ ...value, voice_temperature: parseFloat(e.target.value) })
                  }
                  className="w-full accent-primary mt-1"
                />
              </div>

              <div className="pt-2 border-t border-border/60 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-foreground">Ambient Line Noise</p>
                  <p className="text-[11px] text-muted-foreground">
                    Comfort telephony line noise to avoid dead silence
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={value.ambient_noise ?? true}
                  onChange={(e) => onChange({ ...value, ambient_noise: e.target.checked })}
                  className="h-4 w-4 accent-primary rounded cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-foreground">Denoising Strength (0-4)</p>
                  <p className="text-[11px] text-muted-foreground">
                    Removes background chatter from candidate end
                  </p>
                </div>
                <span className="text-xs font-mono font-bold text-primary">
                  {value.denoise_strength ?? 1}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button size="sm" onClick={() => setActiveNavTab("prompt")} className="gap-1 text-xs">
            Next: System Prompt <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* ── Section 2: System Prompt & Conversational Guidelines ── */}
      <div
        className={cn("space-y-4", activeNavTab !== "prompt" && activeNavTab !== "all" && "hidden")}
      >
        {/* Templates Picker */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Wand2 className="h-4 w-4 text-primary" />
              Recruitment Screening Templates
            </span>
            <span className="text-[11px] text-muted-foreground">
              Click any template to auto-populate prompt & greeting
            </span>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-3">
            {DIALNEXA_TEMPLATES.map((tmpl) => (
              <button
                key={tmpl.id}
                type="button"
                onClick={() => applyTemplate(tmpl.id)}
                className={cn(
                  "rounded-xl border p-3 text-left transition-all cursor-pointer",
                  activeTemplate === tmpl.id
                    ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/30"
                    : "border-border/70 bg-card/60 hover:border-primary/40",
                )}
              >
                <div className="flex items-center justify-between">
                  <h6 className="text-xs font-semibold text-foreground">{tmpl.name}</h6>
                  {activeTemplate === tmpl.id && (
                    <Badge
                      variant="secondary"
                      className="text-[9px] px-1.5 py-0 bg-primary/20 text-primary"
                    >
                      Active
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">
                  {tmpl.description}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* System Prompt Instructions */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-primary" />
              System Prompt & Conversational Guidelines
            </span>
            <div className="flex items-center gap-1">
              {VARIABLE_PILLS.map((p) => (
                <button
                  key={p.token}
                  type="button"
                  onClick={() => insertVariable("prompt", p.token)}
                  className="rounded-md bg-muted/80 px-2 py-0.5 text-[10px] font-mono text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer border border-border/60"
                  title={`Insert ${p.token}`}
                >
                  +{p.label}
                </button>
              ))}
            </div>
          </div>
          <Textarea
            rows={10}
            value={value.prompt || ""}
            onChange={(e) => onChange({ ...value, prompt: e.target.value })}
            placeholder="Enter system prompt and conversation instructions for the AI screening agent..."
            className="text-xs font-mono bg-background leading-relaxed shadow-inner"
          />
          <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
            <span>
              Dynamic tokens:{" "}
              <code className="text-primary font-mono">&#123;&#123;candidate_name&#125;&#125;</code>
              , <code className="text-primary font-mono">&#123;&#123;job_title&#125;&#125;</code>,{" "}
              <code className="text-primary font-mono">&#123;&#123;company_name&#125;&#125;</code>
            </span>
            <span className="font-mono">
              {(value.prompt || "").length} characters · ~
              {Math.ceil((value.prompt || "").length / 4)} tokens
            </span>
          </div>
        </div>

        <div className="flex justify-between pt-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setActiveNavTab("voice")}
            className="gap-1 text-xs"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Back: Voice & Audio
          </Button>
          <Button size="sm" onClick={() => setActiveNavTab("greeting")} className="gap-1 text-xs">
            Next: Opening Greeting <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* ── Section 3: Opening Greeting & Call Controls ── */}
      <div
        className={cn(
          "space-y-4",
          activeNavTab !== "greeting" &&
            activeNavTab !== "duration" &&
            activeNavTab !== "all" &&
            "hidden",
        )}
      >
        {/* First Message Greeting */}
        <div className="rounded-xl border border-border/90 bg-card/80 p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Mic className="h-4 w-4 text-emerald-500" />
              Agent Greeting (First Spoken Message)
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={previewGreetingAudio}
                className="h-7 text-[11px] gap-1 px-2 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 cursor-pointer"
                title="Preview greeting spoken aloud"
              >
                <Volume2 className="h-3 w-3" />
                Audition Greeting
              </Button>
              {VARIABLE_PILLS.map((p) => (
                <button
                  key={p.token}
                  type="button"
                  onClick={() => insertVariable("first_message", p.token)}
                  className="rounded-md bg-muted/80 px-2 py-0.5 text-[10px] font-mono text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer border border-border/60"
                  title={`Insert ${p.token}`}
                >
                  +{p.label}
                </button>
              ))}
            </div>
          </div>
          <Textarea
            rows={3}
            value={value.first_message || ""}
            onChange={(e) => onChange({ ...value, first_message: e.target.value })}
            placeholder="Hi {{candidate_name}}, this is the recruiting team at ScalePods..."
            className="text-xs bg-background leading-relaxed shadow-inner"
          />
          <p className="text-[11px] text-muted-foreground">
            Spoken immediately when candidate picks up the phone. Keep it natural, warm, and concise
            (under 20 seconds).
          </p>
        </div>

        {/* Duration & Voicemail Handling */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border/80 bg-card/80 p-3.5 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-amber-500" />
                Maximum Call Duration
              </span>
              <span className="font-mono text-amber-500 font-bold">
                {Math.round((value.max_duration_seconds || 300) / 60)} minutes
              </span>
            </div>
            <input
              type="range"
              min="60"
              max="1800"
              step="60"
              value={value.max_duration_seconds || 300}
              onChange={(e) =>
                onChange({ ...value, max_duration_seconds: parseInt(e.target.value, 10) })
              }
              className="w-full accent-amber-500 cursor-pointer"
            />
            <p className="text-[11px] text-muted-foreground">
              Maximum call cap before safe wrap-up and hangup.
            </p>
          </div>

          <div className="rounded-xl border border-border/80 bg-card/80 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">
                Voicemail Detection & Handling
              </span>
              <input
                type="checkbox"
                checked={value.voicemail_detection ?? true}
                onChange={(e) => onChange({ ...value, voicemail_detection: e.target.checked })}
                className="h-4 w-4 accent-primary rounded cursor-pointer"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="hangup_voicemail"
                checked={value.hangup_on_voicemail ?? false}
                onChange={(e) => onChange({ ...value, hangup_on_voicemail: e.target.checked })}
                className="h-3.5 w-3.5 accent-primary rounded cursor-pointer"
              />
              <label
                htmlFor="hangup_voicemail"
                className="text-[11px] text-muted-foreground cursor-pointer"
              >
                Hang up immediately if answering machine is detected
              </label>
            </div>
          </div>
        </div>

        {/* DialNexa Post-Call Structured Extraction Fields */}
        <div className="rounded-xl border border-border/80 bg-card/80 p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
              DialNexa Post-Call Analysis Extraction Schema ({postCallList.length} Fields)
            </span>
            <Badge variant="outline" className="text-[10px] font-mono">
              Auto-Extracted Post Call
            </Badge>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {postCallList.map((f) => (
              <span
                key={f.field_name}
                className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] font-mono text-muted-foreground border border-border/50"
              >
                <span className="font-semibold text-foreground">{f.field_name}</span>
                <span className="text-[10px] text-primary">({f.field_type})</span>
              </span>
            ))}
          </div>
        </div>

        <div className="flex justify-between pt-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setActiveNavTab("prompt")}
            className="gap-1 text-xs"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Back: System Prompt
          </Button>
          <Button size="sm" onClick={() => setActiveNavTab("eagerness")} className="gap-1 text-xs">
            Next: Eagerness & Latency <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* ── Section 4: Turn-Taking & Response Eagerness ── */}
      <div
        className={cn(
          "space-y-4",
          activeNavTab !== "eagerness" && activeNavTab !== "all" && "hidden",
        )}
      >
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400">
                <Flame className="h-4 w-4" />
              </div>
              <div>
                <h5 className="text-sm font-semibold text-foreground">
                  DialNexa Turn-Taking & Response Eagerness
                </h5>
                <p className="text-xs text-muted-foreground">
                  Controls how eagerly the AI replies to candidate speech. Shaves conversational
                  latency and prevents awkward pauses.
                </p>
              </div>
            </div>
            <Badge
              variant="outline"
              className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 font-mono text-xs"
            >
              {currentEagerness >= 0.85
                ? "Ultra-Eager (Fast)"
                : currentEagerness >= 0.65
                  ? "Conversational (Balanced)"
                  : "Patient (Deliberate)"}
            </Badge>
          </div>

          {/* Quick Presets */}
          <div className="flex flex-wrap gap-2">
            {[
              {
                label: "Ultra-Eager (0.95)",
                val: 0.95,
                desc: "Near-zero pause, interrupts naturally",
              },
              { label: "Fast (0.85)", val: 0.85, desc: "Great for rapid-fire screening" },
              { label: "Conversational (0.70)", val: 0.7, desc: "Default balanced flow" },
              { label: "Patient (0.50)", val: 0.5, desc: "Allows candidate pauses to think" },
            ].map((p) => (
              <button
                key={p.val}
                type="button"
                onClick={() =>
                  onChange({
                    ...value,
                    response_eagerness: p.val,
                    responsiveness: Math.min(1.0, p.val + 0.1),
                  })
                }
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium border text-left transition-colors cursor-pointer",
                  Math.abs(currentEagerness - p.val) < 0.05
                    ? "bg-amber-500/20 text-amber-800 dark:text-amber-200 border-amber-500/50 font-semibold"
                    : "bg-background border-border/70 hover:bg-muted text-muted-foreground",
                )}
              >
                <div>{p.label}</div>
                <div className="text-[10px] text-muted-foreground">{p.desc}</div>
              </button>
            ))}
          </div>

          <div className="space-y-4 pt-2">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-semibold text-foreground">
                  Response Eagerness (Turn-Taking)
                </span>
                <span className="font-mono text-amber-600 dark:text-amber-400 font-bold">
                  {(currentEagerness * 100).toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={currentEagerness}
                onChange={(e) =>
                  onChange({ ...value, response_eagerness: parseFloat(e.target.value) })
                }
                className="w-full accent-amber-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>0.1 (Wait for complete silence)</span>
                <span>0.7 (Default)</span>
                <span>1.0 (Jump in immediately)</span>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-semibold text-foreground">Responsiveness</span>
                <span className="font-mono text-amber-600 dark:text-amber-400 font-bold">
                  {(currentResponsiveness * 100).toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={currentResponsiveness}
                onChange={(e) => onChange({ ...value, responsiveness: parseFloat(e.target.value) })}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-semibold text-foreground">
                  Interruption Sensitivity (Candidate cut-off)
                </span>
                <span className="font-mono text-amber-600 dark:text-amber-400 font-bold">
                  {(currentInterruption * 100).toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min="0.0"
                max="1.0"
                step="0.05"
                value={currentInterruption}
                onChange={(e) =>
                  onChange({ ...value, interruption_sensitivity: parseFloat(e.target.value) })
                }
                className="w-full accent-amber-500 cursor-pointer"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Higher sensitivity allows candidate to speak over the AI and stop its voice
                instantly.
              </p>
            </div>

            <div className="pt-2 border-t border-amber-500/20 flex flex-wrap gap-4 text-xs">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={value.backchanneling ?? true}
                  onChange={(e) => onChange({ ...value, backchanneling: e.target.checked })}
                  className="h-4 w-4 accent-amber-500 rounded"
                />
                <span className="font-medium text-foreground">
                  Backchanneling (&ldquo;mm-hmm&rdquo;, &ldquo;got it&rdquo;)
                </span>
              </label>

              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="rounded bg-muted px-2 py-0.5 font-mono text-[11px]">
                  Nudge: {value.reminder_message_interval ?? 10}s
                </span>
                <span className="rounded bg-muted px-2 py-0.5 font-mono text-[11px]">
                  Hangup: {value.end_call_on_silence_sec ?? 20}s
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-between pt-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setActiveNavTab("greeting")}
            className="gap-1 text-xs"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Back: Opening Greeting
          </Button>
          <Button size="sm" onClick={() => setActiveNavTab("functions")} className="gap-1 text-xs">
            Next: Functions & Tools <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* ── Section 5: Functions & Tool Calling ── */}
      <div
        className={cn(
          "space-y-4",
          activeNavTab !== "functions" && activeNavTab !== "all" && "hidden",
        )}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/20 text-purple-600 dark:text-purple-400">
                <Zap className="h-4 w-4" />
              </div>
              <div>
                <h5 className="text-sm font-semibold text-foreground">
                  DialNexa Agent Functions & Live Tools
                </h5>
                <p className="text-xs text-muted-foreground">
                  Empower the AI to trigger real actions during candidate calls: warm recruiter
                  transfers, calendar scheduling, and wrap-ups.
                </p>
              </div>
            </div>
            <Badge
              variant="outline"
              className="bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30 font-mono text-xs"
            >
              {functionsList.filter((f) => f.enabled).length} Active Tools
            </Badge>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {/* End Call Function */}
            <div className="rounded-xl border border-border/80 bg-card/80 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <PhoneOff className="h-3.5 w-3.5 text-rose-500" />
                  End Call (`end_call`)
                </span>
                <input
                  type="checkbox"
                  checked={functionsList.find((f) => f.type === "end_call")?.enabled ?? true}
                  onChange={() => toggleFunction("end_call")}
                  className="h-4 w-4 accent-primary rounded cursor-pointer"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Hangs up politely once the candidate interview is finished or caller asks to leave.
              </p>
            </div>

            {/* Call Transfer Function */}
            <div className="rounded-xl border border-border/80 bg-card/80 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <PhoneForwarded className="h-3.5 w-3.5 text-cyan-500" />
                  Warm Recruiter Transfer (`call_transfer`)
                </span>
                <input
                  type="checkbox"
                  checked={functionsList.find((f) => f.type === "call_transfer")?.enabled ?? false}
                  onChange={() => toggleFunction("call_transfer")}
                  className="h-4 w-4 accent-primary rounded cursor-pointer"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Bridges the active telephone call to a live recruiter if the candidate is VIP.
              </p>
              {functionsList.find((f) => f.type === "call_transfer")?.enabled && (
                <Input
                  placeholder="Transfer Phone (e.g. +91 98765 00000)"
                  value={
                    (
                      functionsList.find((f) => f.type === "call_transfer")?.config as {
                        transfer_phone_number?: string;
                      }
                    )?.transfer_phone_number || ""
                  }
                  onChange={(e) =>
                    updateFunctionConfig("call_transfer", {
                      transfer_phone_number: e.target.value,
                    })
                  }
                  className="h-8 text-xs font-mono bg-background"
                />
              )}
            </div>

            {/* Calendar Scheduling Function */}
            <div className="rounded-xl border border-border/80 bg-card/80 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-purple-500" />
                  Check Calendar (`check_calendar_availability`)
                </span>
                <input
                  type="checkbox"
                  checked={
                    functionsList.find((f) => f.type === "check_calendar_availability")?.enabled ??
                    true
                  }
                  onChange={() => toggleFunction("check_calendar_availability")}
                  className="h-4 w-4 accent-primary rounded cursor-pointer"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Inquires live open calendar slots to schedule round 2 directly on the phone call.
              </p>
            </div>

            {/* Book Calendar Slot Function */}
            <div className="rounded-xl border border-border/80 bg-card/80 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-emerald-500" />
                  Book Interview Slot (`book_calendar`)
                </span>
                <input
                  type="checkbox"
                  checked={functionsList.find((f) => f.type === "book_calendar")?.enabled ?? false}
                  onChange={() => toggleFunction("book_calendar")}
                  className="h-4 w-4 accent-primary rounded cursor-pointer"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Locks in an agreed date/time slot directly into the hiring team&apos;s calendar
                before hanging up.
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-between pt-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setActiveNavTab("eagerness")}
            className="gap-1 text-xs"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Back: Eagerness & Latency
          </Button>
          <Button size="sm" onClick={() => setActiveNavTab("stt")} className="gap-1 text-xs">
            Next: STT & Boost <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* ── Section 6: Speech-to-Text & Transcriber ── */}
      <div
        className={cn("space-y-4", activeNavTab !== "stt" && activeNavTab !== "all" && "hidden")}
      >
        <div className="rounded-xl border border-border/80 bg-card/80 p-4 space-y-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Cpu className="h-4 w-4 text-cyan-500" />
              DialNexa Real-Time Transcriber (STT) & Vocabulary Biasing
            </span>
            <Badge variant="outline" className="text-[10px] font-mono">
              Deepgram Nova 2
            </Badge>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <label htmlFor="stt-selector" className="text-[11px] font-medium text-foreground">
                Primary Transcriber Engine
              </label>
              <Select
                value={currentTranscriber}
                onValueChange={(val) => onChange({ ...value, transcriber_id: val })}
              >
                <SelectTrigger id="stt-selector" className="h-9 bg-background text-xs">
                  <span>
                    {selectedTranscriberMeta?.label || currentTranscriber} ·{" "}
                    {selectedTranscriberMeta?.badge}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {DIALNEXA_TRANSCRIBERS.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-xs font-medium">{t.label}</span>
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {t.badge}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="dialnexa-boosted-terms"
                className="text-[11px] font-medium text-foreground"
              >
                Boosted Keywords (Specialized Tech & Terms)
              </label>
              <Textarea
                id="dialnexa-boosted-terms"
                rows={3}
                value={value.boosted_keywords ?? DEFAULT_BOOSTED_KEYWORDS}
                onChange={(e) => onChange({ ...value, boosted_keywords: e.target.value })}
                className="text-xs bg-background font-mono leading-relaxed"
                placeholder="Comma-separated words: React, TypeScript, Kafka, Docker..."
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <div>
                <p className="text-xs font-medium text-foreground">Boost Dynamic Variables</p>
                <p className="text-[11px] text-muted-foreground">
                  Inject candidate and role names into STT bias
                </p>
              </div>
              <input
                type="checkbox"
                checked={value.boost_dynamic_variables ?? true}
                onChange={(e) => onChange({ ...value, boost_dynamic_variables: e.target.checked })}
                className="h-4 w-4 accent-primary rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-foreground">Predictive Preprocessing</p>
                <p className="text-[11px] text-muted-foreground">
                  Speculative LLM inference (cuts 200ms latency)
                </p>
              </div>
              <input
                type="checkbox"
                checked={value.predictive_preprocessing_enabled ?? true}
                onChange={(e) =>
                  onChange({ ...value, predictive_preprocessing_enabled: e.target.checked })
                }
                className="h-4 w-4 accent-primary rounded cursor-pointer"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-between pt-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setActiveNavTab("functions")}
            className="gap-1 text-xs"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Back: Functions & Tools
          </Button>
          <Button size="sm" onClick={() => setActiveNavTab("test")} className="gap-1 text-xs">
            Next: Live Test Console <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* ── Section 7: Live Test Console (Interactive Simulator & Real Outbound Call) ── */}
      <div
        className={cn("space-y-4", activeNavTab !== "test" && activeNavTab !== "all" && "hidden")}
      >
        <div className="rounded-xl border border-emerald-500/40 bg-gradient-to-b from-emerald-500/10 via-card to-card p-4 space-y-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-xs">
                <Activity className="h-5 w-5" />
              </div>
              <div>
                <h5 className="text-sm font-semibold text-foreground">
                  DialNexa Interactive Agent Testing Console
                </h5>
                <p className="text-xs text-muted-foreground">
                  Simulate in-browser or dispatch a live telephone call to your mobile with your
                  custom prompt.
                </p>
              </div>
            </div>

            {/* Mode Switcher */}
            <div className="inline-flex rounded-lg border border-border/80 bg-background/60 p-0.5">
              <button
                type="button"
                onClick={() => setTestMode("simulator")}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium transition-colors cursor-pointer",
                  testMode === "simulator"
                    ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Web Simulator
              </button>
              <button
                type="button"
                onClick={() => setTestMode("phone")}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium transition-colors cursor-pointer",
                  testMode === "phone"
                    ? "bg-emerald-600 text-white font-semibold shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Live Phone Call Test
              </button>
            </div>
          </div>

          {/* Mode 1: Web Simulator */}
          {testMode === "simulator" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Candidate Name"
                    value={testCandidateName}
                    onChange={(e) => setTestCandidateName(e.target.value)}
                    className="h-8 w-44 text-xs bg-background"
                  />
                  <Badge variant="outline" className="text-[11px] font-mono">
                    Voice: {selectedVoiceMeta?.label || value.voice}
                  </Badge>
                </div>

                {!simActive ? (
                  <Button
                    size="sm"
                    onClick={startSimulator}
                    className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    Start Test Conversation
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={endSimulator}
                    className="gap-1.5 text-xs font-semibold cursor-pointer"
                  >
                    <Square className="h-3.5 w-3.5 fill-current" />
                    End Call Simulation
                  </Button>
                )}
              </div>

              {/* Chat Simulation Feed */}
              <div className="h-64 overflow-y-auto rounded-xl border border-border/80 bg-background/80 p-3 space-y-2.5">
                {simMessages.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center text-center p-6 text-muted-foreground">
                    <Bot className="h-8 w-8 mb-2 text-muted-foreground/50" />
                    <p className="text-xs font-medium">Testing session idle</p>
                    <p className="text-[11px] mt-1 max-w-sm">
                      Click &ldquo;Start Test Conversation&rdquo; to simulate how DialNexa conducts
                      the preliminary voice interview with &ldquo;{testCandidateName}&rdquo;.
                    </p>
                  </div>
                ) : (
                  simMessages.map((m) => (
                    <div
                      key={m.id}
                      className={cn(
                        "flex flex-col text-xs space-y-0.5",
                        m.sender === "candidate"
                          ? "items-end"
                          : m.sender === "agent"
                            ? "items-start"
                            : "items-center",
                      )}
                    >
                      {m.sender === "system" ? (
                        <div className="rounded-full bg-muted/80 px-2.5 py-0.5 text-[10px] font-mono text-muted-foreground border border-border/50">
                          {m.text}
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground px-1">
                            <span className="font-semibold">
                              {m.sender === "candidate"
                                ? testCandidateName
                                : "ScalePods Voice Agent"}
                            </span>
                            <span>· {m.time}</span>
                            {m.fnTrigger && (
                              <span className="rounded bg-purple-500/20 text-purple-600 dark:text-purple-400 px-1 py-0 font-mono text-[9px] border border-purple-500/30">
                                tool:{m.fnTrigger}
                              </span>
                            )}
                          </div>
                          <div
                            className={cn(
                              "rounded-2xl px-3 py-2 max-w-[82%] leading-relaxed",
                              m.sender === "candidate"
                                ? "bg-primary text-primary-foreground rounded-br-xs shadow-xs"
                                : "bg-card border border-border/80 text-foreground rounded-bl-xs shadow-xs",
                            )}
                          >
                            {m.text}
                          </div>
                        </>
                      )}
                    </div>
                  ))
                )}
                {isAgentThinking && (
                  <div className="flex items-center gap-1.5 text-muted-foreground text-xs italic py-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" />
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:0.15s]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:0.3s]" />
                    <span className="text-[11px]">
                      DialNexa agent synthesizing reply (pacing:{" "}
                      {Math.round((1 - currentEagerness) * 1100 + 300)}ms)…
                    </span>
                  </div>
                )}
              </div>

              {/* Simulation Candidate Input */}
              {simActive && (
                <div className="flex gap-2">
                  <Input
                    placeholder="Type candidate answer (e.g. 'I have 5 years with React and TypeScript', or 'Can you transfer me to a recruiter?')..."
                    value={candidateInput}
                    onChange={(e) => setCandidateInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") sendCandidateMessage();
                    }}
                    className="h-10 text-xs bg-background"
                  />
                  <Button size="sm" onClick={sendCandidateMessage} className="gap-1 text-xs">
                    <Send className="h-3.5 w-3.5" /> Send
                  </Button>
                </div>
              )}

              {/* Post-Call Analysis Output Preview */}
              {simScorecard && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4" />
                      Simulated DialNexa Post-Call Analysis Scorecard
                    </span>
                    <Badge
                      variant="outline"
                      className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[10px]"
                    >
                      Extracted
                    </Badge>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 text-xs">
                    <div className="p-2 rounded bg-card/60 border border-border/60">
                      <span className="text-[10px] text-muted-foreground uppercase">
                        Recommendation
                      </span>
                      <p className="font-semibold text-emerald-600 dark:text-emerald-400">
                        {simScorecard.overall_recommendation}
                      </p>
                    </div>
                    <div className="p-2 rounded bg-card/60 border border-border/60">
                      <span className="text-[10px] text-muted-foreground uppercase">
                        Technical Qualification Score
                      </span>
                      <p className="font-semibold text-foreground">
                        {simScorecard.technical_qualification_score} / 10
                      </p>
                    </div>
                    <div className="p-2 rounded bg-card/60 border border-border/60">
                      <span className="text-[10px] text-muted-foreground uppercase">
                        Notice Period
                      </span>
                      <p className="font-semibold text-foreground">
                        {simScorecard.notice_period_days} Days
                      </p>
                    </div>
                    <div className="p-2 rounded bg-card/60 border border-border/60">
                      <span className="text-[10px] text-muted-foreground uppercase">
                        Candidate Interest
                      </span>
                      <p className="font-semibold text-foreground">
                        {simScorecard.candidate_interest_level}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Mode 2: Live Phone Call Test */}
          {testMode === "phone" && (
            <div className="space-y-3 rounded-xl border border-border/80 bg-card/80 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <PhoneCall className="h-4 w-4 text-emerald-500" />
                Trigger Live Telephony Call to Your Phone
              </div>
              <p className="text-xs text-muted-foreground">
                DialNexa will initiate an actual outbound telephone call to your mobile number with
                your current agent prompt, voice, eagerness, and tools.
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label htmlFor="test-phone-input" className="text-xs font-medium text-foreground">
                    Your Mobile Number (with country code)
                  </label>
                  <Input
                    id="test-phone-input"
                    placeholder="+91 98765 43210"
                    value={testPhoneNumber}
                    onChange={(e) => setTestPhoneNumber(e.target.value)}
                    className="h-10 text-xs font-mono bg-background"
                  />
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="test-cand-name-input"
                    className="text-xs font-medium text-foreground"
                  >
                    Test Candidate Name
                  </label>
                  <Input
                    id="test-cand-name-input"
                    placeholder="Alex Morgan"
                    value={testCandidateName}
                    onChange={(e) => setTestCandidateName(e.target.value)}
                    className="h-10 text-xs bg-background"
                  />
                </div>
              </div>

              {callError && (
                <div className="flex items-center gap-2 rounded-lg bg-rose-500/10 border border-rose-500/20 p-2.5 text-xs text-rose-600 dark:text-rose-400">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>
                    {typeof callError === "string"
                      ? callError
                      : typeof (callError as { message?: string }).message === "string"
                        ? (callError as { message: string }).message
                        : JSON.stringify(callError)}
                  </span>
                </div>
              )}

              {phoneCallStatus && (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2.5 text-xs text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                  <span>
                    {phoneCallStatus}
                    {phoneCallId && (
                      <span className="ml-1.5 font-mono text-[11px] underline">
                        (Tracking ID: {phoneCallId})
                      </span>
                    )}
                  </span>
                </div>
              )}

              <Button
                onClick={dispatchRealPhoneCall}
                disabled={isDispatchingCall}
                className="gap-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer"
              >
                {isDispatchingCall ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Dialing Telephony Carrier…</span>
                  </>
                ) : (
                  <>
                    <PhoneCall className="h-3.5 w-3.5" />
                    <span>Call My Phone Now</span>
                  </>
                )}
              </Button>

              {/* Live Test Call Telemetry, Recording & Transcript Viewer */}
              {(phoneCallId || testCallResult) && (
                <div className="space-y-3.5 pt-4 border-t border-border/70">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Activity className="h-4 w-4 text-emerald-500" />
                        Call Telemetry
                      </span>
                      {testCallResult?.status ? (
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-mono capitalize",
                            testCallResult.status === "completed"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                              : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
                          )}
                        >
                          {testCallResult.status}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px] font-mono"
                        >
                          Calling…
                        </Badge>
                      )}
                      {testCallResult?.duration != null && testCallResult.duration > 0 && (
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1 font-mono">
                          <Clock className="h-3 w-3" /> {testCallResult.duration}s
                        </span>
                      )}
                      {testCallResult?.sentiment && (
                        <Badge variant="outline" className="text-[10px] capitalize">
                          Sentiment: {testCallResult.sentiment}
                        </Badge>
                      )}
                    </div>

                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => fetchCallStatus(phoneCallId, testPhoneNumber)}
                      disabled={isPollingCall}
                      className="h-7 text-xs gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className={cn("h-3 w-3", isPollingCall && "animate-spin")} />
                      <span>
                        {isPollingCall ? "Fetching Audio..." : "Refresh Recording & Transcript"}
                      </span>
                    </Button>
                  </div>

                  {/* Audio Recording Player */}
                  {testCallResult?.recording_url ? (
                    <div className="space-y-2 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                          <Headphones className="h-4 w-4 text-cyan-500" />
                          Call Audio Recording
                        </span>
                        <a
                          href={testCallResult.recording_url}
                          target="_blank"
                          rel="noreferrer"
                          download
                          className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
                        >
                          Download MP3 <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                      <audio
                        controls
                        src={testCallResult.recording_url}
                        className="w-full h-8 rounded-md bg-muted/60"
                      >
                        <track kind="captions" />
                      </audio>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 rounded-lg bg-muted/30 border border-border/50 p-2.5 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      <span>
                        {testCallResult?.duration && testCallResult.duration > 0
                          ? "Call finished! Processing and uploading audio recording to cloud storage…"
                          : "Call in progress. Once you hang up, the recording player and AI transcript will appear here automatically."}
                      </span>
                    </div>
                  )}

                  {/* Turn-by-Turn Dialogue Transcript */}
                  {testCallResult?.turns && testCallResult.turns.length > 0 ? (
                    <div className="space-y-2 rounded-xl border border-border/80 bg-muted/20 p-3.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                          <MessageSquareText className="h-4 w-4 text-primary" />
                          Turn-by-Turn Dialogue Transcript ({testCallResult.turns.length} turns)
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[10px] bg-primary/10 text-primary border-primary/20"
                        >
                          AI Diarized
                        </Badge>
                      </div>
                      <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                        {testCallResult.turns.map((turn) => (
                          <div
                            key={`test-turn-${turn.speaker}-${turn.start}-${turn.end}`}
                            className={cn(
                              "flex flex-col text-xs space-y-1",
                              turn.speaker === "candidate" ? "items-end" : "items-start",
                            )}
                          >
                            <span className="text-[10px] text-muted-foreground px-1 font-medium">
                              {turn.speaker === "candidate"
                                ? testCandidateName || "Candidate"
                                : "AI Talent Partner"}{" "}
                              · {turn.start.toFixed(1)}s
                            </span>
                            <div
                              className={cn(
                                "rounded-xl px-3.5 py-2 max-w-[85%] text-xs leading-relaxed shadow-2xs",
                                turn.speaker === "candidate"
                                  ? "bg-primary text-primary-foreground rounded-br-xs"
                                  : "bg-card border border-border/80 text-foreground rounded-bl-xs",
                              )}
                            >
                              {turn.text}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : testCallResult?.transcript ? (
                    <div className="space-y-2 rounded-xl border border-border/80 bg-muted/20 p-3.5">
                      <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <FileText className="h-4 w-4 text-primary" />
                        Call Transcript
                      </span>
                      <div className="rounded-lg border border-border/60 bg-background/60 p-3 font-mono text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap max-h-60 overflow-y-auto">
                        {testCallResult.transcript}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-between items-center pt-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setActiveNavTab("stt")}
            className="gap-1 text-xs"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Back: STT & Boost
          </Button>
          <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            <CheckCircle2 className="h-4 w-4" />
            <span>Voice Agent Ready for Campaign</span>
          </div>
        </div>
      </div>
    </div>
  );
}
