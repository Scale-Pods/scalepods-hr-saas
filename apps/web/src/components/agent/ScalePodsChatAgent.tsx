"use client";

import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  MessageCircle,
  RefreshCw,
  Send,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";
import type { AgentActionButton } from "@/features/agent/scalepodsKnowledge";
import { getScalePodsAnswer } from "@/features/agent/scalepodsKnowledge";

interface ChatMessage {
  id: string;
  sender: "user" | "bot";
  text: string;
  timestamp: string;
  suggestions?: string[];
  actionButtons?: AgentActionButton[];
}

interface ScalePodsChatAgentProps {
  position?: "right" | "left";
}

const INITIAL_SUGGESTIONS = [
  "Talk to a sales expert to find a plan",
  "Can I try for free first?",
  "What are the pricing plans?",
];

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: "welcome-1",
    sender: "bot",
    text: "Welcome to **ScalePods**! I'm your AI assistant. How can I help you today?",
    timestamp: "Just now",
    suggestions: INITIAL_SUGGESTIONS,
    actionButtons: [
      { label: "Create Free Account", href: "/auth?mode=signup" },
      { label: "Visit ScalePods.co", href: "https://www.scalepods.co", isExternal: true },
    ],
  },
];

export function ScalePodsChatAgent({ position = "right" }: ScalePodsChatAgentProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showGreetingCard, setShowGreetingCard] = useState(true);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [hasUnread, setHasUnread] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll when messages update
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isTyping, isOpen]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen) {
      setShowGreetingCard(false);
      setHasInteracted(true);
      setHasUnread(false);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
    }
  }, [isOpen]);

  // Subtle web audio chime on message receive
  const playChime = () => {
    if (!soundEnabled || typeof window === "undefined") return;
    try {
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.32);
    } catch {
      // AudioContext not allowed or unsupported
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend ?? inputValue).trim();
    if (!text || isTyping) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    setIsTyping(true);

    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: messages.map((m) => ({ sender: m.sender, text: m.text })),
        }),
      });

      let data: { reply: string; suggestions?: string[]; actionButtons?: AgentActionButton[] };
      if (res.ok) {
        data = await res.json();
      } else {
        data = getScalePodsAnswer(text);
      }

      setTimeout(() => {
        const botMsg: ChatMessage = {
          id: `bot-${Date.now()}`,
          sender: "bot",
          text: data.reply,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          suggestions: data.suggestions,
          actionButtons: data.actionButtons,
        };
        setMessages((prev) => [...prev, botMsg]);
        setIsTyping(false);
        playChime();
      }, 450);
    } catch {
      setTimeout(() => {
        const fallback = getScalePodsAnswer(text);
        const botMsg: ChatMessage = {
          id: `bot-${Date.now()}`,
          sender: "bot",
          text: fallback.reply,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          suggestions: fallback.suggestions,
          actionButtons: fallback.actionButtons,
        };
        setMessages((prev) => [...prev, botMsg]);
        setIsTyping(false);
        playChime();
      }, 450);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleResetChat = () => {
    setMessages(INITIAL_MESSAGES);
    inputRef.current?.focus();
  };

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Helper to format basic markdown (bold, lists, headings)
  const renderFormattedText = (raw: string) => {
    const lines = raw.split("\n");
    return lines.map((line, idx) => {
      if (!line.trim()) {
        return <div key={idx} className="h-2" />;
      }
      if (line.startsWith("### ")) {
        return (
          <h4 key={idx} className="font-bold text-sm sm:text-base mt-2 mb-1 text-slate-900 dark:text-white">
            {renderInlineMarkdown(line.replace("### ", ""))}
          </h4>
        );
      }
      if (line.startsWith("## ")) {
        return (
          <h3 key={idx} className="font-bold text-base mt-2 mb-1 text-slate-900 dark:text-white">
            {renderInlineMarkdown(line.replace("## ", ""))}
          </h3>
        );
      }
      if (line.trim().startsWith("- ") || line.trim().startsWith("• ")) {
        const bulletText = line.trim().substring(2);
        return (
          <div key={idx} className="flex items-start gap-2 my-1 text-xs sm:text-[13px] leading-relaxed">
            <span className="text-blue-500 font-bold shrink-0 mt-0.5">•</span>
            <span>{renderInlineMarkdown(bulletText)}</span>
          </div>
        );
      }
      const numMatch = line.trim().match(/^(\d+)\.\s+(.*)/);
      if (numMatch) {
        return (
          <div key={idx} className="flex items-start gap-2 my-1 text-xs sm:text-[13px] leading-relaxed">
            <span className="font-bold text-blue-500 shrink-0">{numMatch[1]}.</span>
            <span>{renderInlineMarkdown(numMatch[2])}</span>
          </div>
        );
      }
      return (
        <p key={idx} className="my-1 text-xs sm:text-[13px] leading-relaxed">
          {renderInlineMarkdown(line)}
        </p>
      );
    });
  };

  const renderInlineMarkdown = (text: string) => {
    const tokenRegex = /(\*\*\[.*?\]\(.*?\)\*\*|\[\*\*.*?\*\*\]\(.*?\)|\[.*?\]\(.*?\)|(?:\*\*.*?\*\*))/g;
    const parts = text.split(tokenRegex);
    return parts.map((part, i) => {
      // 1. Bold link: **[Text](url)** or [**Text**](url)
      const boldLinkMatch =
        part.match(/^\*\*\[(.*?)\]\((.*?)\)\*\*$/) ||
        part.match(/^\[\*\*(.*?)\*\*\]\((.*?)\)$/);
      if (boldLinkMatch) {
        const linkText = boldLinkMatch[1];
        const linkUrl = boldLinkMatch[2];
        const isExternal = linkUrl.startsWith("http");
        return (
          <a
            key={i}
            href={linkUrl}
            target={isExternal ? "_blank" : undefined}
            rel={isExternal ? "noopener noreferrer" : undefined}
            className="text-blue-600 dark:text-blue-400 font-bold underline decoration-blue-400/50 hover:decoration-blue-500 transition break-words"
          >
            {linkText}
          </a>
        );
      }

      // 2. Regular link: [Text](url)
      const linkMatch = part.match(/^\[(.*?)\]\((.*?)\)$/);
      if (linkMatch) {
        const linkText = linkMatch[1];
        const linkUrl = linkMatch[2];
        const isExternal = linkUrl.startsWith("http");
        return (
          <a
            key={i}
            href={linkUrl}
            target={isExternal ? "_blank" : undefined}
            rel={isExternal ? "noopener noreferrer" : undefined}
            className="text-blue-600 dark:text-blue-400 font-semibold underline decoration-blue-400/50 hover:decoration-blue-500 transition break-words"
          >
            {linkText}
          </a>
        );
      }

      // 3. Bold text: **Text**
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={i} className="font-semibold text-slate-900 dark:text-white">
            {part.slice(2, -2)}
          </strong>
        );
      }

      return part;
    });
  };

  const isRight = position === "right";

  return (
    <>
      {/* ── Fixed Position Container: Matches Screenshot ("lik this") ── */}
      <div
        className={`fixed ${
          isRight ? "right-5 sm:right-7 items-end" : "left-5 sm:left-7 items-start"
        } bottom-5 sm:bottom-7 z-[9999] flex flex-col select-none`}
      >
        {/* ── 1. Greeting Callout Card (Intercom/Signwell Style as in Screenshot) ── */}
        {!isOpen && showGreetingCard && (
          <div className="mb-2.5 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div
              onClick={() => setIsOpen(true)}
              className="group relative flex items-start gap-3 rounded-2xl border border-slate-200/90 bg-white/95 dark:border-slate-800 dark:bg-[#0E1628]/95 px-4 py-3.5 shadow-xl shadow-slate-900/10 dark:shadow-2xl dark:shadow-black/50 backdrop-blur-xl text-slate-800 dark:text-slate-100 max-w-[310px] sm:max-w-[340px] cursor-pointer hover:border-blue-400 dark:hover:border-blue-500/50 transition duration-200"
            >
              {/* ScalePods Logo Avatar Badge */}
              <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 p-1.5 shadow-sm">
                <Image
                  src="/brand/scalepods-logo.png"
                  alt="ScalePods"
                  width={24}
                  height={24}
                  className="h-auto w-full object-contain brightness-0 invert"
                />
              </div>

              {/* Message Content & Subtitle */}
              <div className="flex-1 min-w-0 pr-3">
                <p className="text-xs sm:text-[13px] font-normal text-slate-800 dark:text-slate-200 leading-snug">
                  First time here? Let's help you get started or find exactly what you need.
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 font-medium">
                  ScalePods AI • 2m
                </p>
              </div>

              {/* Dismiss button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowGreetingCard(false);
                }}
                className="absolute top-2.5 right-2.5 p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
                aria-label="Dismiss greeting"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* ── 2. "Chat now" Pill Button (matches the screenshot pill) ── */}
        {!isOpen && (
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="mb-2.5 inline-flex items-center gap-1.5 rounded-full border border-slate-200/90 bg-white dark:border-slate-700/80 dark:bg-slate-900/95 px-3.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-md hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 transition duration-150 active:scale-95 cursor-pointer"
          >
            <span>Chat now</span>
          </button>
        )}

        {/* ── 3. Full Chat Dialog (when Open) ── */}
        {isOpen && (
          <div
            className={`mb-3 w-[92vw] sm:w-[410px] h-[580px] max-h-[82vh] rounded-3xl border border-slate-200/90 bg-white/95 dark:border-slate-800/90 dark:bg-[#0B1020]/95 shadow-2xl shadow-blue-900/20 dark:shadow-2xl dark:shadow-blue-950/80 backdrop-blur-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 ${
              isRight ? "origin-bottom-right" : "origin-bottom-left"
            }`}
            role="dialog"
            aria-label="ScalePods AI Chat Assistant"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-200/80 dark:border-slate-800/80 bg-gradient-to-r from-blue-600/10 via-cyan-500/10 to-transparent">
              <div className="flex items-center gap-3">
                <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 to-cyan-500 p-2 text-white shadow-md shadow-blue-600/30">
                  <Image
                    src="/brand/scalepods-logo.png"
                    alt="ScalePods"
                    width={28}
                    height={28}
                    className="h-auto w-full object-contain brightness-0 invert"
                  />
                  <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 border-2 border-white dark:border-[#0B1020]" />
                  </span>
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                      ScalePods AI
                    </h3>
                    <span className="rounded-full bg-blue-500/10 border border-blue-500/25 px-1.5 py-0.2 text-[9px] font-bold text-blue-600 dark:text-blue-400">
                      AGENT
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Online
                  </p>
                </div>
              </div>

              {/* Header Action Buttons */}
              <div className="flex items-center gap-1">
                {/* Reset Chat */}
                <button
                  type="button"
                  onClick={handleResetChat}
                  title="Restart conversation"
                  aria-label="Restart conversation"
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>

                {/* Sound Toggle */}
                <button
                  type="button"
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  title={soundEnabled ? "Mute notification sounds" : "Enable sounds"}
                  aria-label={soundEnabled ? "Mute notification sounds" : "Enable sounds"}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition"
                >
                  {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                </button>

                {/* Minimize / Close */}
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  title="Close chat"
                  aria-label="Close chat"
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Conversation Messages Feed */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth">
              {messages.map((msg) => {
                const isUser = msg.sender === "user";
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
                  >
                    <div className="flex items-start gap-2.5 max-w-[88%]">
                      {!isUser && (
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-blue-600/10 border border-blue-500/20 p-1 mt-0.5">
                          <Image
                            src="/brand/scalepods-logo.png"
                            alt="ScalePods"
                            width={18}
                            height={18}
                            className="h-auto w-full object-contain dark:brightness-0 dark:invert"
                          />
                        </div>
                      )}

                      <div
                        className={`group relative rounded-2xl p-3.5 shadow-sm text-xs sm:text-[13px] leading-relaxed transition ${
                          isUser
                            ? "bg-blue-600 text-white rounded-tr-sm"
                            : "bg-slate-100/90 text-slate-800 dark:bg-slate-800/70 dark:text-slate-100 border border-slate-200/60 dark:border-slate-700/60 rounded-tl-sm"
                        }`}
                      >
                        {/* Message content */}
                        <div className="break-words">
                          {isUser ? msg.text : renderFormattedText(msg.text)}
                        </div>

                        {/* Copy button on bot message hover */}
                        {!isUser && (
                          <button
                            type="button"
                            onClick={() => handleCopyText(msg.id, msg.text)}
                            aria-label="Copy response"
                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 rounded-md bg-white/80 dark:bg-slate-700/80 text-slate-500 hover:text-slate-800 dark:text-slate-300 dark:hover:text-white transition shadow-sm"
                          >
                            {copiedId === msg.id ? (
                              <Check className="h-3 w-3 text-emerald-500" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        )}

                        {/* Action Buttons */}
                        {msg.actionButtons && msg.actionButtons.length > 0 && (
                          <div className="mt-3 pt-2.5 border-t border-slate-200 dark:border-slate-700/60 flex flex-wrap gap-2">
                            {msg.actionButtons.map((btn, bIdx) => (
                              <Link
                                key={bIdx}
                                href={btn.href}
                                target={btn.isExternal ? "_blank" : undefined}
                                rel={btn.isExternal ? "noopener noreferrer" : undefined}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-[11px] px-3 py-1.5 shadow-sm transition active:scale-95"
                              >
                                <span>{btn.label}</span>
                                {btn.isExternal ? (
                                  <ExternalLink className="h-3 w-3" />
                                ) : (
                                  <span>→</span>
                                )}
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <span
                      className={`text-[10px] text-slate-400 mt-1 px-1 ${
                        !isUser ? "ml-[38px]" : "mr-1"
                      }`}
                    >
                      {msg.timestamp}
                    </span>

                    {/* Interactive suggestions chips (aligned with message bubble, max 3) */}
                    {!isUser && msg.suggestions && msg.suggestions.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5 ml-[38px] max-w-[calc(100%-38px)]">
                        {msg.suggestions.slice(0, 3).map((sug, sIdx) => (
                          <button
                            key={sIdx}
                            type="button"
                            onClick={() => handleSendMessage(sug)}
                            className="rounded-xl border border-blue-500/25 bg-blue-50/70 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 hover:border-blue-500/40 px-2.5 py-1 text-[11px] font-medium transition active:scale-95 text-left"
                          >
                            {sug}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Bot Typing Indicator */}
              {isTyping && (
                <div className="flex items-start gap-2.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-blue-600/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 text-xs font-bold mt-0.5">
                    <Sparkles className="h-3.5 w-3.5 animate-spin" />
                  </div>
                  <div className="rounded-2xl rounded-tl-sm border border-slate-200/60 bg-slate-100/90 dark:border-slate-700/60 dark:bg-slate-800/70 px-4 py-3 shadow-sm">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-blue-500 animate-bounce [animation-delay:-0.3s]" />
                      <span className="h-2 w-2 rounded-full bg-blue-500 animate-bounce [animation-delay:-0.15s]" />
                      <span className="h-2 w-2 rounded-full bg-blue-500 animate-bounce" />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <div className="p-3 border-t border-slate-200/80 dark:border-slate-800/80 bg-slate-50/80 dark:bg-[#0E1628]/80">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="flex items-center gap-2"
              >
                <div className="relative flex-1">
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask about ScalePods, features, pricing..."
                    className="w-full rounded-xl border border-slate-200 bg-white dark:border-slate-700/80 dark:bg-slate-900/90 px-3.5 py-2.5 text-xs sm:text-[13px] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition shadow-inner"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!inputValue.trim() || isTyping}
                  aria-label="Send query"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 text-white shadow-md shadow-blue-600/25 transition active:scale-95"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
              <div className="mt-1.5 flex items-center justify-between px-1 text-[10px] text-slate-400 dark:text-slate-500">
                <span>ScalePods AI Assistant</span>
                <Link
                  href="/auth?mode=signup"
                  className="hover:text-blue-500 dark:hover:text-blue-400 transition"
                >
                  Sign Up Free →
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* ── 4. Circular Launcher Trigger Button (matching the screenshot exactly) ── */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-label={isOpen ? "Close ScalePods AI Assistant" : "Open ScalePods AI Assistant"}
          aria-expanded={isOpen}
          className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-blue-600 hover:bg-blue-500 text-white shadow-xl shadow-blue-600/35 border border-white/20 transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer"
        >
          {isOpen ? (
            <X className="h-6 w-6 transition duration-200" />
          ) : (
            <div className="relative flex items-center justify-center">
              {/* Speech bubble icon matching screenshot */}
              <MessageCircle className="h-7 w-7 fill-white text-blue-600" />
              {/* Red notification badge with "1" */}
              {hasUnread && (
                <span className="absolute -top-2.5 -right-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white text-[11px] font-extrabold border-2 border-white dark:border-[#080D1A] shadow-sm">
                  1
                </span>
              )}
            </div>
          )}
        </button>
      </div>
    </>
  );
}
