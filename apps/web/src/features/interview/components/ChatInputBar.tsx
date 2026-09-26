import React, { useState, useEffect } from 'react';
import { Mic, MicOff, Send, Brain, Loader2 } from 'lucide-react';
import type { AnswerRecorderState } from './AnswerRecorder';

interface ChatInputBarProps {
  recorderState: AnswerRecorderState;
  isAiSpeaking: boolean;
  isGeneratingTurn: boolean;
  isAnalyzingAnswer: boolean;
  onManualSubmit: (overrideText?: string) => void;
  onSkipSpeaking?: () => void;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

const SILENCE_TIMEOUT_SEC = 7;

export function ChatInputBar({
  recorderState,
  isAiSpeaking,
  isGeneratingTurn,
  isAnalyzingAnswer,
  onManualSubmit,
  onSkipSpeaking,
  canvasRef,
}: ChatInputBarProps) {
  const {
    transcript,
    isThinking,
    silenceCountdown,
    countdownTenths,
    thinkingCountdown,
    thinkingCountdownTenths,
    isRecording,
  } = recorderState;

  const [typedText, setTypedText] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  // Sync spoken transcript into input when candidate is speaking and not actively editing
  React.useEffect(() => {
    if (transcript && !isEditing) {
      setTypedText(transcript);
    }
  }, [transcript, isEditing]);

  // When AI speaks (new question or acknowledgment), reset input state
  React.useEffect(() => {
    if (isAiSpeaking) {
      setTypedText('');
      setIsEditing(false);
    }
  }, [isAiSpeaking]);

  const effectiveText = isEditing ? typedText : (typedText || transcript);

  const secondsLeft = (silenceCountdown / 10).toFixed(1);
  const countdownPct = countdownTenths > 0 ? silenceCountdown / countdownTenths : 0;
  const thinkingSecondsLeft = (thinkingCountdown / 10).toFixed(1);
  const thinkingPct = (thinkingCountdownTenths || 350) > 0 ? thinkingCountdown / (thinkingCountdownTenths || 350) : 0;

  /* ─── Placeholder states ─────────────────────────────────────── */
  if (isAiSpeaking) {
    return (
      <div className="chat-input-bar">
        <div className="chat-input-inner" style={{ justifyContent: 'space-between', padding: '0.4rem 0.75rem' }}>
          <div className="flex items-center gap-2.5">
            <div className="flex items-end gap-[3px] h-4">
              {[0, 1, 2, 3].map(i => (
                <span
                  key={i}
                  className="bubble-speaking-bar"
                  style={{
                    height: `${[55, 100, 75, 45][i]}%`,
                    animationDelay: `${i * 0.12}s`,
                    background: 'var(--blue)',
                  }}
                />
              ))}
            </div>
            <span className="text-sm font-medium" style={{ color: 'var(--label-secondary)' }}>
              Alex is speaking…
            </span>
          </div>

          {onSkipSpeaking && (
            <button
              onClick={onSkipSpeaking}
              className="text-xs px-3 py-1.5 rounded-lg font-medium transition active:scale-95 flex items-center gap-1"
              style={{
                background: 'rgba(59, 130, 246, 0.18)',
                border: '1px solid rgba(59, 130, 246, 0.4)',
                color: '#60a5fa',
              }}
              title="Skip question audio and start answering immediately"
            >
              <span>Answer now</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  if (isGeneratingTurn || isAnalyzingAnswer) {
    return (
      <div className="chat-input-bar">
        <div className="chat-input-inner" style={{ justifyContent: 'center', opacity: 0.8 }}>
          <Loader2 size={14} className="animate-spin" style={{ color: 'var(--blue)' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--label-secondary)' }}>
            {isAnalyzingAnswer ? 'Analysing your response…' : 'Preparing next question…'}
          </span>
        </div>
      </div>
    );
  }

  /* ─── Active recording bar ───────────────────────────────────── */
  const showCountdown = !isThinking && (effectiveText.trim().length > 0 || transcript.trim().length > 0);
  const hasText = effectiveText.trim().length > 0 || transcript.trim().length > 0;

  const handleSend = () => {
    const textToSubmit = effectiveText.trim() || transcript.trim();
    onManualSubmit(textToSubmit || undefined);
    setTypedText('');
    setIsEditing(false);
  };

  return (
    <div className="chat-input-bar">
      <div className="chat-input-inner">
        {/* Mic icon / thinking indicator */}
        <div className="shrink-0 flex items-center justify-center mt-0.5" style={{ width: 28, height: 28 }}>
          {isThinking ? (
            <Brain size={16} className="animate-pulse" style={{ color: 'var(--orange)' }} />
          ) : isRecording ? (
            <Mic size={16} className="animate-pulse" style={{ color: 'var(--green)' }} />
          ) : (
            <MicOff size={16} style={{ color: 'var(--label-tertiary)' }} />
          )}
        </div>

        {/* Waveform canvas */}
        <canvas
          ref={canvasRef}
          width={200}
          height={36}
          className="rounded-lg shrink-0 mt-0.5"
          style={{
            width: 70,
            height: 32,
            background: 'rgba(255,255,255,0.06)',
            display: isRecording ? 'block' : 'none',
          }}
        />

        {/* Live transcript or typed answer — candidate can speak or edit/type freely */}
        <div className="flex-1 min-w-0 px-1.5 flex items-center">
          <input
            type="text"
            value={effectiveText}
            onChange={(e) => {
              setIsEditing(true);
              setTypedText(e.target.value);
            }}
            onFocus={() => {
              if (!typedText && transcript) {
                setTypedText(transcript);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={
              isThinking
                ? "Start speaking (mic active) or type your answer…"
                : "Speak your response or type here (Enter to submit)…"
            }
            className="w-full bg-transparent text-sm font-medium outline-none transition"
            style={{
              color: 'var(--label-primary)',
            }}
          />
        </div>

        {/* Silence countdown */}
        {showCountdown && (
          <div className="shrink-0 flex items-center gap-1.5 mt-0.5" title="Auto-submits after silence">
            <svg width={20} height={20} viewBox="0 0 20 20" className="transform -rotate-90">
              <circle cx={10} cy={10} r={8} fill="none" stroke="var(--fill-tertiary)" strokeWidth={2.5} />
              <circle
                cx={10}
                cy={10}
                r={8}
                fill="none"
                stroke={countdownPct < 0.2 ? 'var(--red)' : countdownPct < 0.45 ? 'var(--orange)' : 'var(--blue)'}
                strokeWidth={2.5}
                strokeDasharray={`${countdownPct * 50.27} 50.27`}
                strokeLinecap="round"
                style={{ transition: 'stroke-dasharray 0.1s linear, stroke 0.3s' }}
              />
            </svg>
            <span
              className="text-[10px] font-mono font-bold"
              style={{
                color: countdownPct < 0.2 ? 'var(--red)' : countdownPct < 0.45 ? 'var(--orange)' : 'var(--label-secondary)',
              }}
            >
              {secondsLeft}s
            </span>
          </div>
        )}

        {isThinking && (
          <div className="shrink-0 flex items-center gap-1.5 mt-0.5" title="Thinking time remaining">
            <svg width={20} height={20} viewBox="0 0 20 20" className="transform -rotate-90">
              <circle cx={10} cy={10} r={8} fill="none" stroke="var(--fill-tertiary)" strokeWidth={2.5} />
              <circle
                cx={10}
                cy={10}
                r={8}
                fill="none"
                stroke={thinkingPct < 0.25 ? 'var(--red)' : 'var(--orange)'}
                strokeWidth={2.5}
                strokeDasharray={`${thinkingPct * 50.27} 50.27`}
                strokeLinecap="round"
                style={{ transition: 'stroke-dasharray 0.1s linear, stroke 0.3s' }}
              />
            </svg>
            <span
              className="text-[10px] font-mono font-bold"
              style={{ color: thinkingPct < 0.25 ? 'var(--red)' : 'var(--orange)' }}
            >
              {thinkingSecondsLeft}s
            </span>
          </div>
        )}

        {/* Submit button */}
        {(() => {
          const canSubmit = isRecording || isThinking || hasText;
          return (
            <button
              onClick={handleSend}
              disabled={!canSubmit}
              className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 mt-0.5"
              style={{
                background: canSubmit ? 'var(--blue)' : 'var(--fill-tertiary)',
                color: canSubmit ? '#fff' : 'var(--label-quaternary)',
                cursor: canSubmit ? 'pointer' : 'not-allowed',
              }}
              title="Submit answer (Enter)"
            >
              <Send size={14} />
            </button>
          );
        })()}
      </div>

      <p className="text-center mt-1.5" style={{ fontSize: '0.65rem', color: 'var(--label-tertiary)' }}>
        {isThinking
          ? `Microphone active · Start speaking or typing · Auto-submits after ${SILENCE_TIMEOUT_SEC}s silence once spoken`
          : `Auto-submits after ${SILENCE_TIMEOUT_SEC}s silence · You can also press Enter or click Submit anytime`}
      </p>
    </div>
  );
}
