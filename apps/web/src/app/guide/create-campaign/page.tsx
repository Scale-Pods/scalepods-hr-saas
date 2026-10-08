import { ArrowRight, CheckCircle2, Lightbulb, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { GuideImageZoom } from "@/components/guide/GuideImageZoom";

export const metadata: Metadata = {
  title: "How to Create a Hiring Campaign | ScalePods",
  description:
    "Step-by-step guide to launching a hiring campaign in ScalePods with AI interviews, rounds, and outreach cadence.",
};

interface StepItem {
  num: number;
  title: string;
  text: string;
  image: string;
  alt: string;
  width: number;
  height: number;
  tips?: string[];
}

interface GuideSection {
  id: string;
  label: string;
  intro: string;
  steps: StepItem[];
}

const sections: GuideSection[] = [
  {
    id: "start",
    label: "Getting started",
    intro: "Open the campaign creator from the dashboard or the Campaigns page.",
    steps: [
      {
        num: 1,
        title: "Click Create Campaign on the Dashboard",
        text: "From the Recruiter dashboard, press Create Campaign in the welcome card to open the AI Campaign Creation Studio.",
        image: "01-dashboard.png",
        alt: "ScalePods Recruiter dashboard showing the Create Campaign button in the welcome card",
        width: 1917,
        height: 917,
      },
      {
        num: 2,
        title: "Or start from the Campaigns page",
        text: "Open Campaigns in the sidebar, then click New Campaign (top right).",
        image: "02-campaigns-list.png",
        alt: "ScalePods Campaigns overview page with New Campaign button at the top right",
        width: 1917,
        height: 892,
        tips: ["Each card shows status, candidates in pipeline and number of interview rounds."],
      },
    ],
  },
  {
    id: "basics",
    label: "Step 1 · Basics",
    intro:
      "Define the role. ScalePods AI calibrates screening rubrics and interview questions from this.",
    steps: [
      {
        num: 3,
        title: "Open the setup wizard",
        text: "The wizard has three tabs: Basics, Rounds, Reach-out. The plan limit (e.g. Enterprise: up to 6 interview stages per role) is shown at the top.",
        image: "03-basics-top.png",
        alt: "AI Campaign Creation Studio wizard header showing Basics, Rounds, and Reach-out tabs with plan limits",
        width: 1917,
        height: 876,
      },
      {
        num: 4,
        title: "Fill in role, job description and dates",
        text: "Campaign name and role title, job description (paste or Upload Document), total evaluation rounds, target start and end date.",
        image: "04-basics-form.png",
        alt: "Campaign basics form with role title, job description input, and date picker",
        width: 1916,
        height: 877,
        tips: [
          "The JD is used to auto-generate candidate evaluation scores (0 to 100).",
          "Click Continue to Interview Rounds when done.",
        ],
      },
    ],
  },
  {
    id: "rounds",
    label: "Step 2 · Rounds",
    intro: "Choose the format for each interview round and its daily availability.",
    steps: [
      {
        num: 5,
        title: "Configure Round 1",
        text: "Rounds run sequentially. For Live AI Interview set the daily window (earliest and latest slot).",
        image: "05-rounds-overview.png",
        alt: "Rounds configuration interface for Round 1 Live AI Interview with daily slot time window",
        width: 1913,
        height: 872,
      },
      {
        num: 6,
        title: "Pick a format for every round",
        text: "Options: Live AI Interview, AI Voice Call Screening, Live Human Interview, Practical Assignment.",
        image: "06-format-dropdown.png",
        alt: "Interview format dropdown menu with options for Live AI Interview, AI Voice Call Screening, Live Human Interview, and Practical Assignment",
        width: 977,
        height: 234,
      },
      {
        num: 7,
        title: "Live Human Interview",
        text: "Enter the lead interviewer's email so calendar invites and video links are scheduled against them; set their daily availability window.",
        image: "07-round-human.png",
        alt: "Live Human Interview setup screen with lead interviewer email and availability window",
        width: 1917,
        height: 867,
      },
      {
        num: 8,
        title: "Practical Assignment",
        text: "Write the assignment prompt and submission guidelines; set the submission deadline in hours (e.g. 72 = 3 days). Then click Continue to Communication Channels.",
        image: "08-round-assignment.png",
        alt: "Practical Assignment round setup with prompt guidelines and submission deadline in hours",
        width: 1917,
        height: 880,
      },
    ],
  },
  {
    id: "reachout",
    label: "Step 3 · Reach-out",
    intro: "Decide how candidates are contacted and reminded.",
    steps: [
      {
        num: 9,
        title: "Choose outreach channels",
        text: "Toggle Automated Email, WhatsApp Instant Messaging and AI Voice Screening Phone Call.",
        image: "09-channels.png",
        alt: "Outreach channels configuration toggling Automated Email, WhatsApp Instant Messaging, and AI Voice Screening Phone Call",
        width: 1917,
        height: 875,
      },
      {
        num: 10,
        title: "Set up the AI Voice Agent",
        text: "Voice, speaking pace, pitch, expressiveness, noise handling, system prompt, opening greeting, latency and functions. Editable after launch.",
        image: "10-voice-agent.png",
        alt: "AI Voice Agent configuration editor for voice style, pitch, greeting, and system prompt",
        width: 1912,
        height: 871,
      },
      {
        num: 11,
        title: "Review the communication cadence",
        text: "The sequence repeats for every round and is auto-tailored to campaign duration. Edit timing, tick or untick stages, see channels per stage.",
        image: "11-cadence-top.png",
        alt: "Automated candidate communication cadence preview table displaying stages, schedule, and channels",
        width: 1917,
        height: 876,
      },
      {
        num: 12,
        title: "Add custom steps and publish",
        text: "Add custom reminder steps at the bottom, then click Deploy & Publish Campaign.",
        image: "12-cadence-deploy.png",
        alt: "Deploy and publish campaign button with options to add custom cadence reminder steps",
        width: 1911,
        height: 872,
        tips: ["Campaigns can be paused or resumed from the Campaigns page."],
      },
    ],
  },
];

export default function CreateCampaignGuidePage() {
  return (
    <div className="min-h-screen bg-[#0b1020] text-[#e6ebf5] selection:bg-[#2f6bff]/30 selection:text-white">
      {/* Top Banner Navigation */}
      <header className="border-b border-[#232c47]/80 bg-[#0b1020]/80 backdrop-blur-md sticky top-0 z-30">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-bold tracking-tight text-white hover:text-[#60a5fa] transition-colors"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#2f6bff]/20 text-[#60a5fa] border border-[#2f6bff]/40">
              <Sparkles className="h-4 w-4" />
            </div>
            <span>ScalePods</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/campaigns"
              className="inline-flex items-center gap-1.5 rounded-full bg-[#2f6bff] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#2558d9] transition-colors shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f6bff]"
            >
              <span>Go to Campaigns</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:py-16">
        {/* Hero Section */}
        <header className="text-left space-y-4">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[#2f6bff]/40 bg-[#2f6bff]/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[#60a5fa]">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            ScalePods Guide
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
            How to create a hiring campaign
          </h1>
          <p className="text-base sm:text-lg text-[#9aa6bf] max-w-2xl leading-relaxed">
            Three stages, about five minutes: Basics, Rounds and Reach-out.
          </p>

          {/* Jump-menu Navigation */}
          <nav aria-label="Guide sections" className="mt-6 flex flex-wrap items-center gap-2 pt-2">
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="inline-flex items-center rounded-full border border-[#232c47] bg-[#141b30] px-3.5 py-1.5 text-xs font-medium text-[#cbd5ea] hover:border-[#2f6bff]/60 hover:bg-[#2f6bff]/10 hover:text-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f6bff]"
              >
                {s.label}
              </a>
            ))}
          </nav>

          <div className="pt-2">
            <Link
              href="/campaigns"
              className="inline-flex items-center gap-2 rounded-xl bg-[#2f6bff] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#2558d9] transition-all shadow-md hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f6bff]"
            >
              <span>Go to Campaigns</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </header>

        {/* 4 Step Sections */}
        <div className="mt-14 space-y-16 sm:space-y-20">
          {sections.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-24 space-y-8">
              {/* Section Header */}
              <div className="border-b border-[#232c47] pb-3">
                <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  {section.label}
                </h2>
                <p className="mt-1.5 text-sm text-[#9aa6bf] leading-relaxed">{section.intro}</p>
              </div>

              {/* Numbered Steps */}
              <div className="space-y-12">
                {section.steps.map((step) => (
                  <article
                    key={step.num}
                    className="flex flex-col sm:flex-row gap-4 sm:gap-6 rounded-2xl border border-[#232c47]/60 bg-[#10172a]/60 p-4 sm:p-6 backdrop-blur-xs"
                  >
                    {/* Number Badge */}
                    <div className="shrink-0">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2f6bff] text-sm font-bold text-white shadow-sm ring-4 ring-[#2f6bff]/20">
                        {step.num}
                      </div>
                    </div>

                    {/* Step Content */}
                    <div className="flex-1 min-w-0 space-y-3">
                      <div>
                        <h3 className="text-lg font-bold text-white sm:text-xl">{step.title}</h3>
                        <p className="mt-1 text-sm text-[#b6c0d6] leading-relaxed">{step.text}</p>
                      </div>

                      {/* Tips list if present */}
                      {step.tips && step.tips.length > 0 && (
                        <div className="rounded-xl border border-[#232c47] bg-[#141b30]/80 p-3 text-xs text-[#9aa6bf]">
                          <div className="flex items-center gap-1.5 font-semibold text-[#60a5fa] mb-1">
                            <Lightbulb className="h-3.5 w-3.5 shrink-0" />
                            <span>Pro tip:</span>
                          </div>
                          <ul className="space-y-1 pl-4 list-disc marker:text-[#60a5fa]">
                            {step.tips.map((tip) => (
                              <li key={tip}>{tip}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Screenshot with Click to Enlarge Lightbox */}
                      <GuideImageZoom
                        src={`/guide/create-campaign/${step.image}`}
                        alt={step.alt}
                        width={step.width}
                        height={step.height}
                        priority={step.num <= 2}
                      />
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Closing CTA */}
        <footer className="mt-20 border-t border-[#232c47] pt-12 text-center space-y-4">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#2f6bff]/20 text-[#60a5fa] border border-[#2f6bff]/30 mb-2">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <h2 className="text-2xl font-bold text-white sm:text-3xl">
            Ready to hire with ScalePods AI?
          </h2>
          <p className="text-sm text-[#9aa6bf] max-w-md mx-auto">
            Launch your campaign in minutes and let conversational AI evaluate your candidate
            pipeline 24/7.
          </p>
          <div className="pt-2">
            <Link
              href="/campaigns"
              className="inline-flex items-center gap-2 rounded-xl bg-[#2f6bff] px-6 py-3 text-sm font-semibold text-white hover:bg-[#2558d9] transition-all shadow-lg hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f6bff]"
            >
              <span>Create your campaign →</span>
            </Link>
          </div>
        </footer>
      </main>
    </div>
  );
}
