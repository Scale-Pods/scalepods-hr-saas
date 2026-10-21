"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { ThemeProvider } from "next-themes";
import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { makeQueryClient } from "@/lib/query-client";

const ReactQueryDevtools = dynamic(
  () => import("@tanstack/react-query-devtools").then((mod) => mod.ReactQueryDevtools),
  { ssr: false },
);

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(makeQueryClient);

  // Suppress harmless third-party Chrome extension errors from polluting the dev console
  useEffect(() => {
    const handleRejection = (event: PromiseRejectionEvent) => {
      const msg = event.reason?.message || String(event.reason || "");
      if (
        msg.includes("A listener indicated an asynchronous response") ||
        msg.includes("codes.forEach is not a function") ||
        msg.includes("chrome-extension://")
      ) {
        event.preventDefault();
      }
    };

    const handleError = (event: ErrorEvent) => {
      const msg = event.message || "";
      const filename = event.filename || "";
      if (
        msg.includes("codes.forEach is not a function") ||
        msg.includes("chrome-extension://") ||
        filename.includes("content_script") ||
        filename.includes("chrome-extension")
      ) {
        event.preventDefault();
      }
    };

    window.addEventListener("unhandledrejection", handleRejection);
    window.addEventListener("error", handleError);
    return () => {
      window.removeEventListener("unhandledrejection", handleRejection);
      window.removeEventListener("error", handleError);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
      </ThemeProvider>
      <Toaster richColors closeButton position="top-right" />
      {process.env.NODE_ENV === "development" ? <ReactQueryDevtools initialIsOpen={false} /> : null}
    </QueryClientProvider>
  );
}
