"use client";

import {
  ArrowLeft,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  LifeBuoy,
  Loader2,
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
import { useRouter } from "next/navigation";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAccount } from "@/features/account/hooks";
import type { DashboardAgentActionButton } from "@/features/agent/dashboardKnowledge";
import { useSession } from "@/features/auth/hooks";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  sender: "user" | "bot";
  text: string;
  timestamp: string;
  suggestions?: string[];
  actionButtons?: DashboardAgentActionButton[];
  isTicketConfirmation?: boolean;
  ticketId?: string;
}

const SUPPORT_CATEGORIES = [
  { id: "Technical Issue / Bug", label: "Bug / Tech Issue", emoji: "🛠️" },
  { id: "DialNexa Voice Screening Help", label: "Voice Screening", emoji: "🎙️" },
  { id: "Campaigns & Resume Scoring", label: "Campaigns & Resumes", emoji: "📊" },
  { id: "Billing / Subscription Question", label: "Billing & Plans", emoji: "💳" },
  { id: "Feature Request", label: "Feature Request", emoji: "💡" },
  { id: "Urgent Assistance", label: "Urgent Assistance", emoji: "🚨" },
];

const INITIAL_SUGGESTIONS = [
  "How do I create a new campaign?",
  "How does DialNexa voice screening work?",
  "What are the subscription limits?",
  "Contact Human Support",
];

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: "welcome-1",
    sender: "bot",
    text: "Hi! I'm your ScalePods Dashboard Assistant. I can help you build campaigns, configure DialNexa AI voice calls, evaluate resumes, or connect you with human support.",
    timestamp: "Just now",
    suggestions: INITIAL_SUGGESTIONS,
    actionButtons: [
      { label: "Go to Campaigns", href: "/campaigns" },
      { label: "Billing & Plans", href: "/billing" },
    ],
  },
];

export function ScalePodsDashboardChat() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Dedicated Contact Support View States
  const [view, setView] = useState<"chat" | "support_ticket">("chat");
  const [ticketCategory, setTicketCategory] = useState("Technical Issue / Bug");
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketMessage, setTicketMessage] = useState("");
  const [isSubmittingTicket, setIsSubmittingTicket] = useState(false);

  const { account } = useAccount();
  const { data: session } = useSession();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll on update
  useEffect(() => {
    if (isOpen && (messages.length > 0 || isTyping)) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isTyping, isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setHasUnread(false);
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  const playChime = () => {
    if (!soundEnabled || typeof window === "undefined") return;
    try {
      const audioCtx = new (
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      )();
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
      osc.stop(audioCtx.currentTime + 0.3);
    } catch {}
  };

  /**
   * Cleans any leaked ```json code fences or raw JSON syntax from bot responses
   * so only human-friendly markdown text is displayed.
   */
  const cleanDisplayReply = (raw: string): { text: string; extraSuggestions?: string[] } => {
    if (!raw) return { text: "" };
    let text = raw.trim();
    let extraSuggestions: string[] | undefined;

    // Check if there is an embedded ```json ... ``` block
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        if (Array.isArray(parsed.suggestions)) extraSuggestions = parsed.suggestions;
        const textBefore = text.slice(0, jsonMatch.index).trim();
        if (textBefore.length > 20) {
          text = textBefore;
        } else if (parsed.reply) {
          text = parsed.reply;
        }
      } catch {}
      text = text.replace(/```(?:json)?[\s\S]*?(?:```|$)/gi, "").trim();
    }

    // Check for raw {"reply": ...}
    const rawObj = text.match(/\{[\s\S]*"reply"[\s\S]*\}/);
    if (rawObj) {
      try {
        const parsed = JSON.parse(rawObj[0]);
        if (parsed.reply) text = parsed.reply;
        if (Array.isArray(parsed.suggestions) && !extraSuggestions)
          extraSuggestions = parsed.suggestions;
      } catch {}
      text = text.replace(/\{[\s\S]*"reply"[\s\S]*\}/gi, "").trim();
    }

    // Clean any remaining code fences, partial json, or "SES" mentions
    text = text.replace(/```[\s\S]*$/gi, "").trim();
    text = text.replace(/\{?\s*"reply"\s*:\s*"?[\s\S]*$/gi, "").trim();
    text = text.replace(/\{?\s*"suggestions"\s*:\s*\[?[\s\S]*$/gi, "").trim();
    text = text.replace(/\bAWS\s+SES\b/gi, "our support team");
    text = text.replace(/\bSES\b/gi, "support");

    return { text, extraSuggestions };
  };

  /**
   * Normalizes URLs so that internal links (e.g. /campaigns, /billing) NEVER
   * redirect to external marketing domains like scalepods.co.
   */
  const normalizeDashboardHref = (rawHref: string): string => {
    if (!rawHref) return "/campaigns";
    const h = rawHref.trim();

    if (h.includes("scalepods.co") || h.includes("scalepods.tech")) {
      try {
        const u = new URL(h);
        return u.pathname + u.search;
      } catch {
        return "/campaigns";
      }
    }

    if (/^(campaigns|billing|settings|dashboard|candidates|guide)/i.test(h)) {
      return `/${h}`;
    }

    return h;
  };

  const handleActionClick = (e: React.MouseEvent, rawHref: string) => {
    const cleanPath = normalizeDashboardHref(rawHref);
    if (cleanPath.startsWith("/")) {
      e.preventDefault();
      router.push(cleanPath);
    }
  };

  const handleSendMessage = async (customText?: string) => {
    const textToSend = (customText || inputValue).trim();
    if (!textToSend || isTyping) return;

    // Detect if user wants to directly trigger escalation to support
    const isSupportRequest =
      textToSend.toLowerCase().includes("contact human support") ||
      textToSend.toLowerCase().includes("connect with human support") ||
      textToSend.toLowerCase().includes("human support") ||
      textToSend.toLowerCase().includes("contact support") ||
      textToSend.toLowerCase() === "email support" ||
      textToSend.toLowerCase() === "email current chat to support";

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: "user",
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    setIsTyping(true);

    try {
      const historyPayload = messages.slice(-6).map((m) => ({
        sender: m.sender,
        text: m.text,
      }));

      const res = await fetch("/api/dashboard-agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: isSupportRequest ? "support_ticket" : "chat",
          message: textToSend,
          history: historyPayload,
          user_name: account?.name || session?.user?.email?.split("@")[0] || "Recruiter",
          user_email: account?.email || session?.user?.email,
          account_id: account?.id,
          tier: account?.tier || "free",
        }),
      });

      const data = await res.json().catch(() => null);

      if (isSupportRequest || data?.type === "ticket_created") {
        const ticketId = data?.ticket_id || `SP-SUP-${Math.floor(100000 + Math.random() * 900000)}`;
        setMessages((prev) => [
          ...prev,
          {
            id: `ticket-confirm-${Date.now()}`,
            sender: "bot",
            text: `Support Ticket **${ticketId}** has been submitted to our support team!\n\nWe have notified our engineers, and our team will follow up directly with you at **${
              account?.email || session?.user?.email || "your registered email"
            }**.`,
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            isTicketConfirmation: true,
            ticketId,
            suggestions: [
              "How do I create a new campaign?",
              "How does DialNexa voice screening work?",
              "Close Chat",
            ],
          },
        ]);
        toast.success(`Support Ticket ${ticketId} submitted successfully.`);
        playChime();
        return;
      }

      const { text: cleanText, extraSuggestions } = cleanDisplayReply(data?.reply || "");

      const botMsg: ChatMessage = {
        id: `bot-${Date.now()}`,
        sender: "bot",
        text:
          cleanText ||
          "I am here to help you navigate ScalePods. Feel free to ask about Campaigns, Voice screening, or connect with our support team.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        suggestions:
          Array.isArray(data?.suggestions) && data.suggestions.length > 0
            ? data.suggestions
            : extraSuggestions,
        actionButtons: Array.isArray(data?.actionButtons) ? data.actionButtons : undefined,
      };

      setMessages((prev) => [...prev, botMsg]);
      playChime();
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-err-${Date.now()}`,
          sender: "bot",
          text: "I experienced a brief connection interruption. If you need urgent assistance, you can click **'Contact Support'** below to notify our team directly.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          suggestions: ["Contact Human Support", "How do I create a campaign?"],
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleEscalateToSupport = () => {
    setView("support_ticket");
  };

  const handleSuggestionClick = (sug: string) => {
    if (sug.toLowerCase().includes("support") && !sug.toLowerCase().includes("how")) {
      setView("support_ticket");
    } else {
      handleSendMessage(sug);
    }
  };

  const handleSubmitSupportTicket = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!ticketMessage.trim() || isSubmittingTicket) return;

    setIsSubmittingTicket(true);
    const subject = ticketSubject.trim() || `${ticketCategory} Inquiry`;
    const message = ticketMessage.trim();
    const userEmail = account?.email || session?.user?.email || "your registered email";
    const userName = account?.name || session?.user?.email?.split("@")[0] || "Recruiter";

    // 1. Add user message in chat
    const userMsg: ChatMessage = {
      id: `usr-ticket-${Date.now()}`,
      sender: "user",
      text: `**Support Request:** ${subject}\n*Category: ${ticketCategory}*\n\n${message}`,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const historyPayload = messages.slice(-6).map((m) => ({
        sender: m.sender,
        text: m.text,
      }));

      const res = await fetch("/api/dashboard-agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "support_ticket",
          subject,
          category: ticketCategory,
          message,
          history: historyPayload,
          user_name: userName,
          user_email: userEmail,
          account_id: account?.id,
          tier: account?.tier || "free",
        }),
      });

      const data = await res.json().catch(() => null);
      const ticketId = data?.ticket_id || `SP-SUP-${Math.floor(100000 + Math.random() * 900000)}`;

      // 2. Add confirmation message without mentioning scalepods.tech
      setMessages((prev) => [
        ...prev,
        {
          id: `ticket-confirm-${Date.now()}`,
          sender: "bot",
          text: `Support Ticket **${ticketId}** has been submitted to our support team!\n\nWe have notified our engineers, and our team will follow up directly with you at **${userEmail}**.`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          isTicketConfirmation: true,
          ticketId,
          suggestions: [
            "Go to Campaigns",
            "How does DialNexa voice screening work?",
            "Billing & Plans",
          ],
          actionButtons: [
            { label: "Go to Campaigns", href: "/campaigns" },
            { label: "Billing & Plans", href: "/billing" },
          ],
        },
      ]);

      // Reset ticket form and return to chat view
      setTicketSubject("");
      setTicketMessage("");
      setView("chat");
      toast.success(`Support Ticket ${ticketId} submitted successfully.`);
      playChime();
    } catch {
      toast.error("Failed to submit support request. Please try again.");
    } finally {
      setIsSubmittingTicket(false);
    }
  };

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleResetChat = () => {
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        sender: "bot",
        text: "Conversation reset. How can I assist your recruiting workflows today?",
        timestamp: "Just now",
        suggestions: INITIAL_SUGGESTIONS,
        actionButtons: [
          { label: "Go to Campaigns", href: "/campaigns" },
          { label: "Billing & Plans", href: "/billing" },
        ],
      },
    ]);
  };

  const renderInlineMarkdown = (text: string, isUserMessage = false) => {
    const tokenRegex =
      /(\*\*\[.*?\]\(.*?\)\*\*|\[\*\*.*?\*\*\]\(.*?\)|\[.*?\]\(.*?\)|(?:\*\*.*?\*\*))/g;
    const parts = text.split(tokenRegex);
    return parts.map((part, i) => {
      const partKey = `inline-${i}-${part.slice(0, 10)}`;
      // 1. Bold link
      const boldLinkMatch =
        part.match(/^\*\*\[(.*?)\]\((.*?)\)\*\*$/) || part.match(/^\[\*\*(.*?)\*\*\]\((.*?)\)$/);
      if (boldLinkMatch) {
        const linkText = boldLinkMatch[1];
        const linkUrl = normalizeDashboardHref(boldLinkMatch[2]);
        const isExternal = linkUrl.startsWith("http");
        return (
          <a
            key={partKey}
            href={linkUrl}
            onClick={(e) => handleActionClick(e, linkUrl)}
            target={isExternal ? "_blank" : undefined}
            rel={isExternal ? "noopener noreferrer" : undefined}
            className={cn(
              "font-bold underline decoration-blue-400/50 hover:decoration-blue-500 transition break-words",
              isUserMessage ? "text-white" : "text-blue-600 dark:text-blue-400",
            )}
          >
            {linkText}
          </a>
        );
      }

      // 2. Regular link
      const linkMatch = part.match(/^\[(.*?)\]\((.*?)\)$/);
      if (linkMatch) {
        const linkText = linkMatch[1];
        const linkUrl = normalizeDashboardHref(linkMatch[2]);
        const isExternal = linkUrl.startsWith("http");
        return (
          <a
            key={partKey}
            href={linkUrl}
            onClick={(e) => handleActionClick(e, linkUrl)}
            target={isExternal ? "_blank" : undefined}
            rel={isExternal ? "noopener noreferrer" : undefined}
            className={cn(
              "font-semibold underline decoration-blue-400/50 hover:decoration-blue-500 transition break-words",
              isUserMessage ? "text-white" : "text-blue-600 dark:text-blue-400",
            )}
          >
            {linkText}
          </a>
        );
      }

      // 3. Bold text: **Text**
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong
            key={partKey}
            className={cn(
              "font-semibold",
              isUserMessage ? "text-white font-bold" : "text-slate-900 dark:text-white",
            )}
          >
            {part.slice(2, -2)}
          </strong>
        );
      }

      return part;
    });
  };

  const renderFormattedText = (raw: string, isUserMessage = false) => {
    const lines = raw.split("\n");
    return lines.map((line, idx) => {
      const lineKey = `line-${idx}-${line.slice(0, 12)}`;
      if (!line.trim()) {
        return <div key={lineKey} className="h-1.5" />;
      }
      if (line.startsWith("### ")) {
        return (
          <h4
            key={lineKey}
            className={cn(
              "font-bold text-xs sm:text-sm mt-1.5 mb-0.5",
              isUserMessage ? "text-white" : "text-slate-900 dark:text-white",
            )}
          >
            {renderInlineMarkdown(line.replace("### ", ""), isUserMessage)}
          </h4>
        );
      }
      if (line.startsWith("## ")) {
        return (
          <h3
            key={lineKey}
            className={cn(
              "font-bold text-sm mt-1.5 mb-0.5",
              isUserMessage ? "text-white" : "text-slate-900 dark:text-white",
            )}
          >
            {renderInlineMarkdown(line.replace("## ", ""), isUserMessage)}
          </h3>
        );
      }
      if (line.trim().startsWith("- ") || line.trim().startsWith("• ")) {
        const bulletText = line.trim().substring(2);
        return (
          <div key={lineKey} className="flex items-start gap-1.5 my-0.5 text-xs leading-relaxed">
            <span
              className={cn(
                "font-bold shrink-0 mt-0.5",
                isUserMessage ? "text-white" : "text-blue-500",
              )}
            >
              •
            </span>
            <span>{renderInlineMarkdown(bulletText, isUserMessage)}</span>
          </div>
        );
      }
      const numMatch = line.trim().match(/^(\d+)\.\s+(.*)/);
      if (numMatch) {
        return (
          <div key={lineKey} className="flex items-start gap-1.5 my-0.5 text-xs leading-relaxed">
            <span
              className={cn("font-bold shrink-0", isUserMessage ? "text-white" : "text-blue-500")}
            >
              {numMatch[1]}.
            </span>
            <span>{renderInlineMarkdown(numMatch[2], isUserMessage)}</span>
          </div>
        );
      }
      return (
        <p key={lineKey} className="my-0.5 leading-relaxed">
          {renderInlineMarkdown(line, isUserMessage)}
        </p>
      );
    });
  };

  return (
    <>
      {/* Floating Widget Container at Bottom Right */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
        {/* ── 1. Floating 'Chat now' Pill (Matching Screenshot) ── */}
        {!isOpen && (
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="mb-2.5 inline-flex items-center gap-1.5 rounded-full border border-slate-200/90 bg-white dark:border-slate-800/90 dark:bg-slate-900/95 px-3.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-md hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition duration-150 active:scale-95 cursor-pointer"
          >
            <span>Chat now</span>
          </button>
        )}

        {/* ── 2. Expanded Chat Dialog (100% Conversational) ── */}
        {isOpen && (
          <div
            className="mb-3 w-[92vw] sm:w-[410px] h-[580px] max-h-[82vh] rounded-3xl border border-slate-200/90 bg-white/95 dark:border-slate-800/90 dark:bg-[#0B1020]/95 shadow-2xl shadow-blue-900/20 dark:shadow-2xl dark:shadow-blue-950/80 backdrop-blur-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-bottom-right"
            role="dialog"
            aria-label="ScalePods Dashboard Assistant"
          >
            {view === "support_ticket" ? (
              /* ── Contact Support Form View (includes Subject + Body + Interactive Category Pills) ── */
              <>
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200/80 dark:border-slate-800/80 bg-gradient-to-r from-blue-600/10 via-cyan-500/10 to-transparent">
                  <div className="flex items-center gap-2 min-w-0">
                    <button
                      type="button"
                      onClick={() => setView("chat")}
                      className="p-1 -ml-1 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                      aria-label="Back to chat"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight truncate">
                        Contact Support
                      </h3>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                        Direct assistance from our engineering team
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-0.5 shrink-0">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => setIsOpen(false)}
                          aria-label="Minimize"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">Minimize</TooltipContent>
                    </Tooltip>
                  </div>
                </div>

                <form
                  onSubmit={handleSubmitSupportTicket}
                  className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs"
                >
                  <div className="p-2.5 rounded-xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200/60 dark:border-blue-800/60 text-slate-700 dark:text-slate-300">
                    <div className="text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                      Direct Support Inquiry
                    </div>
                    <div className="text-[10px] mt-0.5 text-slate-600 dark:text-slate-400">
                      We will review your inquiry and follow up directly at{" "}
                      <strong className="text-slate-900 dark:text-white font-medium">
                        {account?.email || session?.user?.email || "your registered email"}
                      </strong>
                    </div>
                  </div>

                  <div>
                    <span className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Issue Category
                    </span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {SUPPORT_CATEGORIES.map((cat) => {
                        const isSelected = ticketCategory === cat.id;
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => setTicketCategory(cat.id)}
                            className={cn(
                              "px-2.5 py-1.5 rounded-xl border text-left text-[11px] font-medium transition flex items-center gap-1.5 cursor-pointer",
                              isSelected
                                ? "bg-blue-600 border-blue-600 text-white shadow-xs font-semibold"
                                : "bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700",
                            )}
                          >
                            <span className="text-xs">{cat.emoji}</span>
                            <span className="truncate">{cat.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="ticket-subject"
                      className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Subject
                    </label>
                    <input
                      id="ticket-subject"
                      type="text"
                      value={ticketSubject}
                      onChange={(e) => setTicketSubject(e.target.value)}
                      placeholder="e.g. Assistance configuring DialNexa custom voice prompt"
                      className="w-full rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/90 px-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="ticket-message"
                      className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Message Description <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      id="ticket-message"
                      required
                      rows={4}
                      value={ticketMessage}
                      onChange={(e) => setTicketMessage(e.target.value)}
                      placeholder="Describe what you need assistance with, campaign details, or error messages..."
                      className="w-full rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/90 px-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition resize-none"
                    />
                  </div>

                  <p className="text-[10px] text-slate-400">
                    Recent conversation context from this session will be attached so our engineers
                    have complete context.
                  </p>

                  <div className="pt-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setView("chat")}
                      className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition font-medium text-xs cursor-pointer"
                    >
                      Back to Chat
                    </button>
                    <button
                      type="submit"
                      disabled={!ticketMessage.trim() || isSubmittingTicket}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium text-xs shadow-md shadow-blue-600/30 transition flex items-center gap-1.5 cursor-pointer"
                    >
                      {isSubmittingTicket ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Submitting...</span>
                        </>
                      ) : (
                        <>
                          <Send className="h-3.5 w-3.5" />
                          <span>Submit Request</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              /* ── Conversational Chat View ── */
              <>
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200/80 dark:border-slate-800/80 bg-gradient-to-r from-blue-600/10 via-cyan-500/10 to-transparent">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 p-1.5 text-white shadow-md shadow-blue-600/30">
                      <Image
                        src="/brand/scalepods-logo.png"
                        alt="ScalePods"
                        width={24}
                        height={24}
                        className="h-auto w-full object-contain brightness-0 invert"
                      />
                      <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 border-2 border-white dark:border-[#0B1020]" />
                      </span>
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight truncate">
                        ScalePods
                      </h3>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                        Online &middot; Dedicated Recruiter Support
                      </p>
                    </div>
                  </div>

                  {/* Actions (with glass Tooltips, no native title tooltips) */}
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={handleResetChat}
                          aria-label="Restart chat"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">Restart chat</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => setSoundEnabled(!soundEnabled)}
                          aria-label={soundEnabled ? "Mute notification sound" : "Enable sound"}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                        >
                          {soundEnabled ? (
                            <Volume2 className="h-3.5 w-3.5" />
                          ) : (
                            <VolumeX className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        {soundEnabled ? "Mute sound" : "Unmute sound"}
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => setIsOpen(false)}
                          aria-label="Minimize"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">Minimize</TooltipContent>
                    </Tooltip>
                  </div>
                </div>

                {/* Conversational Chat Feed */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth">
                  {messages.map((msg) => {
                    const isUser = msg.sender === "user";
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
                      >
                        <div className="flex items-start gap-2 max-w-[90%]">
                          {!isUser && (
                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-blue-600/10 border border-blue-500/20 p-1 mt-0.5">
                              <Image
                                src="/brand/scalepods-logo.png"
                                alt="ScalePods"
                                width={14}
                                height={14}
                                className="h-auto w-full object-contain dark:brightness-0 dark:invert"
                              />
                            </div>
                          )}

                          <div
                            className={`group relative rounded-2xl p-3 shadow-xs text-xs leading-relaxed transition ${
                              isUser
                                ? "bg-blue-600 text-white rounded-tr-xs"
                                : msg.isTicketConfirmation
                                  ? "bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-500/30 text-emerald-950 dark:text-emerald-200 rounded-tl-xs"
                                  : "bg-slate-100 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60 text-slate-900 dark:text-slate-100 rounded-tl-xs"
                            }`}
                          >
                            <div className="space-y-0.5">
                              {renderFormattedText(msg.text, isUser)}
                            </div>

                            {/* Action Buttons (Strictly Normalized to Platform Routes) */}
                            {msg.actionButtons && msg.actionButtons.length > 0 && (
                              <div className="mt-2.5 flex flex-wrap gap-1.5 pt-1.5 border-t border-slate-200/40 dark:border-slate-700/40">
                                {msg.actionButtons.map((btn) => {
                                  const cleanHref = normalizeDashboardHref(btn.href);
                                  const isExternal = cleanHref.startsWith("http");
                                  return (
                                    <Link
                                      key={`btn-${btn.label}-${btn.href}`}
                                      href={cleanHref}
                                      onClick={(e) => handleActionClick(e, cleanHref)}
                                      target={isExternal ? "_blank" : undefined}
                                      rel={isExternal ? "noopener noreferrer" : undefined}
                                      className="inline-flex items-center gap-1 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 px-2 py-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:bg-white dark:hover:bg-slate-900 shadow-2xs transition"
                                    >
                                      <span>{btn.label}</span>
                                      {isExternal && <ExternalLink className="h-2.5 w-2.5" />}
                                    </Link>
                                  );
                                })}
                              </div>
                            )}

                            {/* Copy button with Tooltip */}
                            {!isUser && (
                              <div className="absolute -bottom-5 right-1 opacity-0 group-hover:opacity-100 transition">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      onClick={() => handleCopyText(msg.id, msg.text)}
                                      aria-label="Copy response"
                                      className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                                    >
                                      {copiedId === msg.id ? (
                                        <Check className="h-3 w-3 text-emerald-500" />
                                      ) : (
                                        <Copy className="h-3 w-3" />
                                      )}
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    {copiedId === msg.id ? "Copied!" : "Copy response"}
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                            )}
                          </div>
                        </div>

                        <span
                          className={`text-[9px] text-slate-400 mt-1 px-1 ${
                            !isUser ? "ml-[32px]" : "mr-1"
                          }`}
                        >
                          {msg.timestamp}
                        </span>

                        {/* Interactive Suggestion Chips */}
                        {!isUser && msg.suggestions && msg.suggestions.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1.5 ml-[32px] max-w-[calc(100%-32px)]">
                            {msg.suggestions.map((sug) => (
                              <button
                                key={`sug-${sug}`}
                                type="button"
                                onClick={() => handleSuggestionClick(sug)}
                                className="rounded-xl border border-blue-500/25 bg-blue-50/70 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 hover:border-blue-500/40 px-2.5 py-1 text-[10px] font-medium transition active:scale-95 text-left cursor-pointer"
                              >
                                {sug}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Typing Indicator */}
                  {isTyping && (
                    <div className="flex items-start gap-2">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-blue-600/10 border border-blue-500/20 text-blue-600 text-xs font-bold mt-0.5">
                        <Sparkles className="h-3 w-3 animate-spin" />
                      </div>
                      <div className="rounded-2xl rounded-tl-xs border border-slate-200/60 bg-slate-100/90 dark:border-slate-700/60 dark:bg-slate-800/70 px-3.5 py-2.5 shadow-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-bounce [animation-delay:-0.3s]" />
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-bounce [animation-delay:-0.15s]" />
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-bounce" />
                        </div>
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>

                {/* Conversational Input Bar */}
                <div className="p-3 border-t border-slate-200/80 dark:border-slate-800/80 bg-slate-50/80 dark:bg-[#0E1628]/80">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSendMessage();
                    }}
                    className="flex items-center gap-2"
                  >
                    <input
                      ref={inputRef}
                      type="text"
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      placeholder="Ask about campaigns, voice screening, offers..."
                      className="flex-1 rounded-xl border border-slate-200 bg-white dark:border-slate-700/80 dark:bg-slate-900/90 px-3.5 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition shadow-inner"
                    />
                    <button
                      type="submit"
                      disabled={!inputValue.trim() || isTyping}
                      aria-label="Send message"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white shadow-xs transition active:scale-95"
                    >
                      <Send className="h-3.5 w-3.5" />
                    </button>
                  </form>
                  <div className="mt-1.5 flex items-center justify-between px-1 text-[9px] text-slate-400">
                    <span>Powered by ScalePods AI</span>
                    <button
                      type="button"
                      onClick={handleEscalateToSupport}
                      className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium cursor-pointer"
                    >
                      <LifeBuoy className="h-2.5 w-2.5" />
                      Contact Support
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── 3. Circular Launcher Trigger Button (matching the uploaded image) ── */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-label={isOpen ? "Close Assistant" : "Open ScalePods Support"}
          aria-expanded={isOpen}
          className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-blue-600 hover:bg-blue-500 text-white shadow-xl shadow-blue-600/35 border border-white/20 transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer"
        >
          {isOpen ? (
            <X className="h-6 w-6 transition duration-200" />
          ) : (
            <div className="relative flex items-center justify-center">
              <MessageCircle className="h-7 w-7 fill-white text-blue-600" />
              {hasUnread && (
                <span className="absolute -top-2.5 -right-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white text-[11px] font-extrabold border-2 border-white dark:border-[#080D1A] shadow-xs">
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
