import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import { ToastHost } from "./components/ToastHost";
import { AppRoutes } from "./routes";
import { ThemeProvider } from "./lib/theme";
import { isSupabaseConfigured } from "./lib/supabase";
import { Logo } from "./components/Logo";

function SetupScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <Logo size="lg" />
      <h1 className="text-base font-semibold text-foreground">
        ScalePods is not configured yet
      </h1>
      <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
        Copy{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">
          .env.example
        </code>{" "}
        to{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">.env</code>{" "}
        and set{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">
          VITE_SUPABASE_URL
        </code>{" "}
        and{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">
          VITE_SUPABASE_ANON_KEY
        </code>{" "}
        in the project root, then reload.
      </p>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      {isSupabaseConfigured() ? (
        <BrowserRouter>
          <AuthProvider>
            <AppRoutes />
            <ToastHost />
          </AuthProvider>
        </BrowserRouter>
      ) : (
        <SetupScreen />
      )}
    </ThemeProvider>
  );
}