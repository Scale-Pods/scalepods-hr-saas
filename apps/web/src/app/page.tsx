"use client";

import {
  ArrowRight,
  ArrowUpRight,
  CalendarCheck,
  CheckCircle2,
  Cpu,
  Lock,
  LogIn,
  Menu,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
  User,
  Users,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { LegalModal } from "@/components/legal/LegalModal";
import { ScalePodsFooter } from "@/components/shared/ScalePodsFooter";

const trustedCompanies = [
  { name: "BECO Capital", logo: "https://www.scalepods.co/brands/BECO.avif", h: "h-7" },
  { name: "GammaCode", logo: "https://www.scalepods.co/brands/gammacode.webp", h: "h-7" },
  { name: "Krafty", logo: "https://www.scalepods.co/brands/krafty-logo-white.png", h: "h-7", raw: true },
  { name: "Lotus Manor Dubai", logo: "https://www.scalepods.co/brands/lotus-manor.webp", h: "h-8" },
  { name: "Lootah Group of Companies", logo: "https://www.scalepods.co/brands/lootah-group.png", h: "h-8" },
  { name: "ZV Steels", logo: "https://www.scalepods.co/brands/zv_steels_logo.webp", h: "h-7" },
  { name: "eEquals", logo: "https://www.scalepods.co/brands/eequals_logo.webp", h: "h-8" },
  { name: "PropertyGeld", logo: "https://www.scalepods.co/brands/propertygeld.png", h: "h-7" },
  { name: "Passionfruit", logo: "https://www.scalepods.co/brands/passsionfruit.avif", h: "h-7" },
];

export default function HomePage() {
  const [legalModalOpen, setLegalModalOpen] = useState(false);
  const [legalTab, setLegalTab] = useState<"privacy" | "terms">("privacy");
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Automatically resume marquee whenever cursor leaves the trusted companies section
  useEffect(() => {
    if (!selectedCompany) return;
    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest("#trusted-companies-section")) {
        setSelectedCompany(null);
      }
    };
    window.addEventListener("mouseover", handleMouseOver);
    return () => window.removeEventListener("mouseover", handleMouseOver);
  }, [selectedCompany]);

  const toggleCompany = (companyName: string) => {
    setSelectedCompany((prev) => (prev === companyName ? null : companyName));
  };

  const openLegal = (tab: "privacy" | "terms") => {
    setLegalTab(tab);
    setLegalModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#080D1A] dark:text-slate-100 flex flex-col justify-between selection:bg-blue-500 selection:text-white relative overflow-x-hidden font-sans transition-colors duration-200">
      {/* Background Subtle SaaS Grid & Ambient Beams */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(15,23,42,0.06)_1px,transparent_1px)] dark:bg-[radial-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:24px_24px] opacity-40 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_15%,#000_60%,transparent_100%)] -z-0"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[-140px] left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-gradient-to-b from-blue-500/15 via-cyan-500/10 to-transparent blur-3xl -z-0"
      />

      {/* ── Modern SaaS Navigation Bar ── */}
      <header className="sticky top-0 z-50 w-full border-b border-slate-200/80 bg-white/80 dark:border-slate-800/80 dark:bg-[#080D1A]/85 backdrop-blur-xl transition-colors duration-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Logo & Brand */}
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <Link href="/" className="flex items-center shrink-0">
              <img
                src="/brand/scalepods-navbar-logo.png"
                alt="ScalePods"
                className="h-7 sm:h-9 w-auto object-contain dark:brightness-0 dark:invert drop-shadow-[0_0_12px_rgba(59,130,246,0.25)] transition duration-200"
              />
            </Link>
            <span className="hidden lg:inline-flex items-center gap-1.5 rounded-full border border-blue-500/25 bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500 dark:bg-blue-400 animate-pulse" />
              Talent Intelligence Platform
            </span>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-7 text-xs font-semibold text-slate-600 dark:text-slate-300">
            <a href="#solutions" className="hover:text-blue-600 dark:hover:text-white transition">
              Solutions
            </a>
            <a href="#features" className="hover:text-blue-600 dark:hover:text-white transition">
              Features
            </a>
            <a href="#enterprise" className="hover:text-blue-600 dark:hover:text-white transition">
              Enterprise Security
            </a>
            <a
              href="https://www.scalepods.co"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-white transition"
            >
              <span>About ScalePods</span>
              <ArrowUpRight className="h-3 w-3" />
            </a>
          </nav>

          {/* Right Action Bar: Theme Switcher (desktop), Sign In, Get Started & Hamburger Toggle */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            {/* Theme Toggle Button - desktop only (on mobile it lives inside the hamburger menu) */}
            <button
              type="button"
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              aria-label="Switch theme"
              className="hidden md:flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white/90 text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700/80 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white transition shadow-sm active:scale-95"
            >
              {mounted && resolvedTheme === "dark" ? (
                <Sun className="h-4 w-4 text-amber-400" />
              ) : (
                <Moon className="h-4 w-4 text-slate-600 dark:text-slate-300" />
              )}
            </button>

            <Link
              href="/auth?mode=signin"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 dark:border-slate-700/70 dark:bg-slate-800/40 dark:hover:bg-slate-800/80 dark:hover:border-slate-600 px-3.5 py-2 text-xs font-semibold dark:text-white shadow-sm transition active:scale-[0.99] whitespace-nowrap"
            >
              <LogIn className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />
              <span>Sign In</span>
            </Link>

            <Link
              href="/auth?mode=signup"
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 px-3 py-1.5 sm:px-4 sm:py-2 text-xs font-semibold text-white shadow-md shadow-blue-600/25 transition active:scale-[0.99] whitespace-nowrap"
            >
              <span>Get Started</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>

            {/* Mobile Hamburger Toggle (Three Icons Button) */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700/80 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-800 transition shadow-sm"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-b border-slate-200 bg-white/95 px-5 py-4 dark:border-slate-800 dark:bg-[#080D1A]/95 backdrop-blur-2xl shadow-xl space-y-4 animate-in slide-in-from-top-2 duration-150">
            {/* Top theme switcher inside mobile drawer */}
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-200 dark:border-slate-800">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Appearance
              </span>
              <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800/80 p-1 border border-slate-200 dark:border-slate-700/60">
                <button
                  type="button"
                  onClick={() => setTheme("light")}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition ${
                    resolvedTheme === "light"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                >
                  <Sun className="h-3.5 w-3.5 text-amber-500" />
                  <span>Light</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTheme("dark")}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition ${
                    resolvedTheme === "dark"
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
                >
                  <Moon className="h-3.5 w-3.5 text-blue-400" />
                  <span>Dark</span>
                </button>
              </div>
            </div>

            {/* Navigation Links */}
            <a
              href="#solutions"
              onClick={() => setMobileMenuOpen(false)}
              className="block text-sm font-semibold text-slate-700 hover:text-blue-600 dark:text-slate-300 dark:hover:text-white transition py-1"
            >
              Solutions
            </a>
            <a
              href="#features"
              onClick={() => setMobileMenuOpen(false)}
              className="block text-sm font-semibold text-slate-700 hover:text-blue-600 dark:text-slate-300 dark:hover:text-white transition py-1"
            >
              Features
            </a>
            <a
              href="#enterprise"
              onClick={() => setMobileMenuOpen(false)}
              className="block text-sm font-semibold text-slate-700 hover:text-blue-600 dark:text-slate-300 dark:hover:text-white transition py-1"
            >
              Enterprise Security
            </a>
            <a
              href="https://www.scalepods.co"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between text-sm font-semibold text-slate-700 hover:text-blue-600 dark:text-slate-300 dark:hover:text-white transition py-1"
            >
              <span>About ScalePods</span>
              <ArrowUpRight className="h-4 w-4 text-slate-400" />
            </a>
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-500">Already have an account?</span>
              <Link
                href="/auth?mode=signin"
                onClick={() => setMobileMenuOpen(false)}
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
              >
                Sign In →
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* ── Main Marketing Page Body ── */}
      <main className="relative z-10 flex-1 flex flex-col items-center">
        {/* ── 1. Hero Section ── */}
        <section className="w-full max-w-5xl mx-auto px-4 sm:px-6 pt-12 pb-14 sm:pt-20 sm:pb-24 text-center flex flex-col items-center">
          {/* Top Pill Badge */}
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-50 dark:border-blue-500/30 dark:bg-blue-500/10 px-4 py-1 text-xs font-semibold text-blue-600 dark:text-blue-400 backdrop-blur-md shadow-sm">
            <Sparkles className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400 animate-pulse" />
            <span>AI-Powered Talent Infrastructure</span>
          </div>

          {/* Hero Headline */}
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-[1.14] max-w-4xl mb-5">
            Automate the Screening.{" "}
            <span className="bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-500 dark:from-blue-400 dark:via-sky-300 dark:to-cyan-400 bg-clip-text text-transparent">
              Unlock Growth.
            </span>
          </h1>

          {/* Hero Subtitle */}
          <p className="text-sm sm:text-base lg:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl mb-8">
            We build AI-powered hiring automation solutions that automate repetitive candidate
            screening, evaluate competencies against open JDs, and help lean talent teams scale
            without complexity.
          </p>

          {/* Dual CTAs */}
          <div className="flex flex-col sm:flex-row items-center gap-3.5 w-full sm:w-auto mb-6">
            <Link
              href="/auth?mode=signup"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 px-6 py-3.5 text-sm font-semibold text-white shadow-xl shadow-blue-600/30 transition active:scale-[0.99]"
            >
              <span>Start Screening Free</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/auth?mode=signin"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 dark:border-slate-700/80 dark:bg-slate-900/60 dark:hover:bg-slate-900 dark:hover:border-slate-600 dark:text-white px-6 py-3.5 text-sm font-semibold shadow-sm transition active:scale-[0.99]"
            >
              <User className="h-4 w-4 text-blue-500 dark:text-blue-400" />
              <span>Sign In to Dashboard</span>
            </Link>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
            <span>✓ Free plan available</span>
            <span>•</span>
            <span>✓ Instant JD matching</span>
            <span>•</span>
            <span>✓ Enterprise security</span>
          </p>
        </section>

        {/* ── 2. Interactive SaaS Product Preview Dashboard ── */}
        <section id="solutions" className="w-full max-w-5xl mx-auto px-4 sm:px-6 pb-16 sm:pb-20">
          <div className="rounded-3xl border border-slate-200/90 bg-white/95 text-slate-900 shadow-xl shadow-slate-200/50 dark:border-slate-700/60 dark:bg-[#0E1628]/95 dark:text-white dark:shadow-2xl dark:shadow-blue-950/60 backdrop-blur-2xl p-4 sm:p-8 relative overflow-hidden transition-colors">
            {/* Top accent light */}
            <div className="absolute top-0 left-12 right-12 h-[1px] bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />

            {/* Mock Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white font-bold text-sm shadow-md shadow-blue-600/30">
                  JD
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white">
                      Full-Stack Engineering Lead
                    </h3>
                    <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                      Active Campaign
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Automated resume parsing & competency score against JD
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-xl border border-slate-200 bg-slate-100/80 px-3 py-1.5 text-xs text-slate-700 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-300 whitespace-nowrap">
                  Stage: <strong className="text-slate-900 dark:text-white">AI Screening</strong>
                </span>
                <Link
                  href="/auth?mode=signup"
                  className="rounded-xl bg-blue-600 hover:bg-blue-500 px-3.5 py-1.5 text-xs font-semibold text-white transition shadow-sm whitespace-nowrap"
                >
                  Create Campaign
                </Link>
              </div>
            </div>

            {/* Candidate Evaluation Grid */}
            <div className="pt-5 space-y-3">
              {/* Candidate 1 */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-slate-200/90 bg-slate-50/70 p-4 hover:border-slate-300 hover:bg-slate-100/70 dark:border-slate-800/80 dark:bg-slate-900/50 dark:hover:border-slate-700/80 dark:hover:bg-slate-900/70 transition">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white text-xs font-bold shadow-sm">
                    SL
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">Sarah Lin</p>
                      <span className="text-[10px] shrink-0 rounded-full bg-blue-500/10 border border-blue-500/25 px-2 py-0.5 text-blue-600 dark:text-blue-400 font-semibold">
                        Rank #1
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      8+ yrs experience · React, Next.js, Distributed Architecture
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-2.5 sm:gap-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200/70 dark:border-slate-800/80">
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-1 rounded-lg dark:text-emerald-400 whitespace-nowrap">
                    Strong Match
                  </span>
                  <span className="text-xs text-slate-700 font-medium bg-white px-3 py-1 rounded-lg border border-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700/50 whitespace-nowrap">
                    Advancing to Round 2 →
                  </span>
                </div>
              </div>

              {/* Candidate 2 */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-slate-200/90 bg-slate-50/70 p-4 hover:border-slate-300 hover:bg-slate-100/70 dark:border-slate-800/80 dark:bg-slate-900/50 dark:hover:border-slate-700/80 dark:hover:bg-slate-900/70 transition">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold shadow-sm">
                    AC
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">Alex Chen</p>
                      <span className="text-[10px] shrink-0 rounded-full bg-indigo-500/10 border border-indigo-500/25 px-2 py-0.5 text-indigo-600 dark:text-indigo-400 font-semibold">
                        Rank #2
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      6 yrs experience · Python, PostgreSQL, System Design
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-2.5 sm:gap-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200/70 dark:border-slate-800/80">
                  <span className="text-xs font-bold text-blue-600 bg-blue-500/10 border border-blue-500/25 px-2.5 py-1 rounded-lg dark:text-blue-400 whitespace-nowrap">
                    Qualified
                  </span>
                  <span className="text-xs text-slate-700 font-medium bg-white px-3 py-1 rounded-lg border border-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700/50 whitespace-nowrap">
                    Technical Assessment →
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── 3. Client Social Proof (Continuous Marquee with Hover-to-Pause & Auto-Resume) ── */}
        <section
          id="trusted-companies-section"
          onMouseLeave={() => setSelectedCompany(null)}
          className="w-full border-y border-slate-200 bg-slate-100/70 dark:border-slate-800/80 dark:bg-[#0B1020]/80 py-10 overflow-hidden relative transition-colors"
        >
          <style>{`
            @keyframes marqueeTape {
              0% { transform: translate3d(0, 0, 0); }
              100% { transform: translate3d(-50%, 0, 0); }
            }
            .marquee-track-auto {
              display: flex;
              width: max-content;
              animation: marqueeTape 28s linear infinite;
              will-change: transform;
            }
            .marquee-track-auto:hover {
              animation-play-state: paused !important;
            }
          `}</style>

          <div className="max-w-6xl mx-auto px-4 sm:px-6 text-center">
            <div className="flex items-center justify-center gap-3 mb-6">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                Trusted by high-growth companies and lean teams worldwide
              </p>
            </div>

            {/* Video Marquee Film Tape with Gradient Edge Masks */}
            <div
              className="relative w-full overflow-hidden py-3 select-none"
              onMouseLeave={() => setSelectedCompany(null)}
              style={{
                maskImage:
                  "linear-gradient(to right, transparent, black 12%, black 88%, transparent)",
                WebkitMaskImage:
                  "linear-gradient(to right, transparent, black 12%, black 88%, transparent)",
              }}
            >
              <div
                className="marquee-track-auto items-center gap-6 sm:gap-10"
                style={{
                  animationPlayState: selectedCompany ? "paused" : "running",
                }}
              >
                {/* Render double array for infinite loop */}
                {[...trustedCompanies, ...trustedCompanies].map((company, idx) => {
                  const isSelected = selectedCompany === company.name;
                  return (
                    <button
                      key={`${company.name}-${idx}`}
                      type="button"
                      onClick={() => toggleCompany(company.name)}
                      onMouseEnter={() => setSelectedCompany(company.name)}
                      data-selected-company={isSelected ? "true" : undefined}
                      aria-label={company.name}
                      className={`flex-shrink-0 flex items-center justify-center h-14 px-5 rounded-2xl border transition-all duration-300 cursor-pointer ${
                        isSelected
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-600/15 shadow-lg shadow-blue-500/20 scale-105"
                          : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800/80 dark:bg-slate-900/50 dark:hover:border-slate-700 dark:hover:bg-slate-900/90 opacity-80 hover:opacity-100 shadow-sm"
                      }`}
                    >
                      <img
                        src={company.logo}
                        alt={company.name}
                        className={`${company.h} w-auto object-contain pointer-events-none transition ${
                          company.raw ? "" : "dark:brightness-0 dark:invert"
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* ── 4. Concise Core Features Grid (Clean, Direct, Responsive) ── */}
        <section id="features" className="scroll-mt-24 w-full max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-12">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-50 dark:border-blue-500/30 dark:bg-blue-500/10 px-3.5 py-1 text-xs font-semibold text-blue-600 dark:text-blue-400">
              Platform Features
            </div>
            <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white mb-2">
              Everything built for modern hiring
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4 lg:gap-5">
            {/* Feature 1 */}
            <div className="rounded-2xl border border-slate-200/90 bg-white text-slate-900 shadow-sm hover:shadow-md hover:border-blue-400 dark:border-slate-700/60 dark:bg-[#0E1628]/85 dark:text-white dark:shadow-lg dark:hover:border-blue-500/50 dark:hover:bg-[#10192e] p-5 transition flex items-center gap-4">
              <div className="h-11 w-11 shrink-0 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <Cpu className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white">
                  AI Resume Scoring
                </h3>
                <p className="text-xs text-blue-600 dark:text-blue-400/90 font-medium">Automated JD Match & Ranking</p>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="rounded-2xl border border-slate-200/90 bg-white text-slate-900 shadow-sm hover:shadow-md hover:border-cyan-400 dark:border-slate-700/60 dark:bg-[#0E1628]/85 dark:text-white dark:shadow-lg dark:hover:border-cyan-500/50 dark:hover:bg-[#10192e] p-5 transition flex items-center gap-4">
              <div className="h-11 w-11 shrink-0 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-600 dark:text-cyan-400 flex items-center justify-center">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white">
                  Multi-Round Campaigns
                </h3>
                <p className="text-xs text-cyan-600 dark:text-cyan-400/90 font-medium">Screening, Tasks & Live Rounds</p>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="rounded-2xl border border-slate-200/90 bg-white text-slate-900 shadow-sm hover:shadow-md hover:border-indigo-400 dark:border-slate-700/60 dark:bg-[#0E1628]/85 dark:text-white dark:shadow-lg dark:hover:border-indigo-500/50 dark:hover:bg-[#10192e] p-5 transition flex items-center gap-4">
              <div className="h-11 w-11 shrink-0 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white">
                  Live Pipeline Analytics
                </h3>
                <p className="text-xs text-indigo-600 dark:text-indigo-400/90 font-medium">Funnel Velocity & Health</p>
              </div>
            </div>

            {/* Feature 4 */}
            <div className="rounded-2xl border border-slate-200/90 bg-white text-slate-900 shadow-sm hover:shadow-md hover:border-amber-400 dark:border-slate-700/60 dark:bg-[#0E1628]/85 dark:text-white dark:shadow-lg dark:hover:border-amber-500/50 dark:hover:bg-[#10192e] p-5 transition flex items-center gap-4">
              <div className="h-11 w-11 shrink-0 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white">
                  Automated Workflow Triggers
                </h3>
                <p className="text-xs text-amber-600 dark:text-amber-400/90 font-medium">Stage-Based Rules & Alerts</p>
              </div>
            </div>

            {/* Feature 5 */}
            <div className="rounded-2xl border border-slate-200/90 bg-white text-slate-900 shadow-sm hover:shadow-md hover:border-emerald-400 dark:border-slate-700/60 dark:bg-[#0E1628]/85 dark:text-white dark:shadow-lg dark:hover:border-emerald-500/50 dark:hover:bg-[#10192e] p-5 transition flex items-center gap-4">
              <div className="h-11 w-11 shrink-0 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <CalendarCheck className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white">
                  Candidate Portal & Booking
                </h3>
                <p className="text-xs text-emerald-600 dark:text-emerald-400/90 font-medium">Self-Serve Interview Slots</p>
              </div>
            </div>

            {/* Feature 6 */}
            <div className="rounded-2xl border border-slate-200/90 bg-white text-slate-900 shadow-sm hover:shadow-md hover:border-purple-400 dark:border-slate-700/60 dark:bg-[#0E1628]/85 dark:text-white dark:shadow-lg dark:hover:border-purple-500/50 dark:hover:bg-[#10192e] p-5 transition flex items-center gap-4">
              <div className="h-11 w-11 shrink-0 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white">
                  Role-Based Workspaces
                </h3>
                <p className="text-xs text-purple-600 dark:text-purple-400/90 font-medium">Granular Team RBAC Access</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── 5. Enterprise Security & Architecture ── */}
        <section id="enterprise" className="w-full max-w-5xl mx-auto px-4 sm:px-6 pb-16 sm:pb-20">
          <div className="rounded-3xl border border-slate-200 bg-white text-slate-900 shadow-lg shadow-slate-200/40 dark:border-slate-800 dark:bg-[#0B1020]/90 dark:text-white p-6 sm:p-10 text-center transition-colors">
            <div className="max-w-2xl mx-auto">
              <div className="h-12 w-12 rounded-2xl bg-blue-500/10 border border-blue-500/30 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto mb-4">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-3">
                Built for Enterprise Security & Data Privacy
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-6">
                Architected with enterprise-grade SOC-2 security protocols, end-to-end data encryption at rest and in transit, secure enterprise authentication, and strict multi-tenant isolation. Your candidate submissions and evaluation criteria are strictly private.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-xs text-slate-600 dark:text-slate-300">
                <span className="flex items-center gap-1.5 font-medium">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
                  Encrypted Candidate Data
                </span>
                <span className="flex items-center gap-1.5 font-medium">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
                  Role-Based Access Control (RBAC)
                </span>
                <span className="flex items-center gap-1.5 font-medium">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
                  Zero Data Training on Candidate Resumes
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ── 6. Closing Call to Action Banner ── */}
        <section className="w-full max-w-5xl mx-auto px-4 sm:px-6 pb-16 sm:pb-20">
          <div className="rounded-3xl border border-blue-200 bg-gradient-to-r from-blue-50 via-white to-blue-50 shadow-xl shadow-blue-100/50 dark:border-blue-500/30 dark:bg-gradient-to-r dark:from-blue-900/40 dark:via-[#0E1628] dark:to-blue-900/40 dark:shadow-2xl dark:shadow-blue-950/60 p-6 sm:p-12 text-center relative overflow-hidden transition-colors">
            <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-900 dark:text-white mb-3">
              Ready to automate your candidate screening?
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 max-w-xl mx-auto mb-8">
              Join forward-thinking recruiting teams and start screening candidates with precision
              today.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5">
              <Link
                href="/auth?mode=signup"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 px-7 py-3.5 text-sm font-semibold text-white shadow-xl shadow-blue-600/30 transition active:scale-[0.99]"
              >
                <span>Create Free Account</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/auth?mode=signin"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 dark:border-slate-700/80 dark:bg-slate-900/80 dark:hover:bg-slate-900 dark:text-white px-7 py-3.5 text-sm font-semibold transition active:scale-[0.99]"
              >
                <LogIn className="h-4 w-4 text-blue-500 dark:text-blue-400" />
                <span>Sign In to Platform</span>
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* ── Official ScalePods Footer ── */}
      <ScalePodsFooter onOpenLegal={openLegal} />

      {/* Interactive ScalePods Legal Dialog */}
      <LegalModal
        open={legalModalOpen}
        onOpenChange={setLegalModalOpen}
        tab={legalTab}
        onTabChange={setLegalTab}
      />
    </div>
  );
}
