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
  try {
    const res = await fetch(`/api/booking/context?riId=${riId}&tok=${token || ""}`);
    if (res.ok) {
      const json = await res.json();
      if (json.round_instance && json.candidate && json.campaign && json.round && json.account) {
        return bookingContextSchema.parse(json);
      }
    }
  } catch {}

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
  try {
    const res = await fetch(
      `/api/booking/slots?riId=${riId}&tok=${token || ""}&date=${date}&startTime=${startTime}&endTime=${endTime}&tz=${encodeURIComponent(tz)}`,
    );
    if (res.ok) {
      const json = await res.json();
      if (json.window) {
        return availableSlotsSchema.parse(json);
      }
    }
  } catch {}

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

export async function fetchSessionContext(sessionId: string): Promise<SessionContext> {
  try {
    const res = await fetch(`/api/interview/session?sessionId=${sessionId}`);
    if (res.ok) {
      const json = await res.json();
      if (json.session && json.round_instance && json.candidate && json.campaign) {
        return sessionContextSchema.parse({
          session: json.session,
          round_instance: json.round_instance,
          candidate: json.candidate,
          campaign: json.campaign,
          round: json.round || {
            round_number: 1,
            round_type: "ai_interview",
            cutoff_score: 70,
          },
          account: json.account || { id: "shared", tier: "enterprise" },
        });
      }
    }
  } catch {}

  const { data, error } = await anonClient().rpc("get_session_context", {
    p_session_id: sessionId,
    p_token: "",
  });
  if (error) throw new Error(error.message ?? "Link invalid or expired.");
  return sessionContextSchema.parse(data);
}

export async function insertProctoringEvent(
  sessionId: string,
  eventType: string,
  detail: string,
): Promise<void> {
  try {
    const res = await fetch("/api/interview/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "proctoring_event",
        sessionId,
        eventType,
        detail,
      }),
    });
    if (res.ok) return;
  } catch {}

  await anonClient().rpc("insert_proctoring_event", {
    p_session_id: sessionId,
    p_token: "",
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
  interviewer_text?: string;
}

function normalizeEngineResponse(raw: unknown): EngineResponse {
  if (Array.isArray(raw)) {
    if (raw.length === 0) return { type: "finished" };
    const row = raw[0] as {
      question_id?: string;
      ai_live_note?: {
        question_text?: string;
        next_question_id?: string;
        is_final_question?: boolean;
        interviewer_text?: string;
      };
    };
    const note = row?.ai_live_note;
    if (!note || typeof note.question_text !== "string") {
      throw new Error("The interview engine returned an unexpected response.");
    }
    return {
      type: "question",
      question_id: note.next_question_id ?? row.question_id ?? "",
      prompt: note.question_text,
      format: "open_ended",
      is_final_question: Boolean(note.is_final_question),
      interviewer_text: note.interviewer_text,
    };
  }
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.question_text === "string") {
      const nextId = typeof obj.next_question_id === "string" ? obj.next_question_id : "";
      return {
        type: "question",
        question_id: nextId,
        prompt: obj.question_text,
        format: "open_ended",
        is_final_question: obj.is_final_question === true,
        interviewer_text:
          typeof obj.interviewer_text === "string" ? obj.interviewer_text : undefined,
      };
    }
    if (obj.type === "question" || obj.type === "finished") {
      return obj as unknown as EngineResponse;
    }
  }
  throw new Error("The interview engine returned an unexpected response.");
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
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    throw new Error(b.error ?? `Engine error (${res.status})`);
  }
  return normalizeEngineResponse(await res.json());
}

export async function scoreInterview(body: {
  account_id: string;
  session_id: string;
  candidate_id: string;
  round_number?: number;
  campaign_id?: string;
  number_of_rounds?: number;
  cutoff_score?: number | null;
  recording_url?: string | null;
}): Promise<void> {
  const res = await fetch(`${n8nBase()}/webhook/score-interview`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      round_number: 1,
      number_of_rounds: 1,
      cutoff_score: 70,
      ...body,
    }),
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
  kind: "recording" | "assignment",
  resourceId: string,
  fileNames: string[],
  token?: string,
): Promise<{ bucket: string; uploads: { name: string; url: string }[] }> {
  const { callEdge } = await import("@/lib/edge");
  return callEdge<{ bucket: string; uploads: { name: string; url: string }[] }>("sign-upload", {
    body: { token: token ?? "", kind, resource_id: resourceId, file_names: fileNames },
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
