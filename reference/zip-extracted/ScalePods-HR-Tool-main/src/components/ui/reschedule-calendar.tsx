"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { Calendar } from "@/components/ui/calendar"

interface RescheduleCalendarProps {
  eventId?: string;
  email?: string;
  candidate?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

function formatTime12(h: number, m: number): string {
  const period = h >= 12 ? "PM" : "AM"
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${hour12}:${m.toString().padStart(2, "0")} ${period}`
}

interface Slot {
  value: string;
  label: string;
  hour: number;
  minute: number;
}

/* ─── Time Carousel ─── */
function TimeCarousel({
  slots,
  selected,
  onSelect,
}: {
  slots: Slot[];
  selected: string | null;
  onSelect: (v: string) => void;
}) {
  const selIndex = selected ? slots.findIndex(s => s.value === selected) : -1

  function goNext() {
    if (selIndex < 0) { onSelect(slots[0].value); return }
    if (selIndex < slots.length - 1) onSelect(slots[selIndex + 1].value)
  }

  function goPrev() {
    if (selIndex < 0) { onSelect(slots[0].value); return }
    if (selIndex > 0) onSelect(slots[selIndex - 1].value)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); goNext() }
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); goPrev() }
  }

  function handleWheel(e: React.WheelEvent) {
    if (e.deltaY < 0) goPrev()
    else goNext()
  }

  // Auto-select first slot if nothing is selected
  React.useEffect(() => {
    if (slots.length > 0 && !selected) {
      onSelect(slots[0].value)
    }
  }, [slots, selected, onSelect])

  const selectedSlot = selected ? slots.find(s => s.value === selected) : null

  if (slots.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-400 text-center px-4">
        <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <p className="text-sm font-semibold text-gray-900 mb-1">No slots available</p>
        <p className="text-[12px] text-gray-500">All time slots for this date have passed or are booked.</p>
      </div>
    )
  }

  if (!selected) return null

  const visibleIndices: number[] = []
  for (let i = selIndex - 2; i <= selIndex + 2; i++) {
    if (i >= 0 && i < slots.length) visibleIndices.push(i)
  }

  return (
    <div
      className="flex-1 flex flex-col items-center justify-center select-none outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onWheel={handleWheel}
      role="listbox"
      aria-label="Available time slots"
    >
      <div className="w-full max-w-[340px] flex flex-col items-center gap-6">
        {/* Carousel row */}
        <div className="flex items-center justify-center gap-4 w-full">
          {/* Previous arrow */}
          <button
            type="button"
            onClick={goPrev}
            disabled={selIndex <= 0}
            className="shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center border border-gray-200 bg-white text-gray-400 hover:text-[#2563eb] hover:border-[#2563eb] hover:shadow-sm transition-all duration-200 cursor-pointer disabled:opacity-20 disabled:cursor-default"
            aria-label="Previous time"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          {/* Center: selected card */}
          <motion.div
            key={selected}
            initial={{ opacity: 0, scale: 0.9, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="flex-1 max-w-[200px]"
          >
            <div className="bg-gradient-to-br from-[#2563eb] to-[#3b82f6] rounded-[28px] shadow-xl shadow-blue-200/40 px-4 py-6 text-center border border-white/10">
              <p className="text-[32px] font-black text-white leading-tight tracking-tight">
                {selectedSlot?.label.split(' ')[0]}
              </p>
              <p className="text-[14px] font-bold text-white/90 uppercase tracking-widest mt-0.5">
                {selectedSlot?.label.split(' ')[1]}
              </p>
              <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1 bg-white/20 backdrop-blur-md rounded-full border border-white/10">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                </svg>
                <span className="text-[10px] font-bold text-white tracking-wide uppercase">30 Min Session</span>
              </div>
            </div>
          </motion.div>

          {/* Next arrow */}
          <button
            type="button"
            onClick={goNext}
            disabled={selIndex >= slots.length - 1}
            className="shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center border border-gray-200 bg-white text-gray-400 hover:text-[#2563eb] hover:border-[#2563eb] hover:shadow-sm transition-all duration-200 cursor-pointer disabled:opacity-20 disabled:cursor-default"
            aria-label="Next time"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>

        {/* Slot count */}
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">
           Slot {selIndex + 1} of {slots.length} available
        </p>

        {/* Adjacent pill buttons */}
        <div className="flex items-center justify-center gap-2.5 flex-wrap min-h-[40px]">
          {visibleIndices.map((i) => {
            const slot = slots[i]
            const isSel = i === selIndex
            return (
              <motion.button
                key={slot.value}
                layoutId={`pill-${slot.value}`}
                type="button"
                onClick={() => onSelect(slot.value)}
                className={`px-3.5 py-1.5 rounded-xl text-[11px] font-bold transition-all duration-300 cursor-pointer border ${
                  isSel
                    ? 'bg-[#2563eb] text-white border-ring shadow-md shadow-blue-100 scale-105'
                    : 'bg-white text-gray-500 hover:text-ring hover:border-ring/30 border-gray-100 shadow-sm'
                }`}
              >
                {slot.label}
              </motion.button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

type ToastType = { message: string; type: "success" | "error" } | null

/* ─── Main Component ─── */
export function RescheduleCalendar({ eventId, email, candidate, onSuccess, onCancel }: RescheduleCalendarProps) {
  const [date, setDate] = React.useState<Date | undefined>(new Date())
  const [selectedTime, setSelectedTime] = React.useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [toast, setToast] = React.useState<ToastType>(null)

  React.useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 400)
    return () => clearTimeout(timer)
  }, [])

  React.useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const timeSlots: Slot[] = React.useMemo(() => {
    return Array.from({ length: 55 }, (_, i) => {
      const totalMinutes = i * 15
      const hour = Math.floor(totalMinutes / 60) + 9
      const minute = totalMinutes % 60
      const hh = hour.toString().padStart(2, "0")
      const mm = minute.toString().padStart(2, "0")
      return {
        value: `${hh}:${mm}`,
        label: formatTime12(hour, minute),
        hour,
        minute,
      }
    })
  }, [])

  const filteredTimeSlots = React.useMemo(() => {
    if (!date) return []
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()
    
    if (!isToday) return timeSlots
    
    // Filter out past slots for today (add 5 min buffer to not show slots about to happen)
    return timeSlots.filter(slot => {
      const slotTime = new Date(date)
      slotTime.setHours(slot.hour, slot.minute, 0, 0)
      return slotTime.getTime() > (now.getTime() + 5 * 60 * 1000)
    })
  }, [date, timeSlots])

  const handleSubmit = async () => {
    if (!date || !selectedTime) return;

    setIsSubmitting(true);
    setToast(null);
    console.log('[Reschedule] selected date object:', date, 'getDate():', date.getDate(), 'getMonth():', date.getMonth()+1, 'getFullYear():', date.getFullYear());
    const payload = {
      action: 'RescheduleInterview',
      eventId: eventId,
      interviewerEmail: email,
      newDate: date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0'),
      newTime: selectedTime,
      candidate: candidate,
    };

    try {
      const response = await fetch('https://n8n.srv1711190.hstgr.cloud/webhook/538777bd-75c0-4a62-a409-9a8e1e42c5fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const body = await response.json();

      if (!response.ok) throw new Error(body.message || 'Failed to reschedule');

      if (body.status === 'Booking Confirmed') {
        setToast({ message: 'Meeting rescheduled successfully!', type: 'success' });
        if (onSuccess) setTimeout(onSuccess, 1200);
      } else if (body.status === 'unavailable') {
        setToast({ message: 'This slot is already occupied — please pick another time.', type: 'error' });
      } else {
        setToast({ message: 'Unexpected response from server.', type: 'error' });
      }
    } catch (error) {
      console.error('Error rescheduling:', error);
      setToast({ message: error instanceof Error ? error.message : 'Something went wrong', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedSlotLabel = React.useMemo(() => {
    if (!date || !selectedTime) return null
    const d = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })
    const slot = timeSlots.find(s => s.value === selectedTime)
    return `${d} \u2022 ${slot?.label || selectedTime}`
  }, [date, selectedTime, timeSlots])

  return (
    <div className="flex flex-col max-h-[85vh] bg-white font-sans relative">
      {/* ─── Toast ─── */}
      {toast && (
        <motion.div
          key={toast.message}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.2 }}
          className={`absolute top-0 left-0 right-0 z-50 px-4 py-3 text-[13px] font-semibold flex items-center gap-2.5 shadow-lg ${
            toast.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border-b border-emerald-200'
              : 'bg-red-50 text-red-700 border-b border-red-200'
          }`}
        >
          {toast.type === 'success' ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          )}
          <span className="flex-1">{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="shrink-0 opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </motion.div>
      )}

      {/* ─── Header ─── */}
      <div className="flex items-center justify-between px-10 py-6 border-b border-gray-100 shrink-0 bg-white/50 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#2563eb] to-[#3b82f6] flex items-center justify-center shadow-lg shadow-blue-200/50">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <div>
            <h1 className="text-[16px] font-bold text-gray-900 tracking-tight">Reschedule Interview</h1>
            <p className="text-[13px] text-gray-500 font-medium mt-0.5 opacity-80">
              {candidate || "Candidate"}{email ? ` \u2022 ${email}` : ""}
            </p>
          </div>
        </div>
        {date && (
          <div className="flex items-center gap-2.5 px-4 py-2 bg-blue-50/80 border border-blue-100 rounded-2xl shadow-sm">
            <div className="w-2 h-2 rounded-full bg-[#2563eb] shadow-[0_0_8px_rgba(37,99,235,0.4)]"></div>
            <span className="text-[13px] font-bold text-[#2563eb] tracking-tight">
              {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
        )}
      </div>

      {/* ─── Body ─── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="flex flex-col lg:flex-row items-stretch min-h-[500px]">
          {/* Calendar Section (Left Side) */}
          <div className="flex-1 flex flex-col items-center py-10 px-10 border-b lg:border-b-0 lg:border-r border-gray-100/60">
            <div className="w-full max-w-[320px]">
              <div className="text-center mb-10">
                <h2 className="text-[13px] font-extrabold uppercase tracking-[0.2em] text-ring mb-2.5">1. Select Date</h2>
                <p className="text-[15px] text-gray-500 font-semibold opacity-70">When would you like to meet?</p>
              </div>
              <div className="flex justify-center bg-gray-50/40 p-5 rounded-[32px] border border-gray-100/50 shadow-inner">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(d) => { setDate(d); setSelectedTime(null) }}
                  disabled={(d) => d < new Date(new Date().setHours(0,0,0,0))}
                  showOutsideDays={false}
                  className="p-0"
                  classNames={{
                    months: "flex justify-center",
                    month: "w-full",
                    month_caption: "flex justify-center items-center py-5 h-14",
                    caption_label: "text-[18px] font-black text-gray-900 tracking-tight",
                    month_grid: "mx-auto",
                    day: "text-base text-gray-600",
                    day_button: "h-[46px] w-[46px] text-[15px] font-bold rounded-2xl hover:bg-white hover:shadow-md hover:text-[#2563eb] transition-all duration-300 flex items-center justify-center text-gray-700",
                    today: "text-[#2563eb] font-black before:bg-[#2563eb]/10 before:absolute before:inset-1.5 before:rounded-2xl",
                    selected: "bg-[#2563eb] text-white shadow-xl shadow-blue-200/60 hover:bg-[#2563eb] hover:text-white rounded-2xl scale-110 z-10 border-2 border-white/20",
                    outside: "text-gray-300 opacity-20",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Time Carousel Section (Right Side) */}
          <div className="flex-1 flex flex-col items-center py-10 px-10 bg-gray-50/20">
            <div className="w-full max-w-[320px]">
              <div className="text-center mb-10">
                <h2 className="text-[13px] font-extrabold uppercase tracking-[0.2em] text-ring mb-2.5">2. Select Time</h2>
                <p className="text-[15px] text-gray-500 font-semibold opacity-70">
                  {date ? date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : 'Pick a date first'}
                </p>
              </div>
              
              {loading ? (
                <div className="flex flex-col items-center gap-8 mt-10">
                  <div className="h-7 w-40 bg-gray-200/40 rounded-full animate-pulse" />
                  <div className="h-[200px] w-full bg-white rounded-[40px] animate-pulse border border-gray-100 shadow-sm" />
                  <div className="flex gap-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="h-12 w-28 bg-white rounded-2xl animate-pulse border border-gray-100 shadow-sm" />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex justify-center min-h-[340px]">
                  <TimeCarousel
                    slots={filteredTimeSlots}
                    selected={selectedTime}
                    onSelect={setSelectedTime}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Footer ─── */}
      <div className="flex items-center justify-between px-10 py-6 border-t border-gray-100 bg-white/80 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center text-[#2563eb] shadow-inner border border-blue-100/50">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
              <path d="M8 14h.01" /><path d="M12 14h.01" /><path d="M16 14h.01" /><path d="M8 18h.01" /><path d="M12 18h.01" /><path d="M16 18h.01" />
            </svg>
          </div>
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.15em] text-gray-400">Confirmation</p>
            <p className={`text-[15px] font-black tracking-tight transition-all duration-300 ${selectedSlotLabel ? 'text-gray-900' : 'text-gray-300'}`}>
              {selectedSlotLabel || "Pick a slot to continue"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="px-8 py-3.5 rounded-xl text-[13px] font-bold text-gray-500 hover:text-gray-800 bg-transparent hover:bg-gray-100/50 border border-gray-200 hover:border-gray-300 transition-all duration-300 cursor-pointer disabled:opacity-40"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            disabled={!date || !selectedTime || isSubmitting}
            onClick={handleSubmit}
            className={`px-10 py-3.5 rounded-xl text-[13px] font-extrabold text-white transition-all duration-500 cursor-pointer disabled:cursor-not-allowed flex items-center gap-3 shadow-lg ${
              isSubmitting
                ? 'bg-[#2563eb]/70'
                : 'bg-gradient-to-r from-[#2563eb] to-[#3b82f6] hover:shadow-blue-200/50 hover:scale-[1.03] active:scale-[0.97]'
            } disabled:opacity-40 disabled:hover:scale-100 disabled:hover:shadow-none`}
          >
            {isSubmitting ? (
              <>
                <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Processing...
              </>
            ) : (
              <>
                Confirm Schedule
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                </svg>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
