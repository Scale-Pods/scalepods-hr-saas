import { makeRound, type RoundDraft } from "@/components/campaigns/RoundEditor";

/**
 * Resize a list of round drafts to `count`, appending fresh defaults for new
 * indices and truncating extras. Keeps configured rounds in sync with the
 * "number of rounds" picker so every round is editable and submit-able.
 */
export function syncRoundCount(rounds: RoundDraft[], count: number): RoundDraft[] {
  if (rounds.length === count) return rounds;
  const next = rounds.slice(0, count);
  while (next.length < count) next.push(makeRound());
  return next;
}
