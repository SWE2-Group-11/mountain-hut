import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, X } from 'lucide-react';
import type { Reservation } from '../../reservation/types/reservation.types';
import { useMyBookings } from '../hooks/useMyBookings';
import { BookingItem } from './BookingItem';
import { bookingReference } from '../utils/bookingReference';
import { CHANGE_CUTOFF_HOURS } from '../utils/changeWindow';

export const MyBookings: React.FC = () => {
  const { bookings, loading, error, reload, replaceBooking } = useMyBookings();
  const [editingId, setEditingId] = useState<number | null>(null);
  // The booking that was just changed: confirmed in a pop-up and highlighted in the list for a few seconds
  const [saved, setSaved] = useState<{ id: number; reference: string } | null>(null);

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(null), 6000);
    return () => clearTimeout(timer);
  }, [saved]);

  const handleSaved = (updated: Reservation) => {
    replaceBooking(updated);
    setEditingId(null);
    setSaved({ id: updated.id, reference: bookingReference(updated.id) });
  };

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-4xl font-serif font-bold text-[#1C2826] mb-2">My bookings</h1>
        <p className="text-[#5A6865]">
          Your upcoming tables. You can change a booking up to {CHANGE_CUTOFF_HOURS} hours before it starts.
        </p>
      </div>

      {/* CONFIRMATION: visible without scrolling, closes by itself after a few seconds */}
      {saved && (
        <div
          role="status"
          className="fixed top-24 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-md flex items-center gap-3 rounded-2xl bg-[#234E39] text-white px-5 py-4 shadow-2xl"
        >
          <CheckCircle2 className="w-6 h-6 shrink-0" />
          <div className="text-sm">
            <p className="font-bold">Booking changed</p>
            <p className="text-white/85">Booking {saved.reference} was updated.</p>
          </div>
          <button
            type="button"
            onClick={() => setSaved(null)}
            aria-label="Close confirmation"
            className="ml-auto p-1 rounded-lg hover:bg-white/15 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {loading ? (
        <p role="status" className="text-[#7C8885]">
          Loading your bookings...
        </p>
      ) : error ? (
        <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-2xl text-sm text-red-700 space-y-2">
          <p>{error}</p>
          <button type="button" onClick={reload} className="font-semibold underline cursor-pointer">
            Try again
          </button>
        </div>
      ) : bookings.length === 0 ? (
        <div className="bg-white rounded-3xl border border-[#EFEADF] p-8 text-center space-y-3">
          <p className="text-[#5A6865]">You have no upcoming bookings.</p>
          <Link
            to="/book-table"
            className="inline-block px-5 py-2.5 bg-[#234E39] text-white rounded-xl font-medium text-sm hover:bg-[#1C3E2E] transition-colors"
          >
            Book a table
          </Link>
        </div>
      ) : (
        <ul className="space-y-5">
          {bookings.map((booking) => (
            <BookingItem
              key={booking.id}
              booking={booking}
              editing={editingId === booking.id}
              highlighted={saved?.id === booking.id}
              onEdit={() => {
                setSaved(null);
                setEditingId(booking.id);
              }}
              onClose={() => setEditingId(null)}
              onSaved={handleSaved}
            />
          ))}
        </ul>
      )}
    </div>
  );
};