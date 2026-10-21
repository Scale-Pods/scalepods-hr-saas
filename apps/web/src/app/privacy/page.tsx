import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Mail, Shield } from "lucide-react";
import { ScalePodsFooter } from "@/components/shared/ScalePodsFooter";
import { PRIVACY_POLICY } from "@/lib/legal-content";

export const metadata: Metadata = {
  title: "Privacy Policy | ScalePods",
  description:
    "Read the ScalePods Privacy Policy. Learn how we collect, protect, and handle data across our website and automated AI workflow platforms.",
};

export default function PrivacyPage() {
  const doc = PRIVACY_POLICY;

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-200 antialiased selection:bg-blue-500 selection:text-white">
      {/* Top Navigation */}
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-[#090d16]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <Link href="/auth" className="flex items-center gap-3 group">
            <img
              src="/brand/scalepods-navbar-logo.png"
              alt="ScalePods"
              className="h-8 w-auto object-contain brightness-0 invert drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]"
            />
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/terms"
              className="text-xs font-semibold text-slate-400 hover:text-white transition"
            >
              Terms of Service
            </Link>
            <Link
              href="/auth"
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600/20 border border-blue-500/30 px-3 py-1.5 text-xs font-semibold text-blue-400 hover:bg-blue-600/30 hover:text-white transition"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to App</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-4xl px-6 py-16">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3.5 py-1 text-xs font-semibold text-blue-400">
          <Shield className="h-3.5 w-3.5" />
          <span>ScalePods Legal Document</span>
        </div>

        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-white mb-3">
          {doc.title}
        </h1>
        <p className="text-sm text-slate-400 mb-8">Last updated on {doc.lastUpdated}</p>

        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-sm text-slate-300 leading-relaxed mb-12">
          {doc.intro}
        </div>

        <div className="space-y-10">
          {doc.sections.map((section) => (
            <section key={section.title} className="space-y-3">
              <h2 className="text-xl font-bold text-white tracking-tight">{section.title}</h2>

              {section.subsections?.map((sub) => (
                <div key={sub.title} className="pl-4 border-l border-white/15 space-y-1.5 my-3">
                  <h3 className="text-base font-semibold text-blue-300">{sub.title}</h3>
                  <p className="text-sm text-slate-300 leading-relaxed">{sub.content}</p>
                </div>
              ))}

              {section.paragraphs?.map((p, idx) => (
                <p key={idx} className="text-sm text-slate-300 leading-relaxed">
                  {p}
                </p>
              ))}

              {section.listItems && (
                <ul className="list-disc pl-6 space-y-2 text-sm text-slate-300">
                  {section.listItems.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        {/* Contact Banner */}
        <div className="mt-16 rounded-2xl border border-blue-500/20 bg-gradient-to-r from-blue-950/40 to-transparent p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-white">Have questions about our Privacy Policy?</h3>
            <p className="text-sm text-slate-400 mt-1">
              Reach out directly to our compliance and privacy operations team.
            </p>
          </div>
          <a
            href={`mailto:${doc.contactEmail}`}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-blue-500/25 hover:bg-blue-500 transition"
          >
            <Mail className="h-4 w-4" />
            <span>{doc.contactEmail}</span>
          </a>
        </div>
      </main>

      {/* Official ScalePods Footer */}
      <ScalePodsFooter />
    </div>
  );
}
