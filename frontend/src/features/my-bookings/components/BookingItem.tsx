import React, { useEffect, useRef } from 'react';
import { CalendarDays, Clock, Pencil, Users, UtensilsCrossed } from 'lucide-react';
import type { Reservation } from '../../reservation/types/reservation.types';
import { canChange, changeDeadlineText, CHANGE_CUTOFF_HOURS } from '../utils/changeWindow';
import { bookingReference } from '../utils/bookingReference';
import { ChangeBookingPanel } from './ChangeBookingPanel';

interface BookingItemProps {
  booking: Reservation;
  editing: boolean;
  highlighted?: boolean;
  onEdit: () => void;
  onClose: () => void;
  onSaved: (updated: Reservation) => void;
}

const formatLongDate = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

export const BookingItem: React.FC<BookingItemProps> = ({ booking, editing, highlighted = false, onEdit, onClose, onSaved }) => {
  const itemRef = useRef<HTMLLIElement>(null);
  const changeable = canChange(booking);
  const requirements = booking.requirements ?? [];

  // After a change, bring the booking into view: with several bookings it can be far down the page
  useEffect(() => {
    if (highlighted) itemRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlighted]);

  return (
    <li
      ref={itemRef}
      className={`bg-white rounded-3xl border shadow-sm p-6 space-y-4 transition-shadow ${
        highlighted ? 'border-[#234E39] ring-2 ring-[#234E39]/40' : 'border-[#EFEADF]'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-serif font-bold text-[#1C2826] flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-[#234E39]" />
            {formatLongDate(booking.date)}
          </h2>
          <p className="text-xs text-[#7C8885] mt-1">Booking {bookingReference(booking.id)}</p>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={onEdit}
            disabled={!changeable}
            className="flex items-center gap-2 px-4 py-2 bg-[#234E39] text-white rounded-xl text-sm font-medium hover:bg-[#1C3E2E] transition-colors disabled:opacity-40 disabled:hover:bg-[#234E39] cursor-pointer disabled:cursor-not-allowed"
          >
            <Pencil className="w-4 h-4" />
            Change booking
          </button>
        )}
      </div>

      <dl className="grid sm:grid-cols-3 gap-3 text-sm">
        <div className="bg-[#FAF6EE] rounded-2xl px-4 py-3">
          <dt className="text-xs uppercase tracking-wider text-[#7C8885] flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> Time
          </dt>
          <dd className="font-semibold text-[#1C2826] mt-0.5">{booking.slot}</dd>
        </div>
        <div className="bg-[#FAF6EE] rounded-2xl px-4 py-3">
          <dt className="text-xs uppercase tracking-wider text-[#7C8885] flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> Party
          </dt>
          <dd className="font-semibold text-[#1C2826] mt-0.5">
            {booking.partySize} {booking.partySize === 1 ? 'person' : 'people'}
          </dd>
        </div>
        <div className="bg-[#FAF6EE] rounded-2xl px-4 py-3">
          <dt className="text-xs uppercase tracking-wider text-[#7C8885]">Seats</dt>
          <dd className="font-semibold text-[#1C2826] mt-0.5">
            {booking.seatings
              .map((s) => `Table ${s.table_number}: ${s.assigned_seats}`)
              .join(' · ')}
          </dd>
        </div>
      </dl>

      {/* While changing the booking, the panel below shows the food needs (and lets you edit them) */}
      {requirements.length > 0 && !editing && (
        <div>
          <span className="text-xs uppercase tracking-wider text-[#7C8885] flex items-center gap-1.5 mb-2">
            <UtensilsCrossed className="w-3.5 h-3.5" /> Food needs
          </span>
          <ul className="space-y-1.5 text-sm">
            {requirements.map((requirement, index) => (
              <li
                key={index}
                className={`px-3 py-1.5 rounded-xl ${
                  requirement.hasAllergies ? 'bg-[#FDECEC] text-[#B00020] font-semibold' : 'bg-[#FAF6EE] text-[#1C2826]'
                }`}
              >
                {requirement.hasAllergies && 'Allergy: '}
                {requirement.details}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!editing && (
        <p className="text-xs text-[#5A6865]">
          {changeable
            ? `You can change this booking until ${changeDeadlineText(booking)}.`
            : `This booking can no longer be changed: changes close ${CHANGE_CUTOFF_HOURS} hours before it starts.`}
        </p>
      )}

      {editing && <ChangeBookingPanel booking={booking} onSaved={onSaved} onClose={onClose} />}
    </li>
  );
};