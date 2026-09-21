/** Bucket names — must match supabase/migrations/0003_storage.sql. */
export const BUCKETS = {
  resumes: "resumes",
  recordings: "interview-recordings",
  assignments: "assignments",
} as const;

export function recordingPath(accountId: string, sessionId: string, filename: string): string {
  return `${accountId}/${sessionId}/${filename}`;
}

export function assignmentDir(
  accountId: string,
  campaignId: string,
  roundInstanceId: string
): string {
  return `${accountId}/${campaignId}/${roundInstanceId}/submission`;
}