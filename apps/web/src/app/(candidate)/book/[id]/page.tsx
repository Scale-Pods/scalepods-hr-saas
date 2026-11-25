"use client";

import type { AvailableSlots, BookingContext } from "@scalepods/core";
import { buildTimeSlots, formatDateTime, formatTime, localDateKey } from "@scalepods/core";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { bookSlot, fetchAvailableSlots, fetchBookingContext } from "@/features/candidate/api";

type View = "loading" | "pick" | "booked" | "error";

function ErrorCard({ message, title }: { message?: string; title?: string }) {
  const isDeadline =
    message?.toLowerCase().includes("deadline") || title?.toLowerCase().includes("deadline");

  if (isDeadline) {
    return (
      <Card className="w-full">
        <CardContent className="py-10 text-center space-y-2">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-500 text-xl">
            ⏱️
          </div>
          <h1 className="text-base font-semibold text-foreground">
            {title ?? "The booking deadline has passed"}
          </h1>
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">
            {message ??
              "The booking window for this round has closed. Please contact the recruiter for assistance."}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardContent className="py-10 text-center">
        <h1 className="text-sm font-semibold text-foreground">
          {title ?? "Unable to load booking"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {message ??
            "The link may have expired or the token is missing. Ask the recruiter for a fresh link."}
        </p>
      </CardContent>
    </Card>
  );
}

function useCandidateToken(): string {
  const params = useSearchParams();
  return params.get("tok") ?? "";
}

export default function BookPage() {
  const { id: riId } = useParams<{ id: string }>();
  const token = useCandidateToken();
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode") ?? "";
  const eventId = searchParams.get("event_id") ?? "";
  const interviewerEmail = searchParams.get("interviewer_email") ?? "";

  const [ctx, setCtx] = useState<BookingContext | null>(null);
  const [view, setView] = useState<View>("loading");
  const [error, setError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{ start: string; end: string } | null>(null);
  const [booking, setBooking] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [success, setSuccess] = useState<BookingContext["round_instance"] | null>(null);

  useEffect(() => {
    if (!riId) {
      setView("error");
      setError("No booking reference found in the URL.");
      return;
    }
    let cancelled = false;
    fetchBookingContext(riId, token)
      .then((c) => {
        if (cancelled) return;
        setCtx(c);
        if (
          (c.booked_event?.event_id && mode !== "reschedule") ||
          c.round_instance.status === "scheduled" ||
          c.round_instance.status === "passed" ||
          c.round_instance.status === "completed"
        ) {
          setView("booked");
        } else {
          setView("pick");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setView("error");
          const msg =
            err instanceof Error && err.message !== "invalid_link"
              ? err.message
              : "This interview booking link is invalid or has expired. A valid security token is required. Please check your latest invitation message or contact the recruiter for a fresh link.";
          setError(msg);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, riId, mode]);

  const activeEventId =
    eventId || ctx?.booked_event?.event_id || ctx?.round_instance?.event_id || undefined;
  const activeInterviewerEmail =
    interviewerEmail ||
    ctx?.booked_event?.interviewer_email ||
    ctx?.round?.interviewer_email ||
    undefined;
  const isRescheduleMode =
    mode === "reschedule" ||
    isRescheduling ||
    Boolean(activeEventId && ctx?.round_instance?.status === "scheduled");

  const handleBook = async (payload: {
    slot_start: string;
    slot_end: string;
    event_id?: string;
    interviewer_email?: string;
    is_reschedule?: boolean;
  }) => {
    if (!ctx) return;

    // Guard: Prevent weekend bookings
    const slotDate = new Date(payload.slot_start);
    const dayOfWeek = slotDate.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      const weekendErr =
        "Weekend bookings are not permitted. Please choose a weekday (Monday to Friday).";
      toast.error(weekendErr);
      setBookingError(weekendErr);
      return;
    }

    setBooking(true);
    setBookingError(null);
    try {
      const resolvedEventId = payload.event_id || activeEventId;
      const resolvedInterviewerEmail = payload.interviewer_email || activeInterviewerEmail;
      const willReschedule =
        Boolean(payload.is_reschedule) ||
        isRescheduleMode ||
        Boolean(resolvedEventId && ctx.round_instance.status === "scheduled");

      await bookSlot({
        round_instance_id: ctx.round_instance.id,
        token,
        slot_start: payload.slot_start,
        slot_end: payload.slot_end,
        event_id: resolvedEventId,
        interviewer_email: resolvedInterviewerEmail,
        is_reschedule: willReschedule,
      });
      setSuccess({
        ...ctx.round_instance,
        scheduled_at: payload.slot_start,
        status: "scheduled",
      });
      setIsRescheduling(false);
      setView("booked");
      toast.success(
        willReschedule
          ? "Interview rescheduled successfully!"
          : "Interview slot booked successfully!",
      );
    } catch (err) {
      let message = err instanceof Error ? err.message : "Something went wrong";
      if (/interview_slot_unavailable|already booked|slot_unavailable|45000/i.test(message)) {
        message =
          "This interview slot was just booked by another candidate. Please select another convenient time slot.";
      } else if (
        /error in the workflow|error in workflow|workflow execution failed/i.test(message)
      ) {
        message =
          "Unable to book this slot at this time. Please choose another slot or contact the recruiter.";
      }
      toast.error(message);
      setBookingError(message);
    } finally {
      setBooking(false);
    }
  };

  if (view === "error") return <ErrorCard message={error ?? undefined} />;
  if (view === "loading") {
    return (
      <div className="py-20 text-center text-sm text-label-secondary">Loading booking details…</div>
    );
  }
  if (view === "booked" && (success || ctx)) {
    const r = success ?? ctx?.round_instance ?? null;
    const meetLink = r?.meet_link ?? ctx?.round_instance.meet_link ?? null;
    const companyName = (ctx?.account as { company_name?: string | null })?.company_name;
    const roleName = ctx?.campaign?.name;
    return (
      <div className="py-12 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-fill-quaternary/70 text-2xl">
          ✓
        </div>
        <h1 className="text-2xl font-bold tracking-[-0.022em] text-foreground">
          Your slot is booked!
        </h1>
        {roleName && (
          <p className="mt-1 text-xs font-medium text-muted-foreground">
            {roleName}
            {companyName && <span> · {companyName}</span>}
          </p>
        )}
        {r?.scheduled_at && (
          <p className="mt-2 text-sm text-label-secondary">{formatDateTime(r?.scheduled_at)}</p>
        )}
        {meetLink && (
          <p className="mt-3">
            <a
              href={meetLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-[14px] bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Join via Google Meet
            </a>
          </p>
        )}
        {!meetLink && (
          <p className="mt-3 text-sm text-label-secondary">
            The interview link will be emailed shortly to you.
          </p>
        )}
        {!success && (
          <button
            type="button"
            onClick={() => {
              setIsRescheduling(true);
              setView("pick");
            }}
            className="mt-5 text-xs font-medium text-primary hover:text-accent-foreground"
          >
            Need to reschedule?
          </button>
        )}
      </div>
    );
  }

  const companyName = (ctx?.account as { company_name?: string | null })?.company_name;
  const roleName = ctx?.campaign?.name;

  return (
    <div>
      <div className="mb-2">
        {roleName && (
          <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-primary">
            {roleName}
            {companyName && (
              <span className="text-muted-foreground font-normal"> · {companyName}</span>
            )}
          </div>
        )}
        <h1 className="text-2xl font-bold tracking-[-0.022em] text-foreground">Pick a time</h1>
        <p className="mt-1 text-sm text-label-secondary">
          {isRescheduleMode ? "Select a new slot below:" : "Choose a slot to book your interview."}
        </p>
      </div>

      <div className="mt-3.5 flex items-start gap-2.5 rounded-xl border border-border/70 bg-fill-quaternary/70 p-3.5 text-xs text-muted-foreground">
        <span className="shrink-0 text-base leading-none">ℹ️</span>
        <div className="leading-relaxed">
          <strong className="text-foreground">Schedule Notice:</strong> By default, interview slots
          are available from <strong>Monday to Friday only</strong> (weekends excluded). If your
          campaign opens on a weekend, the earliest available booking day is Monday.
        </div>
      </div>

      {bookingError && (
        <div className="mt-4 rounded-2xl border border-destructive/20 bg-destructive/10 p-4 text-xs font-medium text-destructive">
          {bookingError}
        </div>
      )}
      <SlotPicker
        ctx={ctx as BookingContext}
        eventId={activeEventId}
        interviewerEmail={activeInterviewerEmail}
        isReschedule={isRescheduleMode}
        onSelect={handleBook}
        loading={booking}
        selected={selectedSlot}
        setSelected={setSelectedSlot}
      />
    </div>
  );
}

function SlotPicker({
  ctx,
  eventId,
  interviewerEmail,
  isReschedule,
  onSelect,
  loading,
  selected,
  setSelected,
}: {
  ctx: BookingContext;
  eventId?: string;
  interviewerEmail?: string;
  isReschedule?: boolean;
  onSelect: (s: {
    slot_start: string;
    slot_end: string;
    event_id?: string;
    interviewer_email?: string;
    is_reschedule?: boolean;
  }) => void;
  loading: boolean;
  selected: { start: string; end: string } | null;
  setSelected: (s: { start: string; end: string } | null) => void;
}) {
  const defaultTz =
    (ctx.account as { timezone?: string | null })?.timezone ||
    (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : null) ||
    "Asia/Kolkata";
  const [tz, setTz] = useState(defaultTz);
  const token = useSearchParams().get("tok") ?? "";
  const riId = useParams<{ id: string }>().id;
  const dailyStart = ctx.round.daily_start_time ?? "09:00";
  const dailyEnd = ctx.round.daily_end_time ?? "18:00";

  const availableDays = useMemo(() => {
    const out: Date[] = [];
    const now = new Date();
    const todayStr = localDateKey(now);

    let start = new Date();
    const openingDate = (ctx.campaign as { opening_date?: string | null })?.opening_date;
    if (openingDate && openingDate > todayStr) {
      const [y, m, d] = openingDate.split("-").map(Number);
      start = new Date(y, m - 1, d);
    }

    const closingDateStr =
      (ctx.campaign as { closing_date?: string | null })?.closing_date ||
      (ctx.round_instance.deadline_at ? ctx.round_instance.deadline_at.slice(0, 10) : null);

    const curr = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    let safetyCounter = 0;
    while (safetyCounter < 60) {
      safetyCounter++;
      const dayOfWeek = curr.getDay();
      const currStr = localDateKey(curr);

      if (closingDateStr && currStr > closingDateStr) {
        break;
      }

      // Exclude weekends (Saturday: 6, Sunday: 0)
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        out.push(new Date(curr));
        if (!closingDateStr && out.length >= 10) {
          break;
        }
      }

      curr.setDate(curr.getDate() + 1);
    }
    return out;
  }, [
    (ctx.campaign as { opening_date?: string | null })?.opening_date,
    (ctx.campaign as { closing_date?: string | null })?.closing_date,
    ctx.round_instance.deadline_at,
  ]);

  const [activeDay, setActiveDay] = useState(
    availableDays[0] ? localDateKey(availableDays[0]) : "",
  );

  useEffect(() => {
    if (availableDays.length > 0 && !availableDays.some((d) => localDateKey(d) === activeDay)) {
      setActiveDay(localDateKey(availableDays[0]));
    }
  }, [availableDays, activeDay]);

  const [slotsData, setSlotsData] = useState<AvailableSlots | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);

  useEffect(() => {
    if (!activeDay || !riId || !token) return;
    let cancelled = false;
    setLoadingSlots(true);
    fetchAvailableSlots(riId, token, activeDay, dailyStart, dailyEnd, tz)
      .then((data) => {
        if (!cancelled) setSlotsData(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingSlots(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeDay, dailyStart, dailyEnd, tz, token, riId]);

  const proposed = useMemo(
    () =>
      buildTimeSlots({
        startTime: dailyStart,
        endTime: dailyEnd,
        stepMinutes: 30,
        durationMinutes: ctx.round.duration_minutes ?? 45,
      }),
    [dailyStart, dailyEnd, ctx.round.duration_minutes],
  );

  const blocked = useMemo(
    () =>
      (slotsData?.blocked ?? []).map((b) => ({
        start: new Date(b.start).getTime(),
        end: new Date(b.end).getTime(),
      })),
    [slotsData],
  );

  const freeSlots = proposed.filter((s) => {
    const isToday = activeDay === localDateKey(new Date());
    if (isToday) {
      const [sh, sm] = s.start.split(":").map(Number);
      const slotStartLocal = new Date();
      slotStartLocal.setHours(sh, sm, 0, 0);
      // Filter out slots that have already started or start in under 15 minutes
      if (slotStartLocal.getTime() <= Date.now() + 15 * 60 * 1000) {
        return false;
      }
    }
    const sStart = new Date(`${activeDay}T${s.start}:00`).getTime();
    const sEnd = new Date(`${activeDay}T${s.end}:00`).getTime();
    return !blocked.some((b) => b.start < sEnd && b.end > sStart);
  });

  const submit = () => {
    if (!selected) return;
    const isoStart = new Date(`${activeDay}T${selected.start}:00`).toISOString();
    const isoEnd = new Date(`${activeDay}T${selected.end}:00`).toISOString();
    onSelect({
      slot_start: isoStart,
      slot_end: isoEnd,
      event_id: eventId || undefined,
      interviewer_email: interviewerEmail || undefined,
      is_reschedule: isReschedule,
    });
  };

  return (
    <div className="glass-panel mt-6 space-y-5 rounded-[28px] p-5 sm:p-6">
      <div>
        <p className="mb-1 text-xs font-medium text-label-secondary">
          Select a day{" "}
          <span className="text-[11px] text-muted-foreground/80 font-normal">(Mon–Fri)</span>
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {availableDays.map((d) => {
            const key = localDateKey(d);
            return (
              <button
                type="button"
                key={key}
                onClick={() => setActiveDay(key)}
                className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${
                  activeDay === key
                    ? "border-transparent bg-primary text-primary-foreground"
                    : "border-border/60 bg-fill-quaternary text-foreground hover:bg-fill-secondary"
                }`}
              >
                <div className="text-[11px] uppercase">
                  {d.toLocaleDateString(undefined, { weekday: "short" })}
                </div>
                <div>{d.getDate()}</div>
                <div className="text-[10px] text-label-tertiary">
                  {d.toLocaleDateString(undefined, { month: "short" })}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-label-secondary">Pick a slot</p>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="text-[13px]">🌐</span>
            <select
              aria-label="Timezone"
              value={tz}
              onChange={(e) => {
                setTz(e.target.value);
                setSelected(null);
              }}
              className="rounded-lg border border-border/70 bg-fill-quaternary px-2 py-1 text-xs text-foreground focus:outline-none"
            >
              <option value="Asia/Kolkata">India (IST · Asia/Kolkata)</option>
              <option value="Asia/Dubai">Dubai (GST · Asia/Dubai)</option>
              <option value="Asia/Singapore">Singapore (SGT · Asia/Singapore)</option>
              <option value="Asia/Riyadh">Riyadh (AST · Asia/Riyadh)</option>
              <option value="Europe/London">London (GMT/BST · Europe/London)</option>
              <option value="Europe/Berlin">Berlin (CET · Europe/Berlin)</option>
              <option value="America/New_York">New York (ET · America/New_York)</option>
              <option value="America/Chicago">Chicago (CT · America/Chicago)</option>
              <option value="America/Los_Angeles">Los Angeles (PT · America/Los_Angeles)</option>
              <option value="Australia/Sydney">Sydney (AET · Australia/Sydney)</option>
              <option value="UTC">UTC</option>
            </select>
          </div>
        </div>
        {loadingSlots ? (
          <div className="space-y-2 py-6">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : freeSlots.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            No slots available on this day. Pick another day.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {freeSlots.map((s) => {
              const active = selected?.start === s.start && selected?.end === s.end;
              return (
                <button
                  type="button"
                  key={s.start}
                  onClick={() => setSelected(active ? null : { start: s.start, end: s.end })}
                  disabled={loading}
                  className={`rounded-xl border px-2 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    active
                      ? "border-transparent bg-primary text-primary-foreground"
                      : "border-border/60 bg-fill-quaternary text-foreground hover:bg-fill-secondary"
                  }`}
                >
                  {formatTime(s.start)} – {formatTime(s.end)}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <Button className="w-full" onClick={submit} disabled={!selected || loading}>
        {loading
          ? "Booking…"
          : selected
            ? `Confirm ${formatTime(selected.start)} – ${formatTime(selected.end)}`
            : "Select a slot above"}
      </Button>
    </div>
  );
}
