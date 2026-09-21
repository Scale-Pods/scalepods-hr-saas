import { useEffect } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowUpRight, Info, X, XCircle } from "lucide-react";
import { useToasts, dismissToast } from "../hooks/useToast";
import { cn } from "../lib/cn";

/** Renders the global toast stack; tier toasts show the upgrade CTA. */
export function ToastHost() {
  const toasts = useToasts();

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const t of toasts) {
      timers.push(setTimeout(() => dismissToast(t.id), 6000));
    }
    return () => timers.forEach(clearTimeout);
  }, [toasts]);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-card p-4 shadow-lg",
            t.kind === "tier" && "border-warning/40",
            t.kind === "error" && "border-destructive/40",
            t.kind === "info" && "border-border"
          )}
        >
          <div className="mt-0.5 shrink-0">
            {t.kind === "tier" && (
              <AlertTriangle className="h-5 w-5 text-warning" aria-hidden />
            )}
            {t.kind === "error" && <XCircle className="h-5 w-5 text-destructive" aria-hidden />}
            {t.kind === "info" && <Info className="h-5 w-5 text-primary" aria-hidden />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">{t.title}</p>
            {t.message && <p className="mt-0.5 text-xs text-muted-foreground">{t.message}</p>}
            {t.action &&
              (t.action.href.startsWith("http") ? (
                <a
                  href={t.action.href}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-accent-foreground"
                >
                  {t.action.label} <ArrowUpRight className="h-3 w-3" />
                </a>
              ) : (
                <Link
                  to={t.action.href}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-accent-foreground"
                >
                  {t.action.label} <ArrowUpRight className="h-3 w-3" />
                </Link>
              ))}
          </div>
          <button
            onClick={() => dismissToast(t.id)}
            aria-label="Dismiss"
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}