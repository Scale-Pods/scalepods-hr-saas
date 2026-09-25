import { Logo } from "@/components/shared/Logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="mb-7 flex items-center gap-2">
        <Logo />
        <span className="text-2xl font-bold tracking-[-0.022em] text-foreground">ScalePods</span>
      </div>
      {children}
    </div>
  );
}
