import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatLocalDate } from '../../reservation/hooks/useReservation';
import { formatTimeRange } from '../../availability/utils/availability.utils';
import type { Slot } from '../../reservation/types/reservation.types';

interface ServicePanelProps {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  slots: Slot[];
  loading: boolean;
  error: string | null;
  selectedTime: string | null;
  onSelectTime: (time: string) => void;
}

const navButton =
  'w-10 h-10 rounded-xl bg-white border border-[#D4CDBA] flex items-center justify-center text-[#1C2826] hover:bg-[#EFE4D2] disabled:opacity-40 disabled:hover:bg-white transition-colors cursor-pointer disabled:cursor-not-allowed';

const shiftDay = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

// Day navigation and the services of that day, with how full each one is
export const ServicePanel: React.FC<ServicePanelProps> = ({
  selectedDate,
  onSelectDate,
  slots,
  loading,
  error,
  selectedTime,
  onSelectTime,
}) => {
  const today = formatLocalDate(new Date());
  const selectedKey = formatLocalDate(selectedDate);
  const isToday = selectedKey === today;
  const freeSeats = slots.reduce((sum, slot) => sum + slot.available_seats, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={navButton} aria-label="Previous day" disabled={selectedKey <= today} onClick={() => onSelectDate(shiftDay(selectedDate, -1))}>
          <ChevronLeft className="w-4 h-4" />
        </button>
        <input
          type="date"
          aria-label="Day"
          min={today}
          value={selectedKey}
          onChange={(e) => {
            if (e.target.value) onSelectDate(new Date(`${e.target.value}T00:00:00`));
          }}
          className="px-4 py-2.5 rounded-xl border border-[#D4CDBA] bg-white text-sm font-medium text-[#1C2826] focus:outline-none focus:ring-2 focus:ring-[#234E39]/30"
        />
        <button type="button" className={navButton} aria-label="Next day" onClick={() => onSelectDate(shiftDay(selectedDate, 1))}>
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          type="button"
          disabled={isToday}
          onClick={() => {
            const d = new Date();
            d.setHours(0, 0, 0, 0);
            onSelectDate(d);
          }}
          className="px-3 py-2.5 rounded-xl text-xs font-medium text-[#234E39] hover:bg-[#EAF3EE] disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer disabled:cursor-default"
        >
          Today
        </button>
        <span className="ml-auto text-xs text-[#7C8885]">
          {selectedDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
        </span>
      </div>

      {loading ? (
        <p className="text-sm text-[#7C8885]">Loading services...</p>
      ) : error ? (
        <p role="alert" className="text-sm text-[#B00020]">{error}</p>
      ) : slots.length === 0 ? (
        <p className="text-sm text-[#7C8885] bg-[#FAF6EE] rounded-xl p-4">
          No service with free seats on this day. Set up slots under "Manage slots", or try another day.
        </p>
      ) : (
        <>
          <p className="text-xs text-[#7C8885]">
            {slots.length} {slots.length === 1 ? 'service' : 'services'} · {freeSeats} seats free
          </p>
          <div role="radiogroup" aria-label="Service" className="grid sm:grid-cols-2 gap-3">
            {slots.map((slot) => {
              const selected = selectedTime === slot.start_time;
              const taken = slot.total_seats - slot.available_seats;
              const percent = slot.total_seats > 0 ? Math.round((taken / slot.total_seats) * 100) : 0;
              return (
                <button
                  key={slot.start_time}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onSelectTime(slot.start_time)}
                  className={`text-left rounded-xl border p-4 transition-all cursor-pointer ${
                    selected
                      ? 'border-[#234E39] bg-[#EAF3EE] ring-2 ring-[#234E39]/20'
                      : 'border-[#D4CDBA] bg-white hover:border-[#234E39]'
                  }`}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="font-serif font-bold text-[#1C2826]">{formatTimeRange(slot.start_time, slot.duration)}</span>
                    <span className="text-xs font-semibold text-[#234E39]">{slot.available_seats} free</span>
                  </div>
                  <div className="mt-3 h-1.5 rounded-full bg-[#EFE4D2] overflow-hidden" aria-hidden="true">
                    <div className={`h-full rounded-full ${percent >= 80 ? 'bg-[#B00020]' : 'bg-[#234E39]'}`} style={{ width: `${percent}%` }} />
                  </div>
                  <div className="mt-1.5 text-[11px] text-[#7C8885]">
                    {taken} of {slot.total_seats} seats taken
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};