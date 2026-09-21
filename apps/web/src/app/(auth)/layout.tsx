import { Logo } from "@/components/shared/Logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted px-4">
      <div className="mb-6 flex items-center gap-2">
        <Logo />
        <span className="text-xl font-semibold text-foreground">ScalePods</span>
      </div>
      {children}
    </div>
  );
}
