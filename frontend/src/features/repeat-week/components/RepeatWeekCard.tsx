import React, { useEffect } from 'react';
import { AlertCircle, AlertTriangle, CalendarRange, CheckCircle2, Loader2, Repeat, X } from 'lucide-react';
import { useRepeatWeek } from '../hooks/useRepeatWeek';
import type { SlotConfiguration } from '../../slot-setup/types/slotSetup.types';
import { dayParts, monthLabel, weekLabel, type WeekOption } from '../utils/weeks';

const fieldClass =
  'w-full rounded-xl border border-[#EFEADF] bg-white px-3 py-2.5 text-sm text-[#1C2826] focus:outline-none focus:ring-2 focus:ring-[#234E39]/30';
const quickButtonClass =
  'px-3 py-1.5 rounded-lg border border-[#D4CDBA] bg-white text-xs font-medium text-[#1C2826] hover:bg-[#FAF6EE] disabled:opacity-50 cursor-pointer';
const linkButtonClass = 'text-xs font-semibold text-[#234E39] hover:underline disabled:opacity-50 cursor-pointer';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// The slots of the week, one entry per day (they arrive in time order)
const groupByDay = (slots: SlotConfiguration[]): { date: string; slots: SlotConfiguration[] }[] => {
  const days: { date: string; slots: SlotConfiguration[] }[] = [];
  for (const slot of slots) {
    const last = days[days.length - 1];
    if (last?.date === slot.date) last.slots.push(slot);
    else days.push({ date: slot.date, slots: [slot] });
  }
  return days;
};

// The weeks of the list, one entry per month
const groupByMonth = (weeks: WeekOption[]): { month: string; weeks: WeekOption[] }[] => {
  const months: { month: string; weeks: WeekOption[] }[] = [];
  for (const week of weeks) {
    const month = monthLabel(week.start);
    const last = months[months.length - 1];
    if (last?.month === month) last.weeks.push(week);
    else months.push({ month, weeks: [week] });
  }
  return months;
};

const StepTitle: React.FC<{ n: number; icon: React.ReactNode; children: React.ReactNode }> = ({ n, icon, children }) => (
  <h2 className="flex items-center gap-3 font-serif font-bold text-lg text-[#1C2826]">
    <span className="w-7 h-7 shrink-0 rounded-full bg-[#234E39] text-white text-sm font-sans font-bold flex items-center justify-center">
      {n}
    </span>
    {children}
    <span className="text-[#234E39] ml-auto">{icon}</span>
  </h2>
);

export const RepeatWeekCard: React.FC = () => {
  const s = useRepeatWeek();
  const { result, clearResult } = s;
  const busy = s.confirming || s.isSubmitting;
  const months = groupByMonth(s.targetOptions);
  const nothingToCopy = !s.sourceLoading && !s.sourceLoadFailed && s.sourceSlots.length === 0;

  // The confirmation closes by itself after a few seconds
  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(clearResult, 8000);
    return () => clearTimeout(timer);
  }, [result, clearResult]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    s.askConfirmation();
  };

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="w-full max-w-3xl bg-white rounded-[32px] p-6 sm:p-8 md:p-10 shadow-xl border border-[#EFEADF] space-y-8"
    >
      {/* CONFIRMATION: visible without scrolling, closes by itself */}
      {result && (
        <div
          role="status"
          className="fixed top-24 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-md flex items-center gap-3 rounded-2xl bg-[#234E39] text-white px-5 py-4 shadow-2xl"
        >
          <CheckCircle2 className="w-6 h-6 shrink-0" />
          <div className="text-sm">
            <p className="font-bold">Schedule copied</p>
            <p className="text-white/85">
              {plural(result.slotsPerWeek, 'slot')} copied into {plural(result.targetWeekStarts.length, 'week')}.
            </p>
          </div>
          <button
            type="button"
            onClick={s.clearResult}
            aria-label="Close confirmation"
            className="ml-auto p-1 rounded-lg hover:bg-white/15 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* SERVER ERROR POPUP */}
      {s.submitError && (
        <div
          role="alertdialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
        >
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl border border-red-100 space-y-4">
            <div className="w-12 h-12 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="font-serif font-bold text-lg text-[#1C2826]">Schedule not copied</h3>
              <p className="text-xs text-[#5A6865] leading-relaxed">{s.submitError}</p>
            </div>
            <button
              type="button"
              autoFocus
              onClick={s.clearSubmitError}
              className="w-full py-3 bg-[#1C2826] text-white rounded-xl font-medium text-xs hover:bg-black transition-colors cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* STEP 1: WHICH WEEK TO COPY */}
      <section className="space-y-4">
        <StepTitle n={1} icon={<CalendarRange className="w-5 h-5" />}>
          Which week do you want to copy?
        </StepTitle>
        <div>
          <label htmlFor="source-week" className="sr-only">
            Week to copy
          </label>
          <select
            id="source-week"
            value={s.sourceWeek}
            onChange={(e) => s.setSourceWeek(e.target.value)}
            disabled={busy}
            className={fieldClass}
          >
            {s.sourceOptions.map((w) => (
              <option key={w.start} value={w.start}>
                {w.label}
                {w.tag && ` (${w.tag.toLowerCase()})`}
              </option>
            ))}
          </select>
        </div>

        {/* WHAT IS IN THE CHOSEN WEEK */}
        <div aria-live="polite" className="rounded-2xl border border-[#EFEADF] bg-[#FAF6EE] p-4">
          {s.sourceLoading ? (
            <p className="text-xs text-[#7C8885]">Loading the slots of this week...</p>
          ) : s.sourceLoadFailed ? (
            <p className="text-xs text-red-700">Could not load the slots of this week. You can still try to copy it.</p>
          ) : nothingToCopy ? (
            <p className="text-sm text-[#5A6865]">
              This week has no slots, so there is nothing to copy. Choose another week, or set up its slots first.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-[#1C2826]">
                <span className="font-semibold">{plural(s.sourceSlots.length, 'slot')}</span> on{' '}
                {plural(groupByDay(s.sourceSlots).length, 'day')} will be copied, with their tables and seats.
              </p>
              <ul className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {groupByDay(s.sourceSlots).map((day) => {
                  const { weekday, date } = dayParts(day.date);
                  return (
                    <li key={day.date} className="grid sm:grid-cols-[7rem_1fr] gap-2 sm:gap-3 items-start">
                      <div className="pt-1.5">
                        <p className="text-sm font-semibold text-[#1C2826] leading-tight">{weekday}</p>
                        <p className="text-xs text-[#7C8885]">{date}</p>
                      </div>
                      <ul className="flex flex-wrap gap-2">
                        {day.slots.map((slot) => (
                          <li
                            key={slot.startTime}
                            className="rounded-xl bg-white border border-[#EFEADF] px-3 py-1.5 leading-tight"
                          >
                            <p className="text-sm font-semibold text-[#1C2826] tabular-nums">
                              {slot.startTime} - {slot.endTime}
                            </p>
                            <p className="text-[11px] text-[#7C8885]">
                              {plural(slot.tables.length, 'table')} · {slot.totalSeats} seats in total
                            </p>
                          </li>
                        ))}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </section>

      {/* STEP 2: WHICH WEEKS TO FILL */}
      <section className="space-y-4">
        <StepTitle n={2} icon={<Repeat className="w-5 h-5" />}>
          Which weeks should get it?
        </StepTitle>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[#5A6865] mr-1">Quick choice:</span>
          {[4, 8, 12].map((n) => (
            <button key={n} type="button" onClick={() => s.selectNext(n)} disabled={busy} className={quickButtonClass}>
              The next {n} weeks
            </button>
          ))}
          <button type="button" onClick={s.clearTargets} disabled={busy} className={quickButtonClass}>
            Clear
          </button>
        </div>

        <fieldset disabled={busy} className="border border-[#EFEADF] rounded-2xl max-h-96 overflow-y-auto">
          <legend className="sr-only">Weeks that will get the schedule</legend>
          {months.map(({ month, weeks }) => {
            const selectable = weeks.filter((w) => w.start !== s.sourceWeek);
            const allChecked = selectable.length > 0 && selectable.every((w) => s.targets.includes(w.start));
            return (
              <div key={month} className="border-b border-[#EFEADF] last:border-b-0">
                <div className="sticky top-0 z-10 flex items-center justify-between bg-[#FAF6EE] px-4 py-2">
                  <p className="text-xs font-bold uppercase tracking-widest text-[#5A6865]">{month}</p>
                  <button
                    type="button"
                    onClick={() => s.toggleWeeks(selectable.map((w) => w.start), !allChecked)}
                    disabled={busy || selectable.length === 0}
                    className={linkButtonClass}
                  >
                    {allChecked ? 'Untick the month' : 'Tick the whole month'}
                  </button>
                </div>
                <ul className="grid sm:grid-cols-2 gap-1 p-2">
                  {weeks.map((w) => {
                    const isSource = w.start === s.sourceWeek;
                    const checked = s.targets.includes(w.start);
                    const id = `target-${w.start}`;
                    return (
                      <li key={w.start}>
                        <label
                          htmlFor={id}
                          className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm ${
                            checked ? 'bg-[#EAF3EE] text-[#1C2826] font-medium' : 'hover:bg-[#FAF6EE] text-[#3C4A47]'
                          } ${isSource ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          <input
                            id={id}
                            type="checkbox"
                            checked={checked}
                            disabled={isSource}
                            onChange={() => s.toggleTarget(w.start)}
                            className="w-4 h-4 accent-[#234E39]"
                          />
                          <span>
                            {w.label}
                            {(isSource || w.tag) && (
                              <span className="ml-1.5 text-[10px] uppercase tracking-wider text-[#7C8885]">
                                {isSource ? 'Copied week' : w.tag}
                              </span>
                            )}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </fieldset>
      </section>

      {/* STEP 3: REVIEW AND COPY */}
      <section className="space-y-4">
        <StepTitle n={3} icon={<CheckCircle2 className="w-5 h-5" />}>
          Check and copy
        </StepTitle>

        {s.formError && (
          <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-red-700 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
            <div>{s.formError}</div>
          </div>
        )}

        {s.confirming ? (
          <div role="alertdialog" aria-label="Before you copy" className="border border-[#F0DFA8] bg-[#FFF8E6] rounded-2xl p-5 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 shrink-0 text-[#B7791F] mt-0.5" />
              <div className="space-y-2">
                <h3 className="font-serif font-bold text-lg text-[#1C2826]">
                  Copy {weekLabel(s.sourceWeek)} into {plural(s.targets.length, 'week')}?
                </h3>
                <ul className="text-sm text-[#5A6865] list-disc pl-5 space-y-1">
                  <li>A week that already has slots is completely replaced by this copy.</li>
                  <li>If any of these weeks has bookings, nothing is copied.</li>
                  <li>Bookings are never copied. You can change any slot afterwards.</li>
                </ul>
                <ul className="text-xs text-[#3C4A47] list-disc pl-5 space-y-0.5 max-h-28 overflow-y-auto">
                  {s.targets.map((t) => (
                    <li key={t}>{weekLabel(t)}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                autoFocus
                onClick={s.cancelConfirmation}
                disabled={s.isSubmitting}
                className="px-4 py-2 bg-white border border-[#D4CDBA] text-[#1C2826] rounded-xl text-sm font-medium hover:bg-[#FAF6EE] disabled:opacity-50 cursor-pointer"
              >
                Go back
              </button>
              <button
                type="button"
                onClick={() => void s.submit()}
                disabled={s.isSubmitting}
                className="flex items-center gap-2 px-4 py-2 bg-[#234E39] text-white rounded-xl text-sm font-medium hover:bg-[#1C3E2E] transition-colors disabled:opacity-50 cursor-pointer"
              >
                {s.isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Copying...
                  </>
                ) : (
                  `Yes, copy to ${plural(s.targets.length, 'week')}`
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-[#5A6865]">
              {s.targets.length === 0
                ? 'Choose at least one week in step 2.'
                : s.targets.length === 1
                  ? `${weekLabel(s.sourceWeek)} will be copied into ${weekLabel(s.targets[0])}.`
                  : `${weekLabel(s.sourceWeek)} will be copied into ${s.targets.length} weeks, from ${weekLabel(
                      s.targets[0],
                    )} to ${weekLabel(s.targets[s.targets.length - 1])}.`}
            </p>
            <button
              type="submit"
              disabled={s.targets.length === 0 || nothingToCopy}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-[#234E39] text-white rounded-xl text-sm font-medium hover:bg-[#1C3E2E] transition-colors disabled:opacity-40 disabled:hover:bg-[#234E39] disabled:cursor-not-allowed cursor-pointer"
            >
              <Repeat className="w-4 h-4" />
              {s.targets.length === 0 ? 'Copy schedule' : `Copy to ${plural(s.targets.length, 'week')}`}
            </button>
          </div>
        )}

        {/* LAST RESULT: stays on the page after the pop-up is gone */}
        {result && (
          <div aria-label="Last copy" role="region" className="border border-[#CFE3D6] bg-[#EAF3EE] rounded-2xl p-4 space-y-2">
            <p className="flex items-center gap-2 text-sm font-semibold text-[#1C2826]">
              <CheckCircle2 className="w-4 h-4 text-[#234E39]" />
              Done: {plural(result.slotsPerWeek, 'slot')} of {weekLabel(result.sourceWeekStart)} copied into:
            </p>
            <ul className="text-xs text-[#3C4A47] list-disc pl-9 space-y-0.5">
              {result.targetWeekStarts.map((t) => (
                <li key={t}>{weekLabel(t)}</li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </form>
  );
};