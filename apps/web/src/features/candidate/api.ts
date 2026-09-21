import {
  type AssignmentContext,
  type AvailableSlots,
  assignmentContextSchema,
  availableSlotsSchema,
  type BookingContext,
  bookingContextSchema,
  type SessionContext,
  sessionContextSchema,
} from "@scalepods/core";
import { getEnv } from "@/env";
import { anonClient } from "@/lib/supabase/anon";

const n8nBase = () => getEnv().NEXT_PUBLIC_N8N_BASE_URL;

function _rpcUrl(): string {
  const base = n8nBase();
  return base.replace(/\/+$/, "").replace(/\/webhook\/?$/, "");
}

export async function fetchBookingContext(riId: string, token: string): Promise<BookingContext> {
  const { data, error } = await anonClient().rpc("get_booking_context", {
    p_round_instance_id: riId,
    p_token: token,
    p_tz_offset_minutes: new Date().getTimezoneOffset(),
  });
  if (error) throw new Error(error.message ?? "Link invalid or expired.");
  return bookingContextSchema.parse(data);
}

export async function fetchAvailableSlots(
  riId: string,
  token: string,
  date: string,
  startTime: string,
  endTime: string,
  tz: string,
): Promise<AvailableSlots> {
  const { data, error } = await anonClient().rpc("get_available_slots", {
    p_round_instance_id: riId,
    p_token: token,
    p_date: date,
    p_start_time: startTime,
    p_end_time: endTime,
    p_timezone: tz,
  });
  if (error) throw error;
  return availableSlotsSchema.parse(data);
}

export async function bookSlot(payload: {
  round_instance_id: string;
  slot_start: string;
  slot_end: string;
  event_id?: string;
  interviewer_email?: string;
}): Promise<void> {
  const path = payload.event_id ? "reschedule" : "book-slot";
  const res = await fetch(`${n8nBase()}/webhook/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? body.reason ?? `Booking failed (${res.status})`);
  }
}

export async function fetchSessionContext(
  sessionId: string,
  token: string,
): Promise<SessionContext> {
  const { data, error } = await anonClient().rpc("get_session_context", {
    p_session_id: sessionId,
    p_token: token,
  });
  if (error) throw new Error(error.message ?? "Link invalid or expired.");
  return sessionContextSchema.parse(data);
}

export async function insertProctoringEvent(
  sessionId: string,
  token: string,
  eventType: string,
  detail: string,
): Promise<void> {
  await anonClient().rpc("insert_proctoring_event", {
    p_session_id: sessionId,
    p_token: token,
    p_event_type: eventType,
    p_detail: detail,
  });
}

interface EngineResponse {
  type: "question" | "finished";
  question_id?: string;
  prompt?: string;
  format?: string;
  options?: string[];
  is_final_question?: boolean;
}

export async function submitInterviewTurn(body: {
  account_id: string;
  session_id: string;
  candidate_id: string;
  question_id: string | null;
  response_transcript: string;
  history: { q: string; a: string }[];
}): Promise<EngineResponse> {
  const res = await fetch(`${n8nBase()}/webhook/interview-engine`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    throw new Error(b.error ?? `Engine error (${res.status})`);
  }
  return res.json();
}

export async function scoreInterview(body: {
  account_id: string;
  session_id: string;
  candidate_id: string;
}): Promise<void> {
  const res = await fetch(`${n8nBase()}/webhook/score-interview`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Evaluation step failed.");
}

export async function fetchAssignmentContext(
  riId: string,
  token: string,
): Promise<AssignmentContext> {
  const { data, error } = await anonClient().rpc("get_assignment_context", {
    p_round_instance_id: riId,
    p_token: token,
  });
  if (error) throw new Error(error.message ?? "Link invalid or expired.");
  return assignmentContextSchema.parse(data);
}

export async function signUploads(
  token: string,
  kind: string,
  resourceId: string,
  fileNames: string[],
): Promise<{ bucket: string; uploads: { name: string; url: string }[] }> {
  const { callEdge } = await import("@/lib/edge");
  return callEdge<{ bucket: string; uploads: { name: string; url: string }[] }>("sign-upload", {
    body: { token, kind, resource_id: resourceId, file_names: fileNames },
  });
}

export async function insertAssignmentSubmission(
  riId: string,
  token: string,
  textResponse: string,
  filePaths: string[],
): Promise<string> {
  const { data, error } = await anonClient().rpc("insert_assignment_submission", {
    p_round_instance_id: riId,
    p_token: token,
    p_text_response: textResponse,
    p_file_paths: filePaths,
  });
  if (error) throw error;
  return data as string;
}

export async function scoreAssignment(
  roundInstanceId: string,
  submissionId: string,
): Promise<void> {
  const { callEdge } = await import("@/lib/edge");
  void callEdge("score-assignment", {
    body: { round_instance_id: roundInstanceId, submission_id: submissionId },
  }).catch(() => {});
}
