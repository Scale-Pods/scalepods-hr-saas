"use client";

import { Building2, Sparkles, User } from "lucide-react";
import { useEffect, useState } from "react";
import { showErrorToast, showToast } from "@/components/shared/TierLimitToast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSession } from "@/features/auth/hooks";
import { supabaseBrowser } from "@/lib/supabase/client";

interface OnboardingModalProps {
  open: boolean;
  initialUserName?: string;
  initialCompanyName?: string;
  onComplete?: () => Promise<void> | void;
}

export function OnboardingModal({
  open,
  initialUserName = "",
  initialCompanyName = "",
  onComplete,
}: OnboardingModalProps) {
  const { data: session } = useSession();
  const [userName, setUserName] = useState(initialUserName);
  const [companyName, setCompanyName] = useState(initialCompanyName);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initialUserName) {
      setUserName(initialUserName);
    } else if (session?.user?.user_metadata?.full_name || session?.user?.user_metadata?.name) {
      setUserName(session.user.user_metadata.full_name || session.user.user_metadata.name || "");
    }
  }, [initialUserName, session?.user?.user_metadata]);

  useEffect(() => {
    if (initialCompanyName) {
      setCompanyName(initialCompanyName);
    }
  }, [initialCompanyName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user?.id) return;

    const trimmedName = userName.trim();
    const trimmedCompany = companyName.trim();

    if (!trimmedCompany) {
      showErrorToast("Please enter your company name to continue.");
      return;
    }

    setSaving(true);
    try {
      const supabase = supabaseBrowser();
      const { error } = await supabase
        .from("accounts")
        .update({
          name: trimmedName || null,
          company_name: trimmedCompany,
        })
        .eq("id", session.user.id);

      if (error) throw error;

      showToast("Workspace setup complete! Welcome to ScalePods.");
      if (onComplete) {
        await onComplete();
      }
    } catch (err) {
      showErrorToast(
        err instanceof Error
          ? err.message
          : "Failed to update workspace details. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader className="text-center sm:text-left">
          <div className="mx-auto sm:mx-0 mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
          <DialogTitle className="text-xl font-bold">Welcome to ScalePods</DialogTitle>
          <DialogDescription className="text-sm">
            Let&apos;s set up your organization workspace before you start screening candidates and
            launching campaigns.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label
              htmlFor="onboarding-user-name"
              className="flex items-center gap-1.5 text-xs font-semibold"
            >
              <User className="h-3.5 w-3.5 text-primary" />
              Your full name
            </Label>
            <Input
              id="onboarding-user-name"
              type="text"
              placeholder="e.g. Alex Morgan"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="onboarding-company-name"
              className="flex items-center gap-1.5 text-xs font-semibold"
            >
              <Building2 className="h-3.5 w-3.5 text-primary" />
              Company name
            </Label>
            <Input
              id="onboarding-company-name"
              type="text"
              placeholder="e.g. Acme Corp"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
            />
            <p className="text-[11px] text-muted-foreground">
              This name will be displayed on candidate invitations and interview portals.
            </p>
          </div>

          <Button type="submit" disabled={saving} className="w-full mt-4">
            {saving ? "Saving workspace..." : "Get started"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
