import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  Bot,
  CalendarClock,
  Check,
  ClipboardCheck,
  FileSearch,
  Gauge,
  Layers,
  Mail,
  Mic,
  Quote,
  ShieldCheck,
  Star,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { Logo } from "../components/Logo";
import { Button } from "../components/ui/Button";
import { ThemeToggle } from "../components/ThemeToggle";

const PILLARS = [
  {
    icon: FileSearch,
    badge: "Hiring Cloud",
    tagline: "From resume to screened in seconds",
    tint: "bg-accent text-accent-foreground",
    features: [
      {
        icon: FileSearch,
        title: "Resume screening",
        body: "Upload a resume and the intake workflow extracts text, scores it against the role and queues it in your pipeline.",
      },
      {
        icon: Mic,
        title: "Voice screens",
        body: "Run live voice screenings for high-volume pipelines and get structured call decisions back.",
      },
      {
        icon: ClipboardCheck,
        title: "Take-home assignments",
        body: "Send token-gated assignment links and let the scoring service evaluate answers end-to-end.",
      },
    ],
  },
  {
    icon: Bot,
    badge: "Interview Cloud",
    tagline: "Interviews that run themselves",
    tint: "bg-secondary text-secondary-foreground",
    features: [
      {
        icon: Bot,
        title: "AI interviews",
        body: "An AI interviewer adapts to every answer, then grades automatically — no calendar juggling for first rounds.",
      },
      {
        icon: CalendarClock,
        title: "Self-serve booking",
        body: "Candidates pick their own slots from secure booking links, with rescheduling built in.",
      },
      {
        icon: Users,
        title: "Panel alignment",
        body: "Interviewers are matched to rounds so the right people review the right candidates.",
      },
    ],
  },
  {
    icon: Gauge,
    badge: "Pipeline Cloud",
    tagline: "Know what's converting, always",
    tint: "bg-muted text-primary",
    features: [
      {
        icon: BarChart3,
        title: "Pipeline reporting",
        body: "A live dashboard tracks your funnel, time-to-hire and source effectiveness in real time.",
      },
      {
        icon: Layers,
        title: "Decision ledger",
        body: "Every move — screening, interview, override — is recorded and ready for audit.",
      },
      {
        icon: Zap,
        title: "Tiered usage & billing",
        body: "Credit-based allowances per tier, with clear overage behaviour and a billing portal.",
      },
    ],
  },
] as const;

const WHY = [
  {
    icon: TrendingUp,
    title: "AI-first screening",
    body: "Screening, interviews and assignment scoring are automated end to end, not bolted on.",
  },
  {
    icon: Layers,
    title: "All-in-one suite",
    body: "Hiring, interviews, assignments and reporting live in one platform — no tool sprawl.",
  },
  {
    icon: Zap,
    title: "Pay as you grow",
    body: "Clear credit-based tiers with transparent overage; upgrade whenever you need to.",
  },
  {
    icon: ShieldCheck,
    title: "Built for transparency",
    body: "A full decision ledger and token-gated candidate links keep every hire auditable.",
  },
] as const;

const TESTIMONIALS = [
  {
    quote:
      "We replaced a stack of spreadsheets and scheduling links with ScalePods. AI interviews took first-round screening off my calendar completely.",
    name: "Alina R.",
    role: "Talent Lead, Series B SaaS",
  },
  {
    quote:
      "The funnel report finally shows which sourcing channels actually convert. I can defend every hire decision with the ledger.",
    name: "Marcus T.",
    role: "Recruiting Manager, Tech Startup",
  },
  {
    quote:
      "Voice screens and take-home assignments run on autopilot. My team reviews structured results instead of chasing candidates for reschedules.",
    name: "Priya S.",
    role: "Head of People, Scale-up",
  },
] as const;

const TRUST_NAMES = ["Startups", "Agencies", "Scale-ups", "Enterprise HR"] as const;

export function Home() {
  return (
    <div className="keka-landing flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <span className="rounded-xl border border-border bg-card p-1.5">
              <Logo size="sm" />
            </span>
            <span className="text-base font-semibold text-foreground">ScalePods</span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link to="/auth">
              <Button variant="ghost" size="sm">Log in</Button>
            </Link>
            <Link to="/auth">
              <Button size="sm">Sign up</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-32 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-gradient-to-br from-primary/20 via-secondary to-accent blur-3xl"
          />

          <div className="relative mx-auto w-full max-w-6xl px-4 pt-16 text-center sm:px-6 sm:pt-24">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
              Claude Partner Network · Official Services Partner
            </span>
            <h1 className="mx-auto mt-5 max-w-4xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-[3.4rem] lg:leading-[1.1]">
              Automate the busywork.{" "}
              <span className="rounded-lg bg-accent px-2 text-accent-foreground">
                Unlock growth.
              </span>
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              ScalePods screens resumes, runs AI interviews and take-home
              assignments, and reports on every stage of your pipeline — so your
              recruiting team stays lean while you scale.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link to="/auth">
                <Button size="lg" className="rounded-full">
                  Create your free workspace
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Button>
              </Link>
              <Link to="/auth">
                <Button variant="secondary" size="lg" className="rounded-full">
                  Log in to your account
                </Button>
              </Link>
            </div>
            <p className="mt-5 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-success" aria-hidden />
              Free plan included · No credit card required · Cancel anytime
            </p>
          </div>

          <div className="relative mx-auto w-full max-w-6xl px-4 pb-14 pt-12 sm:px-6">
            <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-2xl shadow-primary/10">
              <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2.5">
                <span className="h-3 w-3 rounded-full bg-rose-400" aria-hidden />
                <span className="h-3 w-3 rounded-full bg-warning" aria-hidden />
                <span className="h-3 w-3 rounded-full bg-success" aria-hidden />
                <span className="ml-2 truncate rounded-md bg-card px-3 py-0.5 text-xs text-muted-foreground">
                  app.scalepods.co/dashboard
                </span>
              </div>
              <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-5">
                <div className="lg:col-span-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md border border-border bg-card p-1.5">
                        <Logo size="sm" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-foreground">ScalePods workspace</p>
                        <p className="text-xs text-muted-foreground">Pipeline snapshot</p>
                      </div>
                    </div>
                    <span className="rounded-full bg-success/20 px-2.5 py-1 text-xs font-medium text-accent-foreground">
                      Live
                    </span>
                  </div>
                  <div className="mt-5 space-y-3">
                    {[
                      { label: "Resume screens", value: 128, pct: 100, tint: "bg-primary" },
                      { label: "AI interviews", value: 42, pct: 62, tint: "bg-success" },
                      { label: "Assignments sent", value: 19, pct: 38, tint: "bg-secondary-foreground" },
                      { label: "Offers accepted", value: 6, pct: 14, tint: "bg-warning" },
                    ].map((row) => (
                      <div key={row.label} className="flex items-center gap-3">
                        <span className="w-44 shrink-0 text-left text-xs text-muted-foreground">
                          {row.label}
                        </span>
                        <div className="h-6 flex-1 overflow-hidden rounded-md bg-muted">
                          <div
                            className={`flex h-full items-center justify-end rounded-md ${row.tint} pr-2 transition-[width]`}
                            style={{ width: `${row.pct}%` }}
                          >
                            <span className="text-xs font-semibold text-primary-foreground">{row.value}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 lg:col-span-2 lg:grid-cols-1">
                  <div className="rounded-xl border border-border bg-muted/40 p-4">
                    <p className="text-xs text-muted-foreground">Candidates this week</p>
                    <p className="mt-1 text-2xl font-semibold text-foreground">239</p>
                    <p className="mt-0.5 text-xs font-medium text-success">+18% vs last week</p>
                  </div>
                  <div className="rounded-xl border border-border bg-muted/40 p-4">
                    <p className="text-xs text-muted-foreground">Time to hire</p>
                    <p className="mt-1 text-2xl font-semibold text-foreground">9.4 days</p>
                    <p className="mt-0.5 text-xs font-medium text-warning">-3.1 days this quarter</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          className="mx-auto w-full max-w-6xl px-4 pb-10 sm:px-6"
          aria-label="Trusted by"
        >
          <p className="text-center text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Trusted by thousands of companies and investors around the world
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-9 gap-y-3 text-sm font-semibold text-muted-foreground/80">
            {TRUST_NAMES.map((name) => (
              <span key={name} className="tracking-wide">
                {name}
              </span>
            ))}
          </div>
        </section>

        <section
          className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6"
          aria-label="Product"
        >
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              One platform, three clouds
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Everything your recruiting team needs to hire and close
            </h2>
          </div>

          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {PILLARS.map((pillar) => {
              const PillarIcon = pillar.icon;
              return (
                <div
                  key={pillar.badge}
                  className="flex flex-col rounded-2xl border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-lg ${pillar.tint}`}
                    >
                      <PillarIcon className="h-5 w-5" aria-hidden />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{pillar.badge}</p>
                      <p className="text-xs text-muted-foreground">{pillar.tagline}</p>
                    </div>
                  </div>
                  <ul className="mt-5 space-y-4">
                    {pillar.features.map((f) => {
                      const FeatureIcon = f.icon;
                      return (
                        <li key={f.title} className="flex gap-3">
                          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-primary">
                            <FeatureIcon className="h-3.5 w-3.5" aria-hidden />
                          </span>
                          <div>
                            <p className="text-sm font-medium text-foreground">{f.title}</p>
                            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                              {f.body}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>

        <section className="border-y border-border bg-muted/40">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">
                Why ScalePods
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                The modern alternative to manual recruiting
              </h2>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {WHY.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <h3 className="mt-3 text-sm font-semibold text-foreground">{item.title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.body}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6" aria-label="Testimonials">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              Loved by hiring teams
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Built for fast-moving recruiting teams
            </h2>
          </div>
          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {TESTIMONIALS.map((t) => (
              <figure
                key={t.name}
                className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm"
              >
                <div>
                  <Quote className="h-5 w-5 text-primary" aria-hidden />
                  <blockquote className="mt-3 text-sm leading-relaxed text-foreground">
                    {t.quote}
                  </blockquote>
                </div>
                <figcaption className="mt-4 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.role}</p>
                  </div>
                  <span className="flex shrink-0 items-center gap-0.5 text-warning">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className="h-3.5 w-3.5" fill="currentColor" aria-hidden />
                    ))}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6">
          <div className="flex flex-col items-center rounded-2xl bg-foreground px-6 py-12 text-center text-background shadow-sm">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-success/20 text-success">
              <Check className="h-6 w-6" aria-hidden />
            </span>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
              Ready to automate smarter?
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-background/70">
              Let's build together. Set up your free workspace in minutes and let
              ScalePods handle screening, interviewing and reporting.
            </p>
            <Link to="/auth" className="mt-6">
              <Button size="lg" className="rounded-full bg-success text-background hover:bg-success/90">
                Start growing with ScalePods
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 lg:flex-row lg:justify-between">
          <div className="max-w-xs">
            <Link to="/" className="flex items-center gap-2">
              <span className="rounded-xl border border-border bg-card p-1.5">
                <Logo size="sm" />
              </span>
              <span className="text-base font-semibold text-foreground">ScalePods</span>
            </Link>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Architecting the future of enterprise operations through autonomous
              agentic AI ecosystems.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-foreground">
                Solutions
              </p>
              <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
                <li>HR Automation</li>
                <li>Sales Automation</li>
                <li>Ops Automation</li>
                <li>Real Estate AI</li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-foreground">
                Platform
              </p>
              <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
                <li>Case Studies</li>
                <li>Integrations</li>
                <li>Pricing</li>
                <li>Blog</li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-foreground">
                Connect
              </p>
              <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
                <li>
                  <a
                    href="mailto:info@scalepods.co"
                    className="flex items-center gap-1.5 hover:text-foreground"
                  >
                    <Mail className="h-3.5 w-3.5" aria-hidden />
                    info@scalepods.co
                  </a>
                </li>
                <li>Book a free call</li>
                <li>Privacy Policy</li>
                <li>Terms of Service</li>
              </ul>
            </div>
          </div>
        </div>
        <div className="border-t border-border px-4 py-4 sm:px-6">
          <p className="mx-auto max-w-6xl text-center text-xs text-muted-foreground">
            © 2026 ScalePods AI Infrastructure. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}