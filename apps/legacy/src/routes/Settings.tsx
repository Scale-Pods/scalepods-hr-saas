import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Calendar, ExternalLink, Globe, Mail, MessageSquare, Phone } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { browserClient } from "../lib/supabase";
import { callWebhook, webhookUrl } from "../lib/n8n";
import { TIER_LIMITS, type CalendarConnectionRow, type TeamMemberRow } from "@scalepods/core";
import { Button } from "../components/ui/Button";
import { Card, CardHeader } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Input } from "../components/ui/Input";
import { UpgradeStrip } from "../components/UpgradeStrip";
import { EmptyState } from "../components/EmptyState";
import { showErrorToast, showToast } from "../hooks/useToast";

const STATUS_TONE: Record<string, "neutral" | "success" | "warning" | "danger" | "accent"> = {
  not_connected: "neutral",
  pending: "warning",
  active: "success",
  degraded: "warning",
  revoked: "danger",
};

export function SettingsPage() {
  const { user, account, refreshAccount } = useAuth();
  const supabase = browserClient();
  const [params] = useSearchParams();
  const tier = account?.tier ?? "free";
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

  useEffect(() => {
    setQuietStart(account?.quiet_hours_start ?? "21:00");
    setQuietEnd(account?.quiet_hours_end ?? "09:00");
    setMaxPerDay(account?.max_messages_per_candidate_per_day ?? 3);
  }, [account?.quiet_hours_start, account?.quiet_hours_end, account?.max_messages_per_candidate_per_day]);

  const load = useCallback(async () => {
    const [calRes, memberRes] = await Promise.all([
      supabase.from("calendar_connections").select("*").maybeSingle(),
      supabase.from("team_members").select("*").order("name"),
    ]);
    if (!calRes.error && calRes.data) setCal(calRes.data as CalendarConnectionRow);
    if (!memberRes.error && memberRes.data) setMembers(memberRes.data as TeamMemberRow[]);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  // Plain GET redirect flow (PATCH 5): the backend drives the Google OAuth
  // exchange and returns here with ?calendar=connected (or =error). No
  // frontend OAuth callback exists anymore.
  useEffect(() => {
    const outcome = params.get("calendar");
    if (outcome === "connected") {
      showToast({
        kind: "info",
        title: "Calendar connected",
        message: "Candidates can now book interview slots.",
      });
      void load();
    } else if (outcome === "error") {
      showErrorToast("The calendar connection did not complete - try again.");
    }
  }, [params, load]);

  const connectCalendar = () => {
    if (!user) return;
    window.location.href = webhookUrl("calendar/connect", { account_id: user.id });
  };

  const savePrefs = async () => {
    if (!user) return;
    setSavingPrefs(true);
    try {
      const { error } = await supabase
        .from("accounts")
        .update({
          quiet_hours_start: quietStart || null,
          quiet_hours_end: quietEnd || null,
          max_messages_per_candidate_per_day: maxPerDay,
        })
        .eq("id", user.id);
      if (error) {
        showErrorToast(error);
        return;
      }
      await refreshAccount();
      showToast({
        kind: "info",
        title: "Notification preferences saved",
        message: "Campaigns pause multi-step sends during quiet hours and stay within the daily cap.",
      });
    } finally {
      setSavingPrefs(false);
    }
  };

  const addTeammate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setAdding(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      await callWebhook("interviewers", {
        body: { action: "assign_round", account_id: user.id, name, email, role: role || undefined },
        accessToken: token,
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Settings</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{t.label} plan</p>
      </div>

      <Card>
        <CardHeader
          title="Calendar connection"
          subtitle="One connected calendar per account, reused across every interview round."
          action={<Badge tone={STATUS_TONE[calStatus]}>{calStatus}</Badge>}
        />
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
                    ? "The connection was revoked - reconnect to keep booking online."
                    : calStatus === "degraded"
                      ? "Calendar sync degraded - check Google permissions."
                      : "Availability + slot booking run against this calendar."}
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            onClick={connectCalendar}
            disabled={calStatus === "active" || calStatus === "pending"}
          >
            <ExternalLink className="h-4 w-4" aria-hidden />
            {calStatus === "active" ? "Reconnect" : "Connect Google Calendar"}
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Notification preferences"
          subtitle="How often candidates are messaged, and when messaging pauses."
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="quiet-start" className="mb-1 block text-xs font-medium text-muted-foreground">
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
            <label htmlFor="quiet-end" className="mb-1 block text-xs font-medium text-muted-foreground">
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
            <label htmlFor="max-per-day" className="mb-1 block text-xs font-medium text-muted-foreground">
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
          During quiet hours, campaigns hold the candidate's next message until they restart; the daily
          cap bounds automated messaging per candidate.
        </p>
        <Button className="mt-3" onClick={() => void savePrefs()} loading={savingPrefs} disabled={!user}>
          Save preferences
        </Button>
      </Card>

      <Card>
        <CardHeader
          title="Team members"
          subtitle="Interviewers you can assign to human interview rounds."
        />
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
          <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Teammate name" />
          <Input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Teammate email" />
          <Input placeholder="Role (optional)" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role" />
          <Button type="submit" loading={adding} disabled={!name || !email}>
            Add teammate
          </Button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">
          Added via <code className="rounded bg-muted px-1">POST /webhook/interviewers</code>{" "}
          (workflow 10).
        </p>
      </Card>

      <Card>
        <CardHeader
          title="Sending identity"
          subtitle="Which “from” address / WhatsApp number candidate messages come from."
        />
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-foreground">
            <Mail className="h-4 w-4 text-muted-foreground" aria-hidden />
            Email: <span className="font-medium">{t.customIdentity ? "your custom domain" : "platform-managed (noreply@scalepods.app)"}</span>
          </div>
          <div className="flex items-center gap-2 text-foreground">
            <MessageSquare className="h-4 w-4 text-muted-foreground" aria-hidden />
            WhatsApp:{" "}
            <span className="font-medium">
              {t.customIdentity ? "your number" : t.whatsapp ? "platform-managed number" : "not enabled"}
            </span>
          </div>
          <div className="flex items-center gap-2 text-foreground">
            <Phone className="h-4 w-4 text-muted-foreground" aria-hidden />
            Voice line:{" "}
            <span className="font-medium">{t.voiceScreening ? "platform-managed number" : "not enabled"}</span>
          </div>
          <div className="flex items-center gap-2 text-foreground">
            <Globe className="h-4 w-4 text-muted-foreground" aria-hidden />
            From-domain sending is a Growth+ feature.
          </div>
        </div>
        {!t.customIdentity && (
          <UpgradeStrip message="Custom sending domain and WhatsApp number unlock on the Growth tier." className="mt-4" />
        )}
      </Card>
    </div>
  );
}