import React from 'react';
import { AlertCircle, CalendarClock, CheckCircle2, History, Table2 } from 'lucide-react';
import { useSlotSetup } from '../hooks/useSlotSetup';
import { TableEditor } from './TableEditor';
import { PreviousSetupPicker } from './PreviousSetupPicker';
import { durationMinutes, formatDuration } from '../utils/slotSetup.utils';

const fieldClass =
  'w-full rounded-xl border border-[#EFEADF] bg-white px-3 py-2.5 text-sm text-[#1C2826] focus:outline-none focus:ring-2 focus:ring-[#234E39]/30';
const labelClass = 'block text-[10px] uppercase font-bold tracking-widest text-[#7C8885] mb-1.5';

export const SlotSetupCard: React.FC = () => {
  const s = useSlotSetup();
  const minutes = s.startTime && s.endTime ? durationMinutes(s.startTime, s.endTime) : 0;

  return (
    <div className="w-full max-w-3xl mx-auto bg-white rounded-[32px] p-8 md:p-10 shadow-xl border border-[#EFEADF] relative -mt-20 space-y-8">
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
              <h3 className="font-serif font-bold text-lg text-[#1C2826]">Slot not created</h3>
              <p className="text-xs text-[#5A6865] leading-relaxed">{s.submitError}</p>
            </div>
            <button
              type="button"
              onClick={s.clearSubmitError}
              className="w-full py-3 bg-[#1C2826] text-white rounded-xl font-medium text-xs hover:bg-black transition-colors cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* 1. WHEN */}
      <section className="space-y-4">
        <h2 className="flex items-center gap-2 font-serif font-bold text-lg text-[#1C2826]">
          <CalendarClock className="w-5 h-5 text-[#234E39]" />
          1. Day and time
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="slot-date" className={labelClass}>Date</label>
            <input
              id="slot-date"
              type="date"
              min={s.today}
              value={s.date}
              onChange={(e) => s.setDate(e.target.value)}
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor="slot-start" className={labelClass}>From</label>
            <input
              id="slot-start"
              type="time"
              value={s.startTime}
              onChange={(e) => s.setStartTime(e.target.value)}
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor="slot-end" className={labelClass}>To</label>
            <input
              id="slot-end"
              type="time"
              value={s.endTime}
              onChange={(e) => s.setEndTime(e.target.value)}
              className={fieldClass}
            />
          </div>
        </div>
        {minutes > 0 && (
          <p className="text-xs text-[#5A6865]">Duration: {formatDuration(minutes)}</p>
        )}
      </section>

      {/* 2. TABLES */}
      <section className="space-y-4">
        <h2 className="flex items-center gap-2 font-serif font-bold text-lg text-[#1C2826]">
          <Table2 className="w-5 h-5 text-[#234E39]" />
          2. Tables and seats
        </h2>

        <div
          role="tablist"
          aria-label="How to set up the tables"
          className="grid grid-cols-2 gap-2 rounded-2xl bg-[#FAF6EE] p-1.5"
        >
          {(
            [
              ['new', 'Define the tables'],
              ['previous', 'Use a previous setup'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={s.mode === value}
              onClick={() => s.changeMode(value)}
              className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold transition-colors cursor-pointer ${
                s.mode === value
                  ? 'bg-white text-[#1C2826] shadow-sm'
                  : 'text-[#7C8885] hover:text-[#1C2826]'
              }`}
            >
              {value === 'previous' && <History className="w-4 h-4" />}
              {label}
            </button>
          ))}
        </div>

        {s.mode === 'new' ? (
          <TableEditor
            rows={s.rows}
            onAdd={s.addRow}
            onRemove={s.removeRow}
            onChange={s.updateRow}
          />
        ) : (
          <PreviousSetupPicker
            configurations={s.configurations}
            loading={s.configsLoading}
            error={s.configsError}
            selectedKey={s.selectedConfigKey}
            onSelect={s.setSelectedConfigKey}
            onEdit={s.editFromConfiguration}
            onRetry={s.reloadConfigurations}
          />
        )}
      </section>

      {/* SUBMIT */}
      <section className="space-y-3">
        {s.formError && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-700"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
            {s.formError}
          </p>
        )}
        <button
          type="button"
          onClick={s.submit}
          disabled={s.isSubmitting}
          className="w-full py-3.5 bg-[#234E39] text-white rounded-xl font-semibold text-sm hover:bg-[#1C3E2E] disabled:opacity-60 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          {s.isSubmitting ? 'Creating slot...' : 'Create slot'}
        </button>
        <p className="text-[11px] text-[#7C8885] text-center">
          A service can have several slots: after creating one, the same day and tables stay
          selected and the next slot starts when the previous ends.
        </p>
      </section>

      {/* CREATED SLOTS */}
      {s.created.length > 0 && (
        <section className="space-y-3 border-t border-[#EFEADF] pt-6" aria-live="polite">
          <h2 className="font-serif font-bold text-lg text-[#1C2826]">Created in this session</h2>
          <ul className="space-y-2">
            {s.created.map((slot, i) => (
              <li
                key={`${slot.date}-${slot.startTime}-${i}`}
                className="flex items-start gap-3 rounded-2xl bg-[#F1F6F2] border border-[#D9E6DC] p-4"
              >
                <CheckCircle2 className="w-5 h-5 text-[#234E39] shrink-0" />
                <div className="text-xs text-[#1C2826]">
                  <p className="font-semibold">
                    {slot.date} · {slot.startTime}-{slot.endTime}
                  </p>
                  <p className="text-[#5A6865]">
                    {slot.tables.length} tables · {slot.totalSeats} seats
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};