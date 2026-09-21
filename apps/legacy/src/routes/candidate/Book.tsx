import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { anonClient } from "../../lib/supabase";
import { buildTimeSlots, browserTimeZone, formatDateTime, formatTime, availableSlotsSchema, bookingContextSchema, type BookingContext, type AvailableSlots } from "@scalepods/core";
import { CandidateShell, ErrorCard, useCandidateToken } from "./shared";
import { EmptyState } from "../../components/EmptyState";

type Ctx = BookingContext;
type Slots = AvailableSlots;
type View = "loading" | "pick" | "booked" | "error";

export function BookPage() {
  const token = useCandidateToken();
  const [searchParams, setSearchParams] = useSearchParams();
  const mode = searchParams.get("mode") ?? "";
  const eventId = searchParams.get("event_id") ?? "";
  const interviewerEmail = searchParams.get("interviewer_email") ?? "";

  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [view, setView] = useState<View>("loading");
  const [error, setError] = useState<string | null>(null);

  const [selectedSlot, setSelectedSlot] = useState<{ start: string; end: string } | null>(null);
  const [booking, setBooking] = useState(false);
  const [success, setSuccess] = useState<Ctx["round_instance"] & { meet_link?: string | null } | null>(null);

  useEffect(() => {
    if (!token) {
      setView("error");
      setError("No access token found in the URL.");
      return;
    }
    const riId = window.location.pathname.split("/").pop();
    if (!riId) {
      setView("error");
      setError("Invalid URL format.");
      return;
    }
    let cancelled = false;
    anonClient()
      .rpc("get_booking_context", {
        p_round_instance_id: riId,
        p_token: token,
        p_tz_offset_minutes: new Date().getTimezoneOffset(),
      })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setView("error");
          setError(error.message ?? "Link invalid or expired.");
          return;
        }
        const parsed = bookingContextSchema.safeParse(data);
        if (!parsed.success) {
          setView("error");
          setError("Unrecognised booking context returned by the server.");
          return;
        }
        const c = parsed.data;
        setCtx(c);
        if ((c.booked_event?.event_id && mode !== "reschedule") || c.round_instance.status === "scheduled" || c.round_instance.status === "passed" || c.round_instance.status === "completed") {
          setView("booked");
        } else {
          setView("pick");
        }
      });
    return () => { cancelled = true; };
  }, [token, mode]);

  const book = async (payload: {
    slot_start: string;
    slot_end: string;
    event_id?: string;
    interviewer_email?: string;
  }) => {
    if (!ctx) return;
    setBooking(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_N8N_BASE_URL}/webhook/${payload.event_id ? "reschedule" : "book-slot"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(
          payload.event_id
            ? {
                round_instance_id: ctx.round_instance.id,
                event_id: payload.event_id,
                interviewer_email: payload.interviewer_email ?? ctx.round.interviewer_email,
                new_slot_start: payload.slot_start,
                new_slot_end: payload.slot_end,
              }
            : { round_instance_id: ctx.round_instance.id, slot_start: payload.slot_start, slot_end: payload.slot_end }
        ),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? body.reason ?? `Booking failed (${res.status})`);
      }
      const round = { ...ctx.round_instance, meet_link: ctx.round_instance.meet_link };
      setSuccess(round);
      setView("booked");
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBooking(false);
    }
  };

  if (view === "error") return <CandidateShell><ErrorCard message={error ?? undefined} /></CandidateShell>;
  if (view === "loading") {
    return (
      <CandidateShell>
        <div className="py-20 text-center text-sm text-muted-foreground">Loading booking details…</div>
      </CandidateShell>
    );
  }
  if (view === "booked" && (success || ctx)) {
    const r = success ?? ctx!.round_instance;
    const meetLink = r.meet_link ?? ctx?.round_instance.meet_link ?? null;
    return (
      <CandidateShell>
        <div className="py-12 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-2xl">
            ✅
          </div>
          <h1 className="text-lg font-semibold text-foreground">Your slot is booked!</h1>
          {r.scheduled_at && (
            <p className="mt-2 text-sm text-muted-foreground">
              {formatDateTime(r.scheduled_at)}
            </p>
          )}
          {meetLink && (
            <p className="mt-3">
              <a
                href={meetLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary"
              >
                Join via Google Meet
              </a>
            </p>
          )}
          {!meetLink && (
            <p className="mt-3 text-sm text-muted-foreground">
              The interview link will be emailed to you at 9 AM on the interview day.
            </p>
          )}
          {ctx?.account.voice_screening_included && (
            <p className="mt-4 text-xs text-muted-foreground">
              We may call you at {ctx.candidate.phone ?? "your number"} for a quick 5-minute screening call.
            </p>
          )}
          {!success && (
            <button
              onClick={() => {
                setSearchParams((prev) => { prev.set("mode", "reschedule"); return prev; });
                setView("pick");
              }}
              className="mt-5 text-xs font-medium text-primary hover:text-accent-foreground"
            >
              Need to reschedule?
            </button>
          )}
        </div>
      </CandidateShell>
    );
  }

  return (
    <CandidateShell>
      <div>
        <h1 className="text-lg font-semibold text-foreground">Pick a time</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "reschedule" ? "Select a new slot below:" : "Choose a slot to book your interview."}
        </p>
      </div>
      <SlotPicker
        ctx={ctx!}
        eventId={mode === "reschedule" ? eventId : undefined}
        interviewerEmail={mode === "reschedule" ? interviewerEmail : undefined}
        onSelect={book}
        loading={booking}
        selected={selectedSlot}
        setSelected={setSelectedSlot}
      />
    </CandidateShell>
  );
}

function SlotPicker({
  ctx,
  eventId,
  interviewerEmail,
  onSelect,
  loading,
  selected,
  setSelected,
}: {
  ctx: Ctx;
  eventId?: string;
  interviewerEmail?: string;
  onSelect: (s: { slot_start: string; slot_end: string; event_id?: string; interviewer_email?: string }) => void;
  loading: boolean;
  selected: { start: string; end: string } | null;
  setSelected: (s: { start: string; end: string } | null) => void;
}) {
  const tz = browserTimeZone();
  const token = useCandidateToken();
  const dailyStart = ctx.round.daily_start_time ?? "09:00";
  const dailyEnd = ctx.round.daily_end_time ?? "18:00";
  const isHuman = ctx.round_instance.round_type === "human_interview";

  const next10 = useMemo(() => {
    const out: Date[] = [];
    const d = new Date();
    d.setDate(d.getDate() + 1);
    while (out.length < 10) {
      const day = d.getDay();
      if (day !== 0 && day !== 6) out.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    return out;
  }, []);

  const [activeDay, setActiveDay] = useState(next10[0]?.toISOString().slice(0, 10) ?? "");
  const [slotsData, setSlotsData] = useState<Slots | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);

  useEffect(() => {
    if (!activeDay) return;
    let cancelled = false;
    const riId = window.location.pathname.split("/").pop()!;
    setLoadingSlots(true);
    anonClient()
      .rpc("get_available_slots", {
        p_round_instance_id: riId,
        p_token: token,
        p_date: activeDay,
        p_start_time: dailyStart,
        p_end_time: dailyEnd,
        p_timezone: tz,
      })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error && data) {
          const parsed = availableSlotsSchema.safeParse(data);
          if (parsed.success) setSlotsData(parsed.data);
        }
        setLoadingSlots(false);
      });
    return () => { cancelled = true; };
  }, [activeDay, dailyStart, dailyEnd, tz, token]);

  const proposed = useMemo(() => buildTimeSlots({ startTime: dailyStart, endTime: dailyEnd, stepMinutes: 30, durationMinutes: 45 }), [dailyStart, dailyEnd]);

  const blocked = useMemo(() => (slotsData?.blocked ?? []).map((b) => ({
    start: new Date(b.start).getTime(),
    end: new Date(b.end).getTime(),
  })), [slotsData]);

  const freeSlots = proposed.filter((s) => {
    const sStart = new Date(`${activeDay}T${s.start}:00`).getTime();
    const sEnd = new Date(`${activeDay}T${s.end}:00`).getTime();
    return !blocked.some((b) => b.start < sEnd && b.end > sStart);
  });

  const submit = () => {
    if (!selected) return;
    const isoStart = `${activeDay}T${selected.start}:00`;
    const isoEnd = `${activeDay}T${selected.end}:00`;
    onSelect({
      slot_start: new Date(isoStart).toISOString(),
      slot_end: new Date(isoEnd).toISOString(),
      event_id: eventId || undefined,
      interviewer_email: interviewerEmail || undefined,
    });
  };

  return (
    <div className="mt-6 space-y-4">
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">Select a day</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {next10.map((d) => {
            const key = d.toISOString().slice(0, 10);
            return (
              <button
                key={key}
                onClick={() => setActiveDay(key)}
                className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                  activeDay === key
                    ? "border-primary bg-accent text-accent-foreground"
                    : "border-border bg-card text-muted-foreground hover:bg-muted"
                }`}
              >
                <div className="text-[11px] uppercase">{d.toLocaleDateString(undefined, { weekday: "short" })}</div>
                <div>{d.getDate()}</div>
                <div className="text-[10px] text-muted-foreground">
                  {d.toLocaleDateString(undefined, { month: "short" })}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">Pick a slot · {tz}</p>
        {loadingSlots ? (
          <p className="py-6 text-center text-xs text-muted-foreground">Loading availability…</p>
        ) : freeSlots.length === 0 ? (
          <EmptyState
            title="No slots available on this day"
            hint="Pick another day — or ask the recruiter to widen the daily window."
            className="py-6"
          />
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {freeSlots.map((s) => {
              const active = selected?.start === s.start && selected?.end === s.end;
              return (
                <button
                  key={s.start}
                  onClick={() => setSelected(active ? null : { start: s.start, end: s.end })}
                  disabled={loading}
                  className={`rounded-lg border px-2 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "border-primary bg-accent text-accent-foreground"
                      : "border-border bg-card text-foreground hover:bg-muted"
                  }`}
                >
                  {formatTime(s.start)} – {formatTime(s.end)}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <button
        onClick={submit}
        disabled={!selected || loading}
        className={`w-full rounded-lg py-2.5 text-sm font-medium text-primary-foreground transition-colors ${
          selected && !loading ? "bg-primary hover:bg-primary" : "bg-muted text-muted-foreground cursor-not-allowed"
        }`}
      >
        {loading ? "Booking…" : selected ? `Confirm ${formatTime(selected.start)} – ${formatTime(selected.end)}` : "Select a slot above"}
      </button>

      {isHuman && (
        <p className="text-center text-[11px] text-muted-foreground">
          Availability is checked against the interviewer's connected Google Calendar.
        </p>
      )}
      {!isHuman && (
        <p className="text-center text-[11px] text-muted-foreground">
          For AI interviews, the exact link will be emailed to you at 9 AM on the interview day.
        </p>
      )}
    </div>
  );
}