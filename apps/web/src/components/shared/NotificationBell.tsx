"use client";

import { timeAgo } from "@scalepods/core";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCandidateNames } from "@/features/dashboard/hooks";
import { useDecisions } from "@/features/notifications/hooks";
import { computeUnread, readSeenAt, writeSeenAt } from "@/features/notifications/unread";

export function NotificationBell() {
  const { data: decisions, isPending } = useDecisions();
  const candidateIds = useMemo(() => (decisions ?? []).map((d) => d.candidate_id), [decisions]);
  const names = useCandidateNames(candidateIds);
  const nameMap = names.data ?? {};

  const [seenAt, setSeenAt] = useState<number | null>(() => readSeenAt());
  const unread = computeUnread(decisions ?? [], seenAt);
  const latest = (decisions ?? []).slice(0, 8);

  const markRead = () => {
    const now = Date.now();
    writeSeenAt(now);
    setSeenAt(now);
  };

  return (
    <Popover
      onOpenChange={(open) => {
        if (open) markRead();
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ""}`}
          className="relative inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Bell className="h-4 w-4" aria-hidden />
          {!isPending && unread > 0 ? (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
          <p className="text-sm font-semibold text-foreground">Notifications</p>
          <button
            type="button"
            onClick={markRead}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Mark all read
          </button>
        </div>
        {isPending ? (
          <div className="space-y-2 p-3">
            <div className="h-4 animate-pulse rounded bg-muted" />
            <div className="h-4 animate-pulse rounded bg-muted" />
            <div className="h-4 animate-pulse rounded bg-muted" />
          </div>
        ) : latest.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">No new decisions</p>
        ) : (
          <ul className="max-h-80 divide-y divide-border overflow-y-auto">
            {latest.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/candidates/${row.candidate_id}`}
                  className="flex items-start justify-between gap-3 px-3 py-2.5 hover:bg-muted"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {nameMap[row.candidate_id] ?? "Candidate"}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {row.stage}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {timeAgo(row.decided_at)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
