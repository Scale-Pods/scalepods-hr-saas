"use client";

import type { AvailableSlots, BookingContext } from "@scalepods/core";
import { browserTimeZone, buildTimeSlots, formatDateTime, formatTime } from "@scalepods/core";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { bookSlot, fetchAvailableSlots, fetchBookingContext } from "@/features/candidate/api";

type View = "loading" | "pick" | "booked" | "error";

function ErrorCard({ message, title }: { message?: string; title?: string }) {
  return (
    <Card className="w-full">
      <CardContent className="py-10 text-center">
        <h1 className="text-sm font-semibold text-foreground">
          {title ?? "This link isn't working"}
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
  const [success, setSuccess] = useState<BookingContext["round_instance"] | null>(null);

  useEffect(() => {
    if (!token || !riId) {
      setView("error");
      setError("No access token found in the URL.");
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
          setError(err instanceof Error ? err.message : "Link invalid or expired.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, riId, mode]);

  const handleBook = async (payload: {
    slot_start: string;
    slot_end: string;
    event_id?: string;
    interviewer_email?: string;
  }) => {
    if (!ctx) return;
    setBooking(true);
    try {
      await bookSlot({ round_instance_id: ctx.round_instance.id, ...payload });
      setSuccess(ctx.round_instance);
      setView("booked");
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Something went wrong");
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
    return (
      <div className="py-12 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-fill-quaternary/70 text-2xl">
          ✓
        </div>
        <h1 className="text-2xl font-bold tracking-[-0.022em] text-foreground">
          Your slot is booked!
        </h1>
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
            The interview link will be emailed to you at 9 AM on the interview day.
          </p>
        )}
        {!success && (
          <button
            type="button"
            onClick={() => setView("pick")}
            className="mt-5 text-xs font-medium text-primary hover:text-accent-foreground"
          >
            Need to reschedule?
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-[-0.022em] text-foreground">Pick a time</h1>
      <p className="mt-1.5 text-sm text-label-secondary">
        {mode === "reschedule"
          ? "Select a new slot below:"
          : "Choose a slot to book your interview."}
      </p>
      <SlotPicker
        ctx={ctx as BookingContext}
        eventId={mode === "reschedule" ? eventId : undefined}
        interviewerEmail={mode === "reschedule" ? interviewerEmail : undefined}
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
  onSelect,
  loading,
  selected,
  setSelected,
}: {
  ctx: BookingContext;
  eventId?: string;
  interviewerEmail?: string;
  onSelect: (s: {
    slot_start: string;
    slot_end: string;
    event_id?: string;
    interviewer_email?: string;
  }) => void;
  loading: boolean;
  selected: { start: string; end: string } | null;
  setSelected: (s: { start: string; end: string } | null) => void;
}) {
  const tz = browserTimeZone();
  const token = useSearchParams().get("tok") ?? "";
  const riId = useParams<{ id: string }>().id;
  const dailyStart = ctx.round.daily_start_time ?? "09:00";
  const dailyEnd = ctx.round.daily_end_time ?? "18:00";

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
        durationMinutes: 45,
      }),
    [dailyStart, dailyEnd],
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
    });
  };

  return (
    <div className="glass-panel mt-6 space-y-5 rounded-[28px] p-5 sm:p-6">
      <div>
        <p className="mb-1 text-xs font-medium text-label-secondary">Select a day</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {next10.map((d) => {
            const key = d.toISOString().slice(0, 10);
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
        <p className="mb-1 text-xs font-medium text-label-secondary">Pick a slot · {tz}</p>
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
