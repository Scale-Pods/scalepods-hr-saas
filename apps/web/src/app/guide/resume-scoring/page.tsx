import { ArrowRight, BrainCircuit, CheckCircle2, Lightbulb } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "How Resume Scoring Works | ScalePods",
  description:
    "Learn how our AI-powered resume screening evaluates candidates to find the best fit for your job.",
};

interface StepItem {
  num: number;
  title: string;
  text: string;
  code?: string;
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
    id: "overview",
    label: "Understanding Your Candidate",
    intro:
      "The scoring process starts the moment a candidate's resume is uploaded. We compare their experience directly to what you're looking for.",
    steps: [
      {
        num: 1,
        title: "Reading the Job Description",
        text: "First, our AI carefully reads the job description you provided when creating the campaign. It identifies the core skills, required experience, and specific qualifications needed to succeed in the role.",
      },
      {
        num: 2,
        title: "Analyzing the Resume",
        text: "Next, we extract all the text from the candidate's uploaded resume, ensuring we capture their full work history, education, and listed skills without missing any details.",
      },
    ],
  },
  {
    id: "evaluation",
    label: "The Evaluation Process",
    intro:
      "Our advanced AI models step into the shoes of an expert recruiter to evaluate the match.",
    steps: [
      {
        num: 3,
        title: "Objective Screening",
        text: "We instruct our AI to act as a professional resume screener. It looks at the candidate's extracted resume side-by-side with your job description to see how well they align.",
      },
      {
        num: 4,
        title: "Scoring from 0 to 100",
        text: "The AI calculates a precise fit score from 0 to 100. A score of 100 means the candidate is a perfect match for all your requirements, while a lower score indicates they might be missing some key qualifications.",
      },
    ],
  },
  {
    id: "results",
    label: "Clear & Actionable Results",
    intro:
      "We don't just give you a number. We tell you exactly why a candidate received their score.",
    steps: [
      {
        num: 5,
        title: "The Rationale",
        text: "Along with the score, you receive a clear, plain-English summary explaining the reasoning behind it. This highlights the candidate's strongest matching points and points out what they might be lacking.",
      },
      {
        num: 6,
        title: "Skill Extraction",
        text: "We also provide a neat list of the most relevant skills found on the candidate's resume, making it easy for you to see their strengths at a glance.",
        tips: [
          "Use these scores and rationales to quickly decide who moves forward to the next interview round!",
        ],
      },
    ],
  },
];

export default function ResumeScoringGuidePage() {
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
              <BrainCircuit className="h-4 w-4" />
            </div>
            <span>ScalePods</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 rounded-full bg-[#2f6bff] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#2558d9] transition-colors shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f6bff]"
            >
              <span>Dashboard</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:py-16">
        {/* Hero Section */}
        <header className="text-left space-y-4">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[#2f6bff]/40 bg-[#2f6bff]/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[#60a5fa]">
            <BrainCircuit className="h-3.5 w-3.5" aria-hidden="true" />
            ScalePods Guide
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
            How AI Resume Scoring Works
          </h1>
          <p className="text-base sm:text-lg text-[#9aa6bf] max-w-2xl leading-relaxed">
            A simple breakdown of how our AI evaluates candidates to find the best fit for your job.
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
        </header>

        {/* Sections */}
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

                      {/* Code Block if present */}
                      {step.code && (
                        <div className="mt-3 rounded-xl border border-[#232c47] bg-[#0b1020] overflow-hidden">
                          <pre className="p-4 text-xs sm:text-sm text-[#cbd5ea] whitespace-pre-wrap font-mono">
                            {step.code}
                          </pre>
                        </div>
                      )}

                      {/* Tips list if present */}
                      {step.tips && step.tips.length > 0 && (
                        <div className="rounded-xl border border-[#232c47] bg-[#141b30]/80 p-3 text-xs text-[#9aa6bf] mt-3">
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
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Closing CTA */}
        <footer className="mt-20 border-t border-[#232c47] pt-12 text-center space-y-4 pb-20">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#2f6bff]/20 text-[#60a5fa] border border-[#2f6bff]/30 mb-2">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <h2 className="text-2xl font-bold text-white sm:text-3xl">
            Streamline Your Hiring Process
          </h2>
          <p className="text-sm text-[#9aa6bf] max-w-md mx-auto">
            Our AI scoring provides unbiased, accurate candidate assessment out-of-the-box.
          </p>
          <div className="pt-2">
            <Link
              href="/campaigns"
              className="inline-flex items-center gap-2 rounded-xl bg-[#2f6bff] px-6 py-3 text-sm font-semibold text-white hover:bg-[#2558d9] transition-all shadow-lg hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2f6bff]"
            >
              <span>Back to Campaigns →</span>
            </Link>
          </div>
        </footer>
      </main>
    </div>
  );
}
