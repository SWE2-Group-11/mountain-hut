import { useState } from 'react';
import { apiClient, ApiError } from '../../../api/client';
import type { Reservation } from '../../reservation/types/reservation.types';

// "cancelled": the booking is gone because of this request. "gone": it was already gone (e.g. cancelled in another tab)
export type CancelOutcome = 'cancelled' | 'gone';

// DELETE /reservations/:id: the hiker cancels one of their bookings (allowed at any time)
export function useCancelBooking(booking: Reservation, onDone: (outcome: CancelOutcome) => void) {
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (cancelling) return;
    setCancelling(true);
    setError(null);
    try {
      await apiClient.delete(`/reservations/${booking.id}`);
      onDone('cancelled');
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        onDone('gone');
      } else if (err instanceof ApiError && err.status === 401) {
        setError('Your session has expired. Please sign in again.');
      } else if (err instanceof ApiError && err.status === 403) {
        setError('This booking cannot be cancelled with this account.');
      } else {
        setError('The booking could not be cancelled. Please try again.');
      }
    } finally {
      setCancelling(false);
    }
  };

  return { cancelling, error, confirm };
}