import React from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, XCircle, Minus, Plus, Search } from 'lucide-react';
import { useAvailability } from '../hooks/useAvailability';
import { formatSeatSplit, formatTimeRange } from '../utils/availability.utils';
import { formatLocalDate } from '../../reservation/hooks/useReservation';
import { buildBookingLink } from '../../reservation/utils/bookingPrefill';
const LABEL = 'block text-xs font-bold uppercase tracking-wider text-[#5A6865] mb-2';
const CONTROL_BUTTON =
  'w-10 h-10 rounded-xl bg-white border border-[#EFEADF] flex items-center justify-center text-[#1C2826] hover:bg-[#EFE4D2] disabled:opacity-40 disabled:hover:bg-white transition-colors';

export const AvailabilityCard: React.FC = () => {
  const {
    selectedDate,
    selectedTime,
    partySize,
    slots,
    slotsLoading,
    slotsError,
    maxPartySize,
    canCheck,
    checking,
    checkError,
    result,
    setSelectedDate,
    setSelectedTime,
    setPartySize,
    checkAvailability,
  } = useAvailability();

  const today = formatLocalDate(new Date());

  return (
    <div className="w-full max-w-5xl mx-auto grid md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-6 items-start">
      {/* The question */}
      <form
        className="bg-white rounded-3xl p-6 border border-[#EFEADF] shadow-sm space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (canCheck) checkAvailability();
        }}
      >
        <div>
          <label htmlFor="availability-date" className={LABEL}>
            Day
          </label>
          <input
            id="availability-date"
            type="date"
            min={today}
            value={selectedDate ? formatLocalDate(selectedDate) : ''}
            onChange={(e) => {
              if (e.target.value) setSelectedDate(new Date(`${e.target.value}T00:00:00`));
            }}
            className="w-full bg-[#FAF6EE] border border-[#EFEADF] rounded-xl px-4 py-3 text-[#1C2826] focus:outline-none focus:border-[#234E39]"
          />
        </div>

        <div>
          <span className={LABEL}>Time</span>
          {slotsLoading ? (
            <p className="text-sm text-[#7C8885]">Loading times...</p>
          ) : slotsError ? (
            <p role="alert" className="text-sm text-red-700">
              {slotsError}
            </p>
          ) : slots.length === 0 ? (
            <p className="text-sm text-[#7C8885]">No meal service on this day. Try another day.</p>
          ) : (
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Time">
              {slots.map((slot) => {
                const selected = selectedTime === slot.start_time;
                return (
                  <button
                    key={slot.start_time}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setSelectedTime(slot.start_time)}
                    className={`px-3 py-2 rounded-full text-sm border transition-colors cursor-pointer ${
                      selected
                        ? 'bg-[#234E39] text-white border-[#234E39]'
                        : 'bg-white text-[#2C3835] border-[#D4CDBA] hover:border-[#234E39]'
                    }`}
                  >
                    {formatTimeRange(slot.start_time, slot.duration)}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <span className={LABEL}>Party size</span>
          <div className="flex items-center justify-between bg-[#FAF6EE] border border-[#EFEADF] rounded-xl px-4 py-2">
            <span className="font-serif font-bold text-[#1C2826]">
              {partySize} {partySize === 1 ? 'person' : 'people'}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={CONTROL_BUTTON}
                onClick={() => setPartySize(partySize - 1)}
                disabled={partySize <= 1}
                aria-label="Decrease party size"
              >
                <Minus className="w-4 h-4" />
              </button>
              <button
                type="button"
                className={CONTROL_BUTTON}
                onClick={() => setPartySize(partySize + 1)}
                disabled={!selectedTime || partySize >= maxPartySize}
                aria-label="Increase party size"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={!canCheck}
          className={`w-full py-3.5 rounded-xl font-medium text-white flex items-center justify-center gap-2 transition-all ${
            canCheck ? 'bg-[#234E39] hover:bg-[#1C3E2E] cursor-pointer' : 'bg-[#9FB2A9] cursor-not-allowed'
          }`}
        >
          <Search className="w-4 h-4" />
          {checking ? 'Checking...' : 'Check availability'}
        </button>
      </form>

      {/* The answer */}
      <div aria-live="polite" className="min-h-[220px]">
        {checkError && (
          <div role="alert" className="bg-red-50 border border-red-200 rounded-3xl p-6 text-red-700 text-sm">
            {checkError}
          </div>
        )}

        {!checkError && !result && (
          <div className="h-full min-h-[220px] rounded-3xl border-2 border-dashed border-[#D4CDBA] p-6 flex items-center justify-center text-center text-sm text-[#7C8885]">
            Choose a day, a time and the size of your party, then press “Check availability”.
          </div>
        )}

        {result?.status === 'available' && (
          <div role="status" className="bg-[#EAF3EE] border border-[#BFD8C9] rounded-3xl p-6 space-y-4 text-[#1C2826]">
            <div className="flex items-center gap-2 font-serif font-bold text-xl text-[#234E39]">
              <CheckCircle2 className="w-6 h-6" />
              Yes, there is room for {partySize} {partySize === 1 ? 'person' : 'people'}
            </div>
            <p className="text-sm text-[#3C4A47]">
              Your party can be seated as <strong>{formatSeatSplit(result.tables)}</strong>.
            </p>
            <ul className="grid sm:grid-cols-2 gap-2">
              {result.tables.map((table) => (
                <li key={table.tableId} className="bg-white rounded-2xl border border-[#EFEADF] px-4 py-3">
                  <div className="text-xs uppercase tracking-wider text-[#7C8885]">Table {table.tableId}</div>
                  <div className="flex gap-1 my-1.5" aria-hidden="true">
                    {Array.from({ length: table.assignedSeats }, (_, i) => (
                      <span key={i} className="w-3 h-3 rounded-full bg-[#234E39]" />
                    ))}
                  </div>
                  <div className="text-sm font-bold text-[#234E39]">
                    {table.assignedSeats} {table.assignedSeats === 1 ? 'seat' : 'seats'}
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-xs text-[#5A6865]">This is only a check: nothing is reserved until you book.</p>
            <Link
                            to={buildBookingLink({ date: formatLocalDate(selectedDate!), slot: selectedTime!, partySize })}
              className="inline-block px-5 py-2.5 bg-[#234E39] text-white rounded-xl font-medium text-sm hover:bg-[#1C3E2E] transition-colors"
            >
              Book a table
            </Link>
          </div>
        )}

        {result?.status === 'unavailable' && (
          <div role="status" className="bg-[#FDECEC] border border-[#F2C4C4] rounded-3xl p-6 space-y-2 text-[#1C2826]">
            <div className="flex items-center gap-2 font-serif font-bold text-xl text-[#B00020]">
              <XCircle className="w-6 h-6" />
              No room for {partySize} {partySize === 1 ? 'person' : 'people'}
            </div>
            <p className="text-sm text-[#3C4A47]">
              There are not enough free seats at this time. Try a different time or day.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};