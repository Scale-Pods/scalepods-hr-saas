"use client";

import { ExternalLink, FileText, Mail, Shield, X } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { PRIVACY_POLICY, TERMS_OF_SERVICE } from "@/lib/legal-content";

interface LegalModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: "privacy" | "terms";
  onTabChange: (tab: "privacy" | "terms") => void;
}

export function LegalModal({ open, onOpenChange, tab, onTabChange }: LegalModalProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);

  if (!open) return null;

  const doc = tab === "privacy" ? PRIVACY_POLICY : TERMS_OF_SERVICE;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity animate-in fade-in-0 duration-200"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />

      {/* Modal Dialog Card */}
      <div className="relative z-10 flex w-full max-w-3xl flex-col max-h-[90vh] rounded-2xl border border-white/10 bg-[#0B1020]/95 text-slate-200 shadow-2xl shadow-blue-950/50 backdrop-blur-xl animate-in fade-in-0 zoom-in-95 duration-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
              {tab === "privacy" ? (
                <Shield className="h-4 w-4" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold tracking-wider uppercase text-blue-400">
                  ScalePods Legal
                </span>
                <span className="text-xs text-slate-500">•</span>
                <span className="text-xs text-slate-400">Updated {doc.lastUpdated}</span>
              </div>
              <h2 id="legal-modal-title" className="text-lg font-bold text-white tracking-tight">
                {doc.title}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={`/${tab}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/10 hover:text-white transition"
              title="Open standalone page in new tab"
            >
              <span>Full page</span>
              <ExternalLink className="h-3 w-3" />
            </Link>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white transition"
              aria-label="Close dialog"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-white/10 bg-white/[0.01] px-6">
          <button
            type="button"
            onClick={() => onTabChange("privacy")}
            className={`flex items-center gap-2 border-b-2 py-3 px-4 text-xs font-semibold transition ${
              tab === "privacy"
                ? "border-blue-400 text-blue-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Shield className="h-3.5 w-3.5" />
            Privacy Policy
          </button>
          <button
            type="button"
            onClick={() => onTabChange("terms")}
            className={`flex items-center gap-2 border-b-2 py-3 px-4 text-xs font-semibold transition ${
              tab === "terms"
                ? "border-blue-400 text-blue-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            Terms of Service
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 text-sm text-slate-300 leading-relaxed custom-scrollbar">
          <p className="text-slate-300 text-sm leading-relaxed bg-white/[0.03] p-4 rounded-xl border border-white/5">
            {doc.intro}
          </p>

          <div className="space-y-6">
            {doc.sections.map((section) => (
              <div key={section.title} className="space-y-2">
                <h3 className="text-base font-semibold text-white tracking-tight">
                  {section.title}
                </h3>

                {section.subsections?.map((sub) => (
                  <div key={sub.title} className="pl-3 border-l border-white/10 space-y-1 my-2">
                    <h4 className="text-sm font-semibold text-blue-300">{sub.title}</h4>
                    <p className="text-xs text-slate-300 leading-relaxed">{sub.content}</p>
                  </div>
                ))}

                {section.paragraphs?.map((p, idx) => (
                  <p key={idx} className="text-xs text-slate-300 leading-relaxed">
                    {p}
                  </p>
                ))}

                {section.listItems && (
                  <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-300">
                    {section.listItems.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>

          {/* Contact Box */}
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-blue-400 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-white">Questions or Data Requests?</p>
                <p className="text-xs text-slate-400">
                  Contact our compliance and legal team directly.
                </p>
              </div>
            </div>
            <a
              href={`mailto:${doc.contactEmail}`}
              className="shrink-0 rounded-lg bg-blue-600/30 border border-blue-500/30 px-3 py-1.5 text-xs font-semibold text-blue-300 hover:bg-blue-600/50 hover:text-white transition"
            >
              {doc.contactEmail}
            </a>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between border-t border-white/10 px-6 py-3 bg-white/[0.02] text-xs text-slate-400 gap-2">
          <span>© 2026 ScalePods AI Infrastructure. All rights reserved.</span>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] tracking-wider uppercase text-blue-400/80">
              Built for the future
            </span>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-lg bg-white/10 px-3 py-1 font-semibold text-white hover:bg-white/15 transition"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
