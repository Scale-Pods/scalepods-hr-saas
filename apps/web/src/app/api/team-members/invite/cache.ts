// Cache recently dispatched email timestamps per team_member_id to prevent duplicates
export const recentEmailDispatches = new Map<string, number>();

export function clearRecentEmailDispatchesForTests() {
  recentEmailDispatches.clear();
}
