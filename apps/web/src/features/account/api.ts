import type { AccountsRow } from "@scalepods/core";
import { supabaseBrowser } from "@/lib/supabase/client";

/** Columns the shell + dashboard need from the RLS-protected `accounts` row. */
export const ACCOUNT_COLUMNS =
  "id,tier,billing_anchor_date,billing_status,quiet_hours_start,quiet_hours_end,max_messages_per_candidate_per_day,company_name,name,created_at";

export async function fetchAccount(userId: string): Promise<AccountsRow | null> {
  const { data, error } = await supabaseBrowser()
    .from("accounts")
    .select(ACCOUNT_COLUMNS)
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as AccountsRow | null) ?? null;
}
