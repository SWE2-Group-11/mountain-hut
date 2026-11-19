import React from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import type { Reservation } from '../../reservation/types/reservation.types';
import { useCancelBooking, type CancelOutcome } from '../hooks/useCancelBooking';

interface CancelBookingPanelProps {
  booking: Reservation;
  onDone: (outcome: CancelOutcome) => void;
  onClose: () => void;
}

// The question the hiker answers before a booking is cancelled: it cannot be undone
export const CancelBookingPanel: React.FC<CancelBookingPanelProps> = ({ booking, onDone, onClose }) => {
  const { cancelling, error, confirm } = useCancelBooking(booking, onDone);
  const people = `${booking.partySize} ${booking.partySize === 1 ? 'person' : 'people'}`;

  return (
    <div role="alertdialog" aria-label="Cancel this booking" className="border border-[#F0C9CE] bg-[#FDF3F4] rounded-2xl p-5 space-y-4">
      <div>
        <h3 className="font-serif font-bold text-lg text-[#1C2826]">Cancel this booking?</h3>
        <p className="text-sm text-[#5A6865] mt-1">
          The table for {people} at {booking.slot} will be given back to the hut, so other guests can book it. This cannot
          be undone.
        </p>
      </div>

      {error && (
        <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-red-700 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          autoFocus
          onClick={onClose}
          disabled={cancelling}
          className="px-4 py-2 bg-white border border-[#D4CDBA] text-[#1C2826] rounded-xl text-sm font-medium hover:bg-[#FAF6EE] disabled:opacity-50 cursor-pointer"
        >
          Keep booking
        </button>
        <button
          type="button"
          onClick={() => void confirm()}
          disabled={cancelling}
          className="flex items-center gap-2 px-4 py-2 bg-[#B00020] text-white rounded-xl text-sm font-medium hover:bg-[#8F001A] transition-colors disabled:opacity-50 cursor-pointer"
        >
          {cancelling ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Cancelling...
            </>
          ) : (
            'Yes, cancel booking'
          )}
        </button>
      </div>
    </div>
  );
};