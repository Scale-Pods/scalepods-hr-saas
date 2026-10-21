"use client";

import Link from "next/link";
import type * as React from "react";

interface ScalePodsFooterProps {
  onOpenLegal?: (tab: "privacy" | "terms") => void;
}

export function ScalePodsFooter({ onOpenLegal }: ScalePodsFooterProps) {
  const handleLegalClick = (e: React.MouseEvent, tab: "privacy" | "terms") => {
    if (onOpenLegal) {
      e.preventDefault();
      onOpenLegal(tab);
    }
  };

  return (
    <footer className="relative w-full border-t border-slate-200 bg-slate-100/90 dark:border-slate-800/80 dark:bg-[#0B1020] px-6 py-12 sm:px-8 text-slate-600 dark:text-slate-300 font-sans overflow-hidden transition-colors duration-200">
      {/* Ambient blue top glow */}
      <div
        className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 h-[1px] w-3/5 bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-30 shadow-[0_0_20px_rgba(59,130,246,0.5)]"
        aria-hidden="true"
      />

      <div className="mx-auto max-w-5xl">
        {/* Main Footer Grid */}
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-8 pb-12">
          {/* Left Brand Column (4 cols) */}
          <div className="lg:col-span-4 flex flex-col items-start">
            <Link href="/" className="inline-block mb-4 group">
              <img
                src="/brand/scalepods-navbar-logo.png"
                alt="ScalePods"
                className="h-8 sm:h-9 w-auto object-contain dark:brightness-0 dark:invert drop-shadow-sm transition duration-300"
              />
            </Link>

            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400 max-w-sm mb-6">
              Architecting the future of enterprise operations through Agentic AI
              ecosystems, enterprise process automation, and intelligent hiring automation.
            </p>

            {/* Social Icons */}
            <div className="flex items-center gap-3">
              {/* Instagram */}
              <a
                href="https://www.instagram.com/scalepods.co/"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-all hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 hover:scale-105 dark:border-slate-700/60 dark:bg-slate-800/50 dark:text-slate-300 dark:hover:border-blue-500/50 dark:hover:bg-blue-600/15 dark:hover:text-blue-400"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                  <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
                </svg>
              </a>

              {/* LinkedIn */}
              <a
                href="https://www.linkedin.com/company/scalepods-co"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="LinkedIn"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-all hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 hover:scale-105 dark:border-slate-700/60 dark:bg-slate-800/50 dark:text-slate-300 dark:hover:border-blue-500/50 dark:hover:bg-blue-600/15 dark:hover:text-blue-400"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
                  <rect x="2" y="9" width="4" height="12" />
                  <circle cx="4" cy="4" r="2" />
                </svg>
              </a>

              {/* WhatsApp */}
              <a
                href="https://wa.me/919867271848?text=Hi%20ScalePods!%20I%27m%20interested%20in%20discussing%20custom%20workflow%20automation%20solutions%20for%20my%20business."
                target="_blank"
                rel="noopener noreferrer"
                aria-label="WhatsApp"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-all hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 hover:scale-105 dark:border-slate-700/60 dark:bg-slate-800/50 dark:text-slate-300 dark:hover:border-blue-500/50 dark:hover:bg-blue-600/15 dark:hover:text-blue-400"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M22 11.5A8.5 8.5 0 0 1 13.5 20c-1.3 0-2.6-.3-3.8-.9L4 21l2-5.5A8.5 8.5 0 1 1 22 11.5z" />
                  <path d="M9 8.5c.2-.4.6-.7 1.1-.5l1.5.6c.3.1.4.5.3.8l-.5.9c.7.8 1.4 1.5 2.2 2.2l.9-.5c.3-.1.7 0 .8.3l.6 1.5c.2.5-.1.9-.5 1.1-.9.4-2.1.2-3.3-.6S9 11.2 9 8.5z" />
                </svg>
              </a>
            </div>
          </div>

          {/* Nav Links Grid (8 cols) */}
          <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-8">
            {/* Solutions */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-200 mb-4">
                Solutions
              </h4>
              <ul className="space-y-2.5 text-xs text-slate-600 dark:text-slate-400">
                <li>
                  <a
                    href="https://www.scalepods.co/solution/sales-workflow-automation"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    Sales Automation
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.scalepods.co/solution/ops-workflow-automation"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    Ops Automation
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.scalepods.co/solution/ai-automation-for-manufacturing"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    Manufacturing AI
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.scalepods.co/solution/ai-automation-for-real-estate"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    Real Estate AI
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.scalepods.co/solution/hr-workflow-automation"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    HR Automation
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.scalepods.co/solution/marketing-workflow-automation"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    Marketing Automation
                  </a>
                </li>
              </ul>
            </div>

            {/* Case Studies */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-200 mb-4">
                Case Studies
              </h4>
              <ul className="space-y-2.5 text-xs text-slate-600 dark:text-slate-400">
                <li>
                  <a
                    href="https://www.scalepods.co/case-study/lotus-manor-real-estate-sales-automation-dubai"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    Lotus Manor Dubai
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.scalepods.co/case-study/zv-steels-recruitment-automation-tool"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    ZV Steels India
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.scalepods.co/case-study/asquared-real-estate-sales-automation-dubai"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    A Squared Dubai
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.scalepods.co/case-study/lootah-group-procurement-workflow-automation"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    Lootah Group Dubai
                  </a>
                </li>
              </ul>
            </div>

            {/* Platform & Legal */}
            <div className="space-y-6">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-200 mb-4">
                  Platform
                </h4>
                <ul className="space-y-2.5 text-xs text-slate-600 dark:text-slate-400">
                  <li>
                    <a
                      href="https://www.scalepods.co/#services"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    >
                      Services
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://www.scalepods.co/contact"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    >
                      Contact
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://www.scalepods.co/blog"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    >
                      Blog
                    </a>
                  </li>
                </ul>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-200 mb-3">
                  Legal
                </h4>
                <ul className="space-y-2.5 text-xs text-slate-600 dark:text-slate-400">
                  <li>
                    <Link
                      href="/privacy"
                      onClick={(e) => handleLegalClick(e, "privacy")}
                      className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium text-slate-700 dark:text-slate-300"
                    >
                      Privacy Policy
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/terms"
                      onClick={(e) => handleLegalClick(e, "terms")}
                      className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium text-slate-700 dark:text-slate-300"
                    >
                      Terms of Service
                    </Link>
                  </li>
                </ul>
              </div>
            </div>

            {/* Connect */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-200 mb-4">
                Connect
              </h4>
              <a
                href="mailto:info@scalepods.tech"
                className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors inline-block break-all"
              >
                info@scalepods.tech
              </a>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between border-t border-slate-200 dark:border-slate-800/80 pt-6 gap-4 text-xs text-slate-500 dark:text-slate-400">
          <span>© 2026 ScalePods AI Infrastructure. All rights reserved.</span>
          <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400/80">
            BUILT FOR THE FUTURE
          </span>
        </div>
      </div>
    </footer>
  );
}
