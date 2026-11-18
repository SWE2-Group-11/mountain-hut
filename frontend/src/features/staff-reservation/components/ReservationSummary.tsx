import React from 'react';
import { Check, Circle } from 'lucide-react';
import type { HikerForm } from '../types/staffReservation.types';

interface ReservationSummaryProps {
  selectedDate: Date;
  selectedTime: string | null;
  partySize: number;
  hiker: HikerForm;
  foodNeedCount: number;
  missing: string | null;
  canSubmit: boolean;
  isSubmitting: boolean;
  onSubmit: () => void;
}

const guestName = (hiker: HikerForm): string => {
  if (hiker.mode === 'existing') return hiker.selected?.fullname ?? '';
  if (hiker.mode === 'temporary') return hiker.quick.fullname.trim();
  return hiker.account.fullname.trim();
};

const Row: React.FC<{ label: string; value: string | null; hint?: string }> = ({ label, value, hint }) => (
  <li className="flex items-start gap-3 py-3 border-b border-[#EFEADF] last:border-0">
    {value ? <Check className="w-4 h-4 text-[#234E39] mt-0.5 shrink-0" /> : <Circle className="w-4 h-4 text-[#D4CDBA] mt-0.5 shrink-0" />}
    <div className="min-w-0 text-sm">
      <div className="text-[11px] uppercase tracking-wider text-[#7C8885]">{label}</div>
      <div className={value ? 'font-semibold text-[#1C2826] truncate' : 'text-[#7C8885]'}>{value ?? 'Not chosen yet'}</div>
      {hint && value && <div className="text-xs text-[#7C8885]">{hint}</div>}
    </div>
  </li>
);

// The right-hand column: what will be reserved, and the button
export const ReservationSummary: React.FC<ReservationSummaryProps> = ({
  selectedDate,
  selectedTime,
  partySize,
  hiker,
  foodNeedCount,
  missing,
  canSubmit,
  isSubmitting,
  onSubmit,
}) => {
  const name = guestName(hiker);
  return (
    <aside className="bg-white rounded-2xl border border-[#EFEADF] shadow-sm lg:sticky lg:top-24">
      <header className="px-6 py-4 border-b border-[#EFEADF]">
        <h2 className="font-serif font-bold text-[#1C2826]">Reservation</h2>
      </header>
      <div className="px-6">
        <ul>
          <Row
            label="Service"
            value={selectedTime ? `${selectedDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · ${selectedTime}` : null}
          />
          <Row label="Party" value={selectedTime ? `${partySize} ${partySize === 1 ? 'person' : 'people'}` : null} />
          <Row label="Guest" value={name || null} hint={hiker.mode === 'registered' ? 'A new account will be created' : hiker.mode === 'temporary' ? 'Quick guest, no account' : undefined} />
          <li className="flex items-start gap-3 py-3">
            <Check className="w-4 h-4 text-[#234E39] mt-0.5 shrink-0" />
            <div className="text-sm">
              <div className="text-[11px] uppercase tracking-wider text-[#7C8885]">Food needs</div>
              <div className="font-semibold text-[#1C2826]">{foodNeedCount === 0 ? 'None' : `${foodNeedCount} ${foodNeedCount === 1 ? 'note' : 'notes'}`}</div>
            </div>
          </li>
        </ul>
      </div>
      <div className="p-6 pt-3 space-y-3">
        <button
          type="button"
          disabled={!canSubmit}
          onClick={onSubmit}
          className={`w-full py-3.5 rounded-xl font-medium text-white transition-all shadow-sm ${
            canSubmit ? 'bg-[#234E39] hover:bg-[#1C3E2E] cursor-pointer' : 'bg-[#9FB2A9] cursor-not-allowed'
          }`}
        >
          {isSubmitting ? 'Reserving...' : 'Reserve table'}
        </button>
        <p className="text-center text-xs text-[#7C8885]">{missing ?? 'Everything is in place.'}</p>
      </div>
    </aside>
  );
};