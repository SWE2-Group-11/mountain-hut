import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { addDays, parseDate } from '../../repeat-week/utils/weeks';
import { formatLocalDate } from '../../slot-setup/utils/slotSetup.utils';
import { useDayMenus } from '../hooks/useDayMenus';
import type { DaySlot } from '../types/slotMenus.types';
import { slotHasStarted } from '../utils/menuWindow';
import { SlotMenuCard, type CardMode } from './SlotMenuCard';

interface OpenCard {
  startTime: string;
  mode: Exclude<CardMode, null>;
}

const longDate = (date: string): string =>
  parseDate(date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

const navButton =
  'p-2.5 rounded-xl border border-[#EFEADF] bg-white text-[#3C4A47] hover:bg-[#EFE4D2] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';

export const MenusBoard: React.FC = () => {
  const { date, setDate, slots, loading, error, reload, now, updateMenu } = useDayMenus();
  const [open, setOpen] = useState<OpenCard | null>(null);
  const [toast, setToast] = useState<{ title: string; text: string } | null>(null);

  // Days in the past cannot be chosen: their slots have started and their menus stay as they were
  const today = formatLocalDate(now);

  // The confirmation stays on screen wherever the page is scrolled, then goes away
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  const changeDay = (next: string) => {
    if (next < today) return;
    setOpen(null);
    setToast(null);
    setDate(next);
  };

  const shiftDay = (days: number) => changeDay(formatLocalDate(addDays(parseDate(date), days)));

  const saveMenu = async (slot: DaySlot, menu: string | null): Promise<string | null> => {
    const message = await updateMenu(slot, menu);
    if (message === null) {
      setOpen(null);
      const time = `${slot.startTime} - ${slot.endTime}`;
      setToast(
        menu === null
          ? { title: 'Menu removed', text: `The ${time} slot has no menu now.` }
          : { title: 'Menu saved', text: `The menu of the ${time} slot was saved.` },
      );
    }
    return message;
  };

  return (
    <div className="w-full max-w-4xl space-y-6">
      {toast && (
        <div
          role="status"
          className="fixed top-24 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-md flex items-center gap-3 rounded-2xl bg-[#234E39] text-white px-5 py-4 shadow-2xl"
        >
          <CheckCircle2 className="w-6 h-6 shrink-0" />
          <div className="text-sm">
            <p className="font-bold">{toast.title}</p>
            <p className="text-white/85">{toast.text}</p>
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Close confirmation"
            className="ml-auto p-1 rounded-lg hover:bg-white/15 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <button
          type="button"
          aria-label="Previous day"
          onClick={() => shiftDay(-1)}
          disabled={date <= today}
          className={navButton}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <label htmlFor="menus-day" className="block text-[10px] uppercase font-bold tracking-widest text-[#7C8885] mb-1.5">
            Day
          </label>
          <input
            id="menus-day"
            type="date"
            value={date}
            min={today}
            onChange={(e) => e.target.value && changeDay(e.target.value)}
            className="rounded-xl border border-[#EFEADF] bg-white px-3 py-2.5 text-sm text-[#1C2826] focus:outline-none focus:ring-2 focus:ring-[#234E39]/30"
          />
        </div>
        <button type="button" aria-label="Next day" onClick={() => shiftDay(1)} className={navButton}>
          <ChevronRight className="w-5 h-5" />
        </button>
        {date !== today && (
          <button
            type="button"
            onClick={() => changeDay(today)}
            className="px-4 py-2.5 rounded-xl border border-[#234E39] text-[#234E39] text-sm font-medium hover:bg-[#EFE4D2] cursor-pointer"
          >
            Back to today
          </button>
        )}
      </div>

      <h2 className="text-xl font-serif font-bold text-[#1C2826] flex flex-wrap items-center gap-3">
        {longDate(date)}
        {date === today && (
          <span className="px-3 py-1 rounded-full bg-[#E3F1E8] text-[#234E39] text-xs font-semibold">Today</span>
        )}
      </h2>

      {loading ? (
        <p role="status" className="text-[#7C8885]">
          Loading the slots...
        </p>
      ) : error ? (
        <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-2xl text-sm text-red-700 space-y-2">
          <p>{error}</p>
          <button type="button" onClick={reload} className="font-semibold underline cursor-pointer">
            Try again
          </button>
        </div>
      ) : slots.length === 0 ? (
        <div className="bg-white rounded-3xl border border-[#EFEADF] p-8 text-center space-y-3">
          <p className="text-[#5A6865]">There are no slots on this day, so there is no menu to write.</p>
          <Link
            to={`/staff/slots?date=${date}`}
            className="inline-block px-5 py-2.5 bg-[#234E39] text-white rounded-xl font-medium text-sm hover:bg-[#1C3E2E] transition-colors"
          >
            Create slots
          </Link>
        </div>
      ) : (
        <ul className="space-y-5">
          {slots.map((slot) => (
            <SlotMenuCard
              key={slot.startTime}
              slot={slot}
              started={slotHasStarted(slot, now)}
              mode={open?.startTime === slot.startTime ? open.mode : null}
              blocked={open !== null && open.startTime !== slot.startTime}
              onEdit={() => setOpen({ startTime: slot.startTime, mode: 'edit' })}
              onAskRemove={() => setOpen({ startTime: slot.startTime, mode: 'remove' })}
              onClose={() => setOpen(null)}
              onSave={(menu) => saveMenu(slot, menu)}
              onConfirmRemove={() => saveMenu(slot, null)}
            />
          ))}
        </ul>
      )}
    </div>
  );
};