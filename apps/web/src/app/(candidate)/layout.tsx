import { Logo } from "@/components/shared/Logo";

export const metadata = {
  title: "ScalePods Interview",
};

export default function CandidateLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-3">
          <Logo />
          <span className="text-sm font-semibold text-foreground">ScalePods</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-10">{children}</main>
      <footer className="mx-auto max-w-2xl px-4 pb-8 text-center text-xs text-muted-foreground">
        Powered by ScalePods
      </footer>
    </div>
  );
}
