import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FolderKanban, Plus } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { browserClient } from "../lib/supabase";
import type { CampaignsRow } from "../lib/types";
import { formatDateTime } from "../lib/format";
import { Button } from "../components/ui/Button";
import { Card, CardHeader } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { EmptyState } from "../components/EmptyState";
import { showErrorToast } from "../hooks/useToast";

interface CampaignListItem {
  id: string;
  name: string;
  jd_text: string | null;
  number_of_rounds: number;
  status: "on" | "off";
  created_at: string;
  candidates: number;
}

export function CampaignsPage() {
  const { user } = useAuth();
  const supabase = browserClient();
  const navigate = useNavigate();
  const [rows, setRows] = useState<CampaignListItem[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const [c, cc] = await Promise.all([
      supabase.from("campaigns").select("*").order("created_at", { ascending: false }),
      supabase.from("campaign_candidates").select("campaign_id"),
    ]);
    if (c.error) {
      showErrorToast(c.error);
      setRows([]);
      setLoading(false);
      return;
    }
    const counts: Record<string, number> = {};
    for (const r of (cc.data ?? []) as { campaign_id: string }[]) {
      counts[r.campaign_id] = (counts[r.campaign_id] ?? 0) + 1;
    }
    setRows(
      ((c.data as CampaignsRow[] | null) ?? []).map((x) => ({
        ...x,
        candidates: counts[x.id] ?? 0,
      }))
    );
    setLoading(false);
  }, [supabase, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Campaigns</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {loading ? "Loading…" : `${rows?.length ?? 0} recruiting drives`}
          </p>
        </div>
        <Link to="/campaigns/new">
          <Button>
            <Plus className="h-4 w-4" aria-hidden />
            New campaign
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader
          title="Recruiting drives"
          subtitle="Open a campaign to upload resumes, screen candidates and manage its rounds."
        />
        {!loading &&
          (rows == null || rows.length === 0 ? (
            <EmptyState
              icon={<FolderKanban className="h-5 w-5" aria-hidden />}
              title="No campaigns yet"
              hint="Create your first campaign to start screening candidates against a job description."
              action={
                <Link to="/campaigns/new">
                  <Button>
                    <Plus className="h-4 w-4" aria-hidden />
                    Create campaign
                  </Button>
                </Link>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="py-2 pr-3 font-medium">Name</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Rounds</th>
                    <th className="py-2 pr-3 font-medium">Candidates</th>
                    <th className="py-2 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((c) => (
                    <tr
                      key={c.id}
                      role="link"
                      tabIndex={0}
                      aria-label={`Open campaign ${c.name}`}
                      onClick={() => navigate(`/campaigns/${c.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          navigate(`/campaigns/${c.id}`);
                        }
                      }}
                      className="group cursor-pointer hover:bg-muted"
                    >
                      <td className="py-2.5 pr-3">
                        <Link
                          to={`/campaigns/${c.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-medium text-foreground hover:text-primary"
                        >
                          {c.name}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">
                          {c.jd_text?.slice(0, 90) || "No JD added"}
                        </p>
                      </td>
                      <td className="py-2.5 pr-3">
                        <Badge tone={c.status === "on" ? "success" : "neutral"}>
                          {c.status === "on" ? "Active" : "Paused"}
                        </Badge>
                      </td>
                      <td className="py-2.5 pr-3 tabular-nums text-muted-foreground">
                        {c.number_of_rounds}
                      </td>
                      <td className="py-2.5 tabular-nums text-muted-foreground">{c.candidates}</td>
                      <td className="py-2.5 tabular-nums text-muted-foreground">
                        {formatDateTime(c.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        {loading && <div className="py-20 text-center text-sm text-muted-foreground">Loading campaigns…</div>}
      </Card>
    </div>
  );
}