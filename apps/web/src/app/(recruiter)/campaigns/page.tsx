"use client";

import { formatDateTime } from "@scalepods/core";
import { FolderKanban, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { SectionCard } from "@/components/shared/SectionCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCampaigns } from "@/features/campaigns/hooks";

export default function CampaignsPage() {
  const router = useRouter();
  const { data: campaigns, isPending } = useCampaigns();
  const rows = campaigns ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campaigns"
        subtitle={isPending ? "Loading…" : `${rows.length} recruiting drives`}
        actions={
          <Button asChild>
            <Link href="/campaigns/new">
              <Plus className="h-4 w-4" aria-hidden />
              New campaign
            </Link>
          </Button>
        }
      />

      <SectionCard
        title="Recruiting drives"
        subtitle="Open a campaign to upload resumes, screen candidates and manage its rounds."
      >
        {isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-2/3" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<FolderKanban className="h-5 w-5" aria-hidden />}
            title="No campaigns yet"
            hint="Create your first campaign to start screening candidates against a job description."
            action={
              <Button asChild>
                <Link href="/campaigns/new">
                  <Plus className="h-4 w-4" aria-hidden />
                  Create campaign
                </Link>
              </Button>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Rounds</TableHead>
                <TableHead className="text-right">Candidates</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((campaign) => (
                <TableRow
                  key={campaign.id}
                  role="link"
                  tabIndex={0}
                  aria-label={`Open campaign ${campaign.name}`}
                  onClick={() => router.push(`/campaigns/${campaign.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      router.push(`/campaigns/${campaign.id}`);
                    }
                  }}
                  className="cursor-pointer"
                >
                  <TableCell className="max-w-xs">
                    <Link
                      href={`/campaigns/${campaign.id}`}
                      onClick={(event) => event.stopPropagation()}
                      className="font-medium text-foreground hover:text-primary"
                    >
                      {campaign.name}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      {campaign.jd_text?.slice(0, 90) || "No JD added"}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={
                        campaign.status === "on"
                          ? "bg-success/15 text-success"
                          : "bg-fill-tertiary text-secondary-foreground"
                      }
                    >
                      {campaign.status === "on" ? "Active" : "Paused"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {campaign.number_of_rounds}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {campaign.candidates}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {formatDateTime(campaign.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>
    </div>
  );
}
