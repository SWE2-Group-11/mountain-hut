import React, { useState } from 'react';
import { CheckCircle2, Calendar, Clock, Users, KeyRound, Copy, Check, User } from 'lucide-react';
import { MODE_LABELS } from '../utils/hikerDetails';
import type { ReservedFor, StaffReservation } from '../types/staffReservation.types';

interface ReservationReceiptProps {
  reservation: StaffReservation;
  reservedFor: ReservedFor;
  onNew: () => void;
}

const formatLongDate = (date: Date) =>
  date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

const Line: React.FC<{ icon: React.ReactNode; label: string; children: React.ReactNode }> = ({ icon, label, children }) => (
  <div className="flex justify-between items-center py-3 border-b border-[#EFEADF] text-sm">
    <span className="text-[#7C8885] flex items-center gap-2">{icon} {label}</span>
    <span className="font-semibold text-right text-[#1C2826]">{children}</span>
  </div>
);

// What the server confirmed, for the employee to read out or write down
export const ReservationReceipt: React.FC<ReservationReceiptProps> = ({ reservation, reservedFor, onNew }) => {
  const [copied, setCopied] = useState(false);

  const copyPassword = async () => {
    if (!reservation.initialPassword) return;
    try {
      await navigator.clipboard.writeText(reservation.initialPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the password stays visible: it can be read out or copied by hand */
    }
  };

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-[#EFEADF] shadow-sm overflow-hidden">
      <div className="bg-[#EAF3EE] px-8 py-6 flex items-center gap-4 border-b border-[#BFD8C9]">
        <CheckCircle2 className="w-9 h-9 text-[#234E39] shrink-0" />
        <div>
          <h2 className="font-serif font-bold text-xl text-[#1C2826]">Reservation made</h2>
          <p className="text-sm text-[#3C4A47]">Booking #{reservation.id} for {reservedFor.name}</p>
        </div>
      </div>

      <div className="px-8 py-4">
        <Line icon={<User className="w-4 h-4 text-[#234E39]" />} label="Guest">
          {reservedFor.name}
          <span className="block font-normal text-xs text-[#7C8885]">
            {MODE_LABELS[reservedFor.mode]}
            {reservedFor.detail ? ` · ${reservedFor.detail}` : ''}
          </span>
        </Line>
        <Line icon={<Calendar className="w-4 h-4 text-[#234E39]" />} label="Date">
          {formatLongDate(new Date(`${reservation.date}T00:00:00`))}
        </Line>
        <Line icon={<Clock className="w-4 h-4 text-[#234E39]" />} label="Time">{reservation.slot}</Line>
        <Line icon={<Users className="w-4 h-4 text-[#234E39]" />} label="Party">
          {reservation.partySize} {reservation.partySize === 1 ? 'person' : 'people'}
        </Line>
      </div>

      <div className="px-8 pb-6 space-y-4 text-sm">
        <div className="rounded-xl border border-[#EFEADF] p-4 space-y-2">
          <span className="font-bold text-[#234E39] block uppercase tracking-wider text-[10px]">Seating</span>
          <ul className="space-y-1 font-medium">
            {reservation.seatings.map((seating) => (
              <li key={seating.table_number} className="flex justify-between bg-[#FAF6EE] px-3 py-1.5 rounded-lg">
                <span>Table {seating.table_number}</span>
                <span className="text-[#234E39] font-bold">{seating.assigned_seats} seats</span>
              </li>
            ))}
          </ul>
        </div>

        {reservation.requirements && reservation.requirements.length > 0 && (
          <div className="rounded-xl border border-[#EFEADF] p-4 space-y-2">
            <span className="font-bold text-[#234E39] block uppercase tracking-wider text-[10px]">Food needs</span>
            <ul className="space-y-1.5">
              {reservation.requirements.map((requirement, index) => (
                <li
                  key={index}
                  className={`px-3 py-1.5 rounded-lg ${requirement.hasAllergies ? 'bg-[#FDECEC] text-[#B00020] font-semibold' : 'bg-[#FAF6EE]'}`}
                >
                  {requirement.hasAllergies && 'Allergy: '}
                  {requirement.details}
                </li>
              ))}
            </ul>
          </div>
        )}

        {reservation.initialPassword && (
          <div role="status" className="bg-[#FDF6E3] border border-[#EBD9A8] rounded-xl p-4 space-y-2 text-[#6B5200]">
            <span className="font-bold uppercase tracking-wider text-[10px] flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5" /> Initial password
            </span>
            <div className="flex items-center justify-between gap-3">
              <code className="text-base font-mono font-bold text-[#1C2826] select-all break-all">{reservation.initialPassword}</code>
              <button
                type="button"
                onClick={copyPassword}
                className="shrink-0 px-3 py-1.5 bg-white border border-[#D4CDBA] rounded-lg text-xs font-medium text-[#1C2826] inline-flex items-center gap-1.5 cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-xs">Tell it to the hiker now, out loud. It is shown only once; they must change it at the first login.</p>
          </div>
        )}
      </div>

      <div className="px-8 py-4 bg-[#FAF6EE] border-t border-[#EFEADF] text-right">
        <button
          type="button"
          onClick={onNew}
          className="px-6 py-2.5 bg-[#234E39] text-white rounded-xl font-medium text-sm hover:bg-[#1C3E2E] transition-colors cursor-pointer"
        >
          New reservation
        </button>
      </div>
    </div>
  );
};