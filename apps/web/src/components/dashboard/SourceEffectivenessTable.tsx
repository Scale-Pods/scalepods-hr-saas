import type { Reports } from "@scalepods/core";
import { type SourceEffectivenessRow, sourceEffectivenessRows } from "@scalepods/core";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function rateLabel(rate: number | null): string {
  return rate == null ? "—" : `${rate}%`;
}

/** Spec Section 13b PATCH 1 source-effectiveness table. */
export function SourceEffectivenessTable({ reports }: { reports: Reports }) {
  const rows: SourceEffectivenessRow[] = sourceEffectivenessRows(reports);
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No source breakdown yet"
        hint="Per-channel delivery comes from GET /webhook/reports."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Channel</TableHead>
          <TableHead>Stage</TableHead>
          <TableHead className="text-right">Sent</TableHead>
          <TableHead className="text-right">Delivered</TableHead>
          <TableHead className="text-right">Fell back</TableHead>
          <TableHead className="text-right">Delivery</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={`${row.channel}-${row.stage ?? "all"}`}>
            <TableCell className="font-medium text-foreground">{row.channel}</TableCell>
            <TableCell className="text-xs text-muted-foreground">{row.stage ?? "—"}</TableCell>
            <TableCell className="text-right tabular-nums">{row.messages_sent}</TableCell>
            <TableCell className="text-right tabular-nums">{row.delivered}</TableCell>
            <TableCell className="text-right tabular-nums text-muted-foreground">
              {row.fell_back}
            </TableCell>
            <TableCell className="text-right font-medium tabular-nums">
              {rateLabel(row.delivery_rate_pct)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
