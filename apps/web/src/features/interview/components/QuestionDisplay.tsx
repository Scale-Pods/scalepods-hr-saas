import { Brain, Lightbulb, MessageSquare, Mic, Sparkles, Users, Volume2 } from "lucide-react";
import type { InterviewQuestion } from "../types";

interface QuestionDisplayProps {
  question: InterviewQuestion | null;
  questionNumber: number;
  totalQuestions: number;
  onSpeakQuestion?: (question: InterviewQuestion) => void;
  interviewerLeadIn?: string;
  interviewerUtterance?: string;
  isAiSpeaking?: boolean;
  speakingPhase?: "acknowledgment" | "question" | null;
}

const TYPE_CONFIG = {
  technical: {
    icon: Brain,
    label: "Technical",
    color: "#60a5fa",
    bg: "rgba(59, 130, 246, 0.15)",
    border: "rgba(59, 130, 246, 0.35)",
  },
  behavioral: {
    icon: Users,
    label: "Behavioral",
    color: "#4ade80",
    bg: "rgba(34, 197, 94, 0.15)",
    border: "rgba(34, 197, 94, 0.35)",
  },
  situational: {
    icon: Lightbulb,
    label: "Situational",
    color: "#c084fc",
    bg: "rgba(168, 85, 247, 0.15)",
    border: "rgba(168, 85, 247, 0.35)",
  },
  cultural: {
    icon: MessageSquare,
    label: "Cultural Fit",
    color: "#fb923c",
    bg: "rgba(249, 115, 22, 0.15)",
    border: "rgba(249, 115, 22, 0.35)",
  },
};

export function QuestionDisplay({
  question,
  questionNumber,
  totalQuestions,
  isAiSpeaking,
  speakingPhase,
}: QuestionDisplayProps) {
  if (!question) {
    return (
      <div
        className="w-full rounded-2xl p-6 text-center animate-fade-in"
        style={{
          background: "rgba(20, 24, 34, 0.95)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          color: "#94a3b8",
        }}
      >
        <div
          className="w-10 h-10 mx-auto mb-3 rounded-xl animate-pulse"
          style={{ background: "rgba(255, 255, 255, 0.08)" }}
        />
        <p className="text-sm font-medium">Preparing question...</p>
      </div>
    );
  }

  const config = TYPE_CONFIG[question.question_type] || TYPE_CONFIG.technical;
  const Icon = config.icon;
  const isQuestionSpeaking = isAiSpeaking && speakingPhase === "question";
  const isAckSpeaking = isAiSpeaking && speakingPhase === "acknowledgment";

  return (
    <div
      className="w-full rounded-2xl p-5 sm:p-6 transition-all duration-300 animate-fade-in shadow-2xl relative overflow-hidden"
      style={{
        background:
          "linear-gradient(180deg, rgba(26, 31, 46, 0.98) 0%, rgba(18, 22, 33, 0.98) 100%)",
        border: isQuestionSpeaking
          ? "1px solid rgba(168, 85, 247, 0.6)"
          : isAckSpeaking
            ? "1px solid rgba(245, 158, 11, 0.5)"
            : "1px solid rgba(255, 255, 255, 0.16)",
        boxShadow: isQuestionSpeaking
          ? "0 0 25px rgba(168, 85, 247, 0.2), 0 8px 32px rgba(0, 0, 0, 0.5)"
          : "0 8px 32px rgba(0, 0, 0, 0.45)",
      }}
    >
      {/* Top Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 mb-4 pb-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          {/* Question Counter Pill */}
          <span className="text-xs font-bold px-2.5 py-1 rounded-md bg-white/10 text-white tracking-wide border border-white/15">
            Question {Math.max(1, questionNumber)} of {Math.max(1, totalQuestions)}
          </span>

          {/* Category Pill */}
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold"
            style={{
              background: config.bg,
              border: `1px solid ${config.border}`,
              color: config.color,
            }}
          >
            <Icon size={13} style={{ color: config.color }} />
            <span>{config.label}</span>
          </div>

          {/* Follow-up Badge */}
          {question.source === "llm_ts_followup" && (
            <span
              className="text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider"
              style={{
                background: "rgba(168, 85, 247, 0.2)",
                color: "#c084fc",
                border: "1px solid rgba(168, 85, 247, 0.4)",
              }}
            >
              Follow-up
            </span>
          )}
        </div>

        {/* Real-time Status Badge */}
        <div className="flex items-center gap-2">
          {isQuestionSpeaking ? (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-purple-500/20 border border-purple-500/40 text-purple-300 animate-pulse">
              <Volume2 size={13} />
              <span>Alex is reading aloud…</span>
            </div>
          ) : isAckSpeaking ? (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/20 border border-amber-500/40 text-amber-300 animate-pulse">
              <Sparkles size={13} />
              <span>Alex is speaking…</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 border border-emerald-500/40 text-emerald-300">
              <Mic size={13} className="animate-pulse" />
              <span>Your turn to respond</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Question Text with guaranteed high contrast and crisp typography */}
      <div className="py-1">
        <p
          className="text-lg sm:text-xl lg:text-[1.35rem] leading-relaxed font-semibold text-white tracking-normal"
          style={{
            color: "#ffffff",
            textShadow: "0 1px 3px rgba(0, 0, 0, 0.4)",
          }}
        >
          {question.question_text}
        </p>
      </div>

      {/* Subtle bottom guide */}
      <div className="mt-3.5 pt-2.5 flex items-center justify-between text-[11px] text-gray-400 border-t border-white/5">
        <span>Speak naturally into your microphone or type your response below</span>
        <span className="text-gray-500 hidden sm:inline">Press Enter or click Submit anytime</span>
      </div>
    </div>
  );
}
