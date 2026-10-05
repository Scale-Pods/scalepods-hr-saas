"use client";

import { type CalendarConnectionRow, type TeamMemberRow, TIER_LIMITS } from "@scalepods/core";
import { Calendar, ExternalLink, Mail, MessageSquare, Phone } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { SectionCard } from "@/components/shared/SectionCard";
import { showErrorToast, showToast } from "@/components/shared/TierLimitToast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccount } from "@/features/account/hooks";
import { useSession } from "@/features/auth/hooks";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { callWorkflow, workflowUrl } from "@/lib/webhooks";

const STATUS_TONE: Record<
  string,
  { variant: "default" | "secondary" | "destructive"; className?: string }
> = {
  not_connected: { variant: "secondary" },
  pending: { variant: "secondary", className: "bg-warning/10 text-warning" },
  active: { variant: "secondary", className: "bg-success/10 text-success" },
  degraded: { variant: "secondary", className: "bg-warning/10 text-warning" },
  revoked: { variant: "destructive" },
};

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-40 w-full" />
        </div>
      }
    >
      <SettingsPageInner />
    </Suspense>
  );
}

function SettingsPageInner() {
  const { account, refreshAccount } = useAccount();
  const { data: session } = useSession();
  const params = useSearchParams();
  const tier = (account?.tier ?? "free") as keyof typeof TIER_LIMITS;
  const t = TIER_LIMITS[tier];

  const [cal, setCal] = useState<CalendarConnectionRow | null>(null);
  const [members, setMembers] = useState<TeamMemberRow[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [adding, setAdding] = useState(false);

  const [quietStart, setQuietStart] = useState(account?.quiet_hours_start ?? "21:00");
  const [quietEnd, setQuietEnd] = useState(account?.quiet_hours_end ?? "09:00");
  const [maxPerDay, setMaxPerDay] = useState(account?.max_messages_per_candidate_per_day ?? 3);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const [profileUserName, setProfileUserName] = useState(account?.name ?? "");
  const [profileCompanyName, setProfileCompanyName] = useState(account?.company_name ?? "");
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    setQuietStart(account?.quiet_hours_start ?? "21:00");
    setQuietEnd(account?.quiet_hours_end ?? "09:00");
    setMaxPerDay(account?.max_messages_per_candidate_per_day ?? 3);
    setProfileUserName(account?.name ?? "");
    setProfileCompanyName(account?.company_name ?? "");
  }, [
    account?.quiet_hours_start,
    account?.quiet_hours_end,
    account?.max_messages_per_candidate_per_day,
    account?.name,
    account?.company_name,
  ]);

  const load = useCallback(async () => {
    const supabase = supabaseBrowser();
    const [calRes, memberRes] = await Promise.all([
      supabase.from("calendar_connections").select("*").maybeSingle(),
      supabase.from("team_members").select("*").order("name"),
    ]);
    if (!calRes.error && calRes.data) setCal(calRes.data as CalendarConnectionRow);
    if (!memberRes.error && memberRes.data) setMembers(memberRes.data as TeamMemberRow[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const calendarOutcome = params.get("calendar");
  useEffect(() => {
    if (calendarOutcome === "connected") {
      showToast("Calendar connected — candidates can now book interview slots.");
      void load();
    } else if (calendarOutcome === "error") {
      showErrorToast("The calendar connection did not complete — try again.");
    }
  }, [calendarOutcome, load]);

  const connectCalendar = () => {
    if (!account?.id) return;
    window.location.href = workflowUrl("calendar/oauth/start", { account_id: account.id });
  };

  const savePrefs = async () => {
    if (!account?.id) return;
    setSavingPrefs(true);
    try {
      const supabase = supabaseBrowser();
      const { error } = await supabase
        .from("accounts")
        .update({
          quiet_hours_start: quietStart || null,
          quiet_hours_end: quietEnd || null,
          max_messages_per_candidate_per_day: maxPerDay,
        })
        .eq("id", account.id);
      if (error) {
        showErrorToast(error);
        return;
      }
      await refreshAccount();
      showToast("Notification preferences saved.");
    } finally {
      setSavingPrefs(false);
    }
  };

  const saveProfile = async () => {
    if (!account?.id) return;
    setSavingProfile(true);
    try {
      const supabase = supabaseBrowser();
      const { error } = await supabase
        .from("accounts")
        .update({
          name: profileUserName.trim() || null,
          company_name: profileCompanyName.trim() || null,
        })
        .eq("id", account.id);
      if (error) {
        showErrorToast(error);
        return;
      }
      await refreshAccount();
      showToast("Workspace profile saved.");
    } finally {
      setSavingProfile(false);
    }
  };

  const addTeammate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account?.id) return;
    setAdding(true);
    try {
      await callWorkflow("interviewers", {
        body: {
          action: "assign_round",
          account_id: account.id,
          name,
          email,
          role: role || undefined,
        },
        accessToken: session?.access_token,
      });
      setName("");
      setEmail("");
      setRole("");
      await load();
    } catch (err) {
      showErrorToast(err);
    } finally {
      setAdding(false);
    }
  };

  const calStatus = cal?.status ?? "not_connected";
  const calMeta = STATUS_TONE[calStatus] ?? STATUS_TONE.not_connected;

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle={`${t.label} plan`} />

      <SectionCard
        title="Workspace & Profile"
        subtitle="Manage your personal recruiter name and organization company name."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="profile-user-name"
              className="mb-1 block text-xs font-medium text-muted-foreground"
            >
              Your Name
            </label>
            <Input
              id="profile-user-name"
              placeholder="e.g. Alex Morgan"
              value={profileUserName}
              onChange={(e) => setProfileUserName(e.target.value)}
            />
          </div>
          <div>
            <label
              htmlFor="profile-company-name"
              className="mb-1 block text-xs font-medium text-muted-foreground"
            >
              Company Name
            </label>
            <Input
              id="profile-company-name"
              placeholder="e.g. Acme Corp"
              value={profileCompanyName}
              onChange={(e) => setProfileCompanyName(e.target.value)}
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Company name is shown to candidates on booking portals and outreach emails.
        </p>
        <Button className="mt-3" onClick={saveProfile} disabled={savingProfile}>
          {savingProfile ? "Saving..." : "Save workspace profile"}
        </Button>
      </SectionCard>

      <SectionCard
        title="Calendar connection"
        subtitle="One connected calendar per account, reused across every interview round."
        action={
          <Badge variant={calMeta.variant} className={cn("capitalize", calMeta.className)}>
            {calStatus.replace(/_/g, " ")}
          </Badge>
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-accent p-2.5">
              <Calendar className="h-5 w-5 text-primary" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-medium text-foreground">
                {calStatus === "active"
                  ? `Connected as ${cal?.google_email ?? "your Google account"}`
                  : calStatus === "pending"
                    ? "Connection in progress…"
                    : "No calendar connected"}
              </p>
              <p className="text-xs text-muted-foreground">
                {calStatus === "not_connected"
                  ? "Connect Google Calendar so candidates can book interview slots."
                  : calStatus === "revoked"
                    ? "The connection was revoked — reconnect to keep booking online."
                    : calStatus === "degraded"
                      ? "Calendar sync degraded — check Google permissions."
                      : "Availability + slot booking run against this calendar."}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={connectCalendar}
            disabled={calStatus === "active" || calStatus === "pending"}
          >
            <ExternalLink className="h-4 w-4" aria-hidden />
            {calStatus === "active" ? "Reconnect" : "Connect Google Calendar"}
          </Button>
        </div>
      </SectionCard>

      <SectionCard
        title="Notification preferences"
        subtitle="How often candidates are messaged, and when messaging pauses."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label
              htmlFor="quiet-start"
              className="mb-1 block text-xs font-medium text-muted-foreground"
            >
              Quiet hours start
            </label>
            <Input
              id="quiet-start"
              type="time"
              value={quietStart}
              onChange={(e) => setQuietStart(e.target.value)}
            />
          </div>
          <div>
            <label
              htmlFor="quiet-end"
              className="mb-1 block text-xs font-medium text-muted-foreground"
            >
              Quiet hours end
            </label>
            <Input
              id="quiet-end"
              type="time"
              value={quietEnd}
              onChange={(e) => setQuietEnd(e.target.value)}
            />
          </div>
          <div>
            <label
              htmlFor="max-per-day"
              className="mb-1 block text-xs font-medium text-muted-foreground"
            >
              Daily messages per candidate
            </label>
            <Input
              id="max-per-day"
              type="number"
              min={0}
              max={99}
              value={maxPerDay}
              onChange={(e) => setMaxPerDay(Number(e.target.value) || 0)}
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          During quiet hours, campaigns hold the candidate&apos;s next message until they restart;
          the daily cap bounds automated messaging per candidate.
        </p>
        <Button className="mt-3" onClick={savePrefs} disabled={savingPrefs}>
          Save preferences
        </Button>
      </SectionCard>

      <SectionCard
        title="Team members"
        subtitle="Interviewers you can assign to human interview rounds."
      >
        {members.length > 0 ? (
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="py-2 pr-3 font-medium">Email</th>
                <th className="py-2 font-medium">Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {members.map((m) => (
                <tr key={m.id}>
                  <td className="py-2.5 pr-3 font-medium text-foreground">{m.name}</td>
                  <td className="py-2.5 pr-3 text-muted-foreground">{m.email}</td>
                  <td className="py-2.5 text-muted-foreground">{m.role ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState
            title="No teammates yet"
            hint="Add your first teammate below to assign them to Human interview rounds."
          />
        )}
        <form onSubmit={addTeammate} className="mt-4 grid gap-3 sm:grid-cols-4">
          <Input
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Teammate name"
          />
          <Input
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label="Teammate email"
          />
          <Input
            placeholder="Role (optional)"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            aria-label="Role"
          />
          <Button type="submit" disabled={adding || !name || !email}>
            Add teammate
          </Button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">
          Teammates can be assigned as interviewers for live candidate rounds.
        </p>
      </SectionCard>

      <SectionCard
        title="Sending identity"
        subtitle={'Which "from" address / WhatsApp number candidate messages come from.'}
      >
        <div className="space-y-2.5 text-sm">
          <div className="flex items-center justify-between rounded-lg border border-border/40 bg-card/60 px-3 py-2">
            <div className="flex items-center gap-2 text-foreground text-xs">
              <Mail className="h-4 w-4 text-muted-foreground" aria-hidden />
              <span>
                Email:{" "}
                <strong className="text-foreground">
                  {t.customIdentity
                    ? "Custom domain"
                    : "ScalePods platform (noreply@scalepods.app)"}
                </strong>
              </span>
            </div>
            {!t.customIdentity && (
              <span className="rounded-full bg-muted/80 px-2 py-0.5 text-[10px] font-medium text-muted-foreground border border-border/40">
                Custom domain available on Growth & Enterprise
              </span>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/40 bg-card/60 px-3 py-2">
            <div className="flex items-center gap-2 text-foreground text-xs">
              <MessageSquare className="h-4 w-4 text-muted-foreground" aria-hidden />
              <span>
                WhatsApp:{" "}
                <strong className="text-foreground">
                  {t.whatsapp
                    ? t.customIdentity
                      ? "Custom dedicated number"
                      : "ScalePods managed line"
                    : "Not enabled"}
                </strong>
              </span>
            </div>
            {!t.whatsapp && (
              <span className="rounded-full bg-muted/80 px-2 py-0.5 text-[10px] font-medium text-muted-foreground border border-border/40">
                Available on Basic, Growth & Enterprise
              </span>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/40 bg-card/60 px-3 py-2">
            <div className="flex items-center gap-2 text-foreground text-xs">
              <Phone className="h-4 w-4 text-muted-foreground" aria-hidden />
              <span>
                AI Voice line:{" "}
                <strong className="text-foreground">
                  {t.voiceScreening ? "ScalePods outbound telephony" : "Not enabled"}
                </strong>
              </span>
            </div>
            {!t.voiceScreening && (
              <span className="rounded-full bg-muted/80 px-2 py-0.5 text-[10px] font-medium text-muted-foreground border border-border/40">
                Available on Basic, Growth & Enterprise
              </span>
            )}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
