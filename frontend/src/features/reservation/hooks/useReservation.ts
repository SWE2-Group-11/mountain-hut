import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiClient, ApiError } from '../../../api/client';
import type { ReservationState, Slot, Reservation, RequirementRow } from '../types/reservation.types';
import { rowError, toRequirements, peopleMentioned } from '../utils/requirements';
import { parseBookingPrefill } from '../utils/bookingPrefill';

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

  // Coming from "check availability": the day, time and party size are already chosen.
  // Read once when the page opens; the first slot load checks them against the server.
  const [searchParams] = useSearchParams();
  const [prefill] = useState(() => parseBookingPrefill(searchParams, new Date()));
  const pendingPrefill = useRef(prefill);
  const [prefillNotice, setPrefillNotice] = useState<string | null>(null);

  const [state, setState] = useState<ReservationState>({
    selectedDate: prefill?.date ?? defaultTomorrow,
    selectedTime: prefill?.slot ?? null,
    partySize: prefill?.partySize ?? 2,
  });

  // Dietary requirements: a list, each row for a subset of the party (optional)
  const keyCounter = useRef(0);
  const [requirementRows, setRequirementRows] = useState<RequirementRow[]>([]);

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

        // The slot may have filled up since the check: say so instead of silently changing the form
        const pending = pendingPrefill.current;
        if (pending && pending.slot && pending.dateKey === date) {
          pendingPrefill.current = null;
          const checked = data.find((s) => s.start_time === pending.slot);
          if (!checked) {
            setPrefillNotice(`The ${pending.slot} table is no longer available on this day. Please choose another time.`);
          } else if (pending.partySize !== null && pending.partySize > checked.available_seats) {
            setPrefillNotice(
              `Only ${checked.available_seats} ${checked.available_seats === 1 ? 'seat is' : 'seats are'} left at ${pending.slot}, so the party size was lowered.`
            );
          }
        }

        // Drop the selected time if the slot is gone or full, and never keep more people than seats left
        setState((prev) => {
          if (!prev.selectedTime) return prev;
          const slot = data.find((s) => s.start_time === prev.selectedTime);
          if (!slot) return { ...prev, selectedTime: null };
          if (prev.partySize > slot.available_seats) {
            return { ...prev, partySize: Math.max(1, slot.available_seats) };
          }
          return prev;
        });
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

  // Any choice made by the person ends the hand-over from the availability page
  const settlePrefill = useCallback(() => {
    pendingPrefill.current = null;
    setPrefillNotice(null);
  }, []);

  const setSelectedDate = useCallback(
    (date: Date) => {
      settlePrefill();
      setState((prev) => ({ ...prev, selectedDate: date, selectedTime: null }));
      setBookingError(null);
    },
    [settlePrefill]
  );

  const setSelectedTime = useCallback(
    (time: string) => {
      settlePrefill();
      const slot = slots.find((s) => s.start_time === time);
      const available = slot?.available_seats ?? 0;
      setState((prev) => ({
        ...prev,
        selectedTime: time,
        partySize: available > 0 ? Math.min(prev.partySize, available) : 1,
      }));
      setBookingError(null);
    },
    [slots, settlePrefill]
  );

  const setPartySize = useCallback(
    (size: number) => {
      settlePrefill();
      setState((prev) => ({
        ...prev,
        partySize: Math.max(1, Math.min(size, maxAvailableSeats || 1)),
      }));
      setBookingError(null);
    },
    [maxAvailableSeats, settlePrefill]
  );

  const addRequirement = useCallback(() => {
    const key = ++keyCounter.current;
    setRequirementRows((prev) => [...prev, { key, count: 1, tags: [], extra: '', hasAllergies: false }]);
    setBookingError(null);
  }, []);

  const removeRequirement = useCallback((key: number) => {
    setRequirementRows((prev) => prev.filter((row) => row.key !== key));
  }, []);

  const updateRequirement = useCallback(
    (key: number, changes: Partial<Omit<RequirementRow, 'key'>>) => {
      setRequirementRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...changes } : row)));
      setBookingError(null);
    },
    []
  );

  // Every allergy is described, and the notes do not talk about more people than the party has
  const requirementsValid =
    requirementRows.every((row) => rowError(row) === null) &&
    peopleMentioned(requirementRows) <= state.partySize;

  const isFormValid = Boolean(
    requirementsValid &&
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
    if (!requirementsValid) {
      setBookingError('Please check the food needs: describe every allergy and do not list more people than your party.');
      return false;
    }

    setIsSubmitting(true);
    setBookingError(null);
    try {
      const requirements = toRequirements(requirementRows);
      const created: Reservation = await apiClient.post('/reservations', {
        date: formatLocalDate(state.selectedDate),
        slot: state.selectedTime,
        partySize: state.partySize,
        ...(requirements.length > 0 ? { requirements } : {}),
      });
      setReservation(created);
      return true;
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setBookingError('Please log in to book a table.');
        } else if (err.status === 403) {
          setBookingError('Only hiker accounts can book a table.');
        } else if (err.status === 409 || err.status === 400) {
          // The server says why: already booked this slot, seats gone, 2-hour rule...
          setBookingError(err.message);
          setRefreshKey((k) => k + 1); // reload the slots
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
    prefillNotice,
    setSelectedDate,
    setSelectedTime,
    setPartySize,
    requirementRows,
    addRequirement,
    removeRequirement,
    updateRequirement,
    confirmReservation,
    clearError,
  };
}