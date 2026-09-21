import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { AuthError } from "@supabase/supabase-js";
import { browserClient } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import { showErrorToast } from "../hooks/useToast";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Logo } from "../components/Logo";

type Mode = "signin" | "signup";

export function AuthPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (session) return <Navigate to="/dashboard" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const supabase = browserClient();
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        // The accounts row is created by the on_auth_user_created trigger.
        // Email confirmation may be required depending on project config.
        if (data.session) navigate("/dashboard");
        else {
          showErrorToast({ title: "Check your inbox", message: "Verify your email to finish signing up." });
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate("/dashboard");
      }
    } catch (err) {
      showErrorToast(err instanceof AuthError ? err.message : err);
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    await browserClient().auth.signInWithOAuth({
      provider: "google",
      options: {
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted px-4">
      <div className="mb-6 flex items-center gap-2">
        <Logo size="lg" />
        <span className="text-xl font-semibold text-foreground">ScalePods</span>
      </div>
      <Card className="w-full max-w-sm">
        <h1 className="text-lg font-semibold text-foreground">
          {mode === "signin" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "signin"
            ? "Sign in to your recruiting workspace."
            : "Start screening candidates in minutes."}
        </p>

        <form onSubmit={submit} className="mt-5 space-y-3">
          <div>
            <label htmlFor="email" className="mb-1 block text-xs font-medium text-muted-foreground">
              Work email
            </label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-xs font-medium text-muted-foreground">
              Password
            </label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" fullWidth loading={busy}>
            {mode === "signin" ? "Sign in" : "Sign up"}
          </Button>
        </form>

        <div className="my-4 flex items-center gap-3">
          <span className="h-px flex-1 bg-muted" />
          <span className="text-xs uppercase tracking-wide text-muted-foreground">or</span>
          <span className="h-px flex-1 bg-muted" />
        </div>

        <Button variant="secondary" fullWidth onClick={google}>
          Continue with Google
        </Button>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          {mode === "signin" ? "New to ScalePods?" : "Already have an account?"}{" "}
          <button
            className="font-semibold text-primary hover:text-accent-foreground"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          >
            {mode === "signin" ? "Create an account" : "Sign in"}
          </button>
        </p>
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          New accounts start on the Free plan. Upgrade anytime from Usage & billing.
        </p>
      </Card>
    </div>
  );
}