import { Logo } from "@/components/shared/Logo";

export const metadata = {
  title: "ScalePods Interview",
};

export default function CandidateLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border/60 bg-glass/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-3">
          <Logo />
          <span className="text-sm font-semibold tracking-[-0.022em] text-foreground">
            ScalePods
          </span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">{children}</main>
      <footer className="mx-auto max-w-2xl px-4 pb-8 text-center text-xs text-label-tertiary">
        Powered by ScalePods
      </footer>
    </div>
  );
}
