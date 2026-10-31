import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiClient, ApiError } from '../../../api/client';
import type { ReservationState, Slot, Reservation } from '../types/reservation.types';

export const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export function useReservation() {
  const defaultTomorrow = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [state, setState] = useState<ReservationState>({
    selectedDate: defaultTomorrow,
    selectedTime: null,
    partySize: 2,
  });

  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [reservation, setReservation] = useState<Reservation | null>(null);

  // Load the bookable slots whenever the date changes (or a refresh is requested)
  useEffect(() => {
    if (!state.selectedDate) return;
    let cancelled = false;
    const date = formatLocalDate(state.selectedDate);

    async function loadSlots() {
      setSlotsLoading(true);
      setSlotsError(null);
      try {
        const data: Slot[] = await apiClient.get(`/slots?date=${date}`);
        if (cancelled) return;
        setSlots(data);
        // Drop the selected time if the slot is gone or full
        setState((prev) =>
          prev.selectedTime && !data.some((s) => s.start_time === prev.selectedTime)
            ? { ...prev, selectedTime: null }
            : prev
        );
      } catch (err) {
        if (cancelled) return;
        setSlots([]);
        setSlotsError(
          err instanceof ApiError && err.status === 400
            ? 'Please choose a valid date.'
            : 'Could not load the available times. Please try again.'
        );
      } finally {
        if (!cancelled) setSlotsLoading(false);
      }
    }

    loadSlots();
    return () => {
      cancelled = true;
    };
  }, [state.selectedDate, refreshKey]);

  const selectedSlot = useMemo(
    () => slots.find((s) => s.start_time === state.selectedTime) ?? null,
    [slots, state.selectedTime]
  );
  const maxAvailableSeats = selectedSlot?.available_seats ?? 0;

  const setSelectedDate = useCallback((date: Date) => {
    setState((prev) => ({ ...prev, selectedDate: date, selectedTime: null }));
    setBookingError(null);
  }, []);

  const setSelectedTime = useCallback(
    (time: string) => {
      const slot = slots.find((s) => s.start_time === time);
      const available = slot?.available_seats ?? 0;
      setState((prev) => ({
        ...prev,
        selectedTime: time,
        partySize: available > 0 ? Math.min(prev.partySize, available) : 1,
      }));
      setBookingError(null);
    },
    [slots]
  );

  const setPartySize = useCallback(
    (size: number) => {
      setState((prev) => ({
        ...prev,
        partySize: Math.max(1, Math.min(size, maxAvailableSeats || 1)),
      }));
      setBookingError(null);
    },
    [maxAvailableSeats]
  );

  const isFormValid = Boolean(
    state.selectedDate &&
      state.selectedTime &&
      state.partySize > 0 &&
      state.partySize <= maxAvailableSeats &&
      !isSubmitting
  );

  const confirmReservation = async (): Promise<boolean> => {
    if (!state.selectedDate || !state.selectedTime) {
      setBookingError('Please select an available date and time slot.');
      return false;
    }
    if (isSubmitting) return false;

    setIsSubmitting(true);
    setBookingError(null);
    try {
      const created: Reservation = await apiClient.post('/reservations', {
        date: formatLocalDate(state.selectedDate),
        slot: state.selectedTime,
        partySize: state.partySize,
      });
      setReservation(created);
      return true;
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setBookingError('Please log in to book a table.');
        } else if (err.status === 409) {
          setBookingError('Those seats were just taken. The available times have been refreshed.');
          setRefreshKey((k) => k + 1); // reload the slots
        } else if (err.status === 400) {
          setBookingError(err.message); // e.g. the 2-hour rule, or slot not available
          setRefreshKey((k) => k + 1);
        } else {
          setBookingError('Something went wrong. Please try again.');
        }
      } else {
        setBookingError('Something went wrong. Please try again.');
      }
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const clearError = useCallback(() => setBookingError(null), []);

  return {
    ...state,
    slots,
    slotsLoading,
    slotsError,
    maxAvailableSeats,
    isFormValid,
    isSubmitting,
    bookingError,
    reservation,
    setSelectedDate,
    setSelectedTime,
    setPartySize,
    confirmReservation,
    clearError,
  };
}