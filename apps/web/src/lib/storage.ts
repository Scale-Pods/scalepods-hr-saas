/** Bucket names — must match supabase/migrations/0003_storage.sql. */
export const BUCKETS = {
  resumes: "resumes",
  recordings: "interview-recordings",
  assignments: "assignments",
} as const;
