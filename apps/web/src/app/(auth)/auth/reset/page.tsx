"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { showErrorToast, showToast } from "@/components/shared/TierLimitToast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const supabase = supabaseBrowser();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/verify`,
      });
      if (error) throw error;
      setSent(true);
      showToast("Check your inbox for a password reset link.", { kind: "info" });
    } catch (err) {
      showErrorToast(err instanceof Error ? err.message : err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="w-full max-w-sm">
      <CardContent className="pt-6">
        <h1 className="text-lg font-semibold text-foreground">Reset your password</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter the email you signed up with and we&apos;ll send a reset link.
        </p>

        {sent ? (
          <div className="mt-5 space-y-3">
            <p className="text-sm text-muted-foreground">
              If that email is on file, a reset link was sent. Check your inbox.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-3">
            <div>
              <label
                htmlFor="reset-email"
                className="mb-1 block text-xs font-medium text-muted-foreground"
              >
                Work email
              </label>
              <Input
                id="reset-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              Send reset link
            </Button>
          </form>
        )}

        <p className="mt-4 text-center text-xs">
          <Link
            href="/auth"
            className="inline-flex items-center gap-1 font-medium text-primary hover:text-accent-foreground"
          >
            <ArrowLeft className="h-3 w-3" aria-hidden /> Back to sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
