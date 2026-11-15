import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../../../api/client';
import type { Reservation } from '../../reservation/types/reservation.types';

const byDateAndTime = (a: Reservation, b: Reservation) =>
  `${a.date} ${a.slot}`.localeCompare(`${b.date} ${b.slot}`);

// GET /reservations: the active bookings of the logged-in hiker
export function useMyBookings() {
  const [bookings, setBookings] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data: Reservation[] = await apiClient.get('/reservations');
        if (!cancelled) setBookings(data);
      } catch {
        if (!cancelled) setError('Could not load your bookings. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  // After a change, the booking may have moved to another day or time
  const replaceBooking = useCallback((updated: Reservation) => {
    setBookings((prev) => prev.map((b) => (b.id === updated.id ? updated : b)).sort(byDateAndTime));
  }, []);

  return { bookings, loading, error, reload, replaceBooking };
}