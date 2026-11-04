import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiClient, ApiError } from '../../../api/client';
import { formatLocalDate } from '../../reservation/hooks/useReservation';
import type { Slot } from '../../reservation/types/reservation.types';
import type { AvailabilityResponse, AvailabilityResult } from '../types/availability.types';

// The check is public: it never needs a login.
export function useAvailability() {
  const defaultTomorrow = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [selectedDate, setSelectedDateState] = useState<Date | null>(defaultTomorrow);
  const [selectedTime, setSelectedTimeState] = useState<string | null>(null);
  const [partySize, setPartySizeState] = useState(2);

  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);

  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [result, setResult] = useState<AvailabilityResult | null>(null);

  // Load the slots of the chosen date
  useEffect(() => {
    if (!selectedDate) return;
    let cancelled = false;
    const date = formatLocalDate(selectedDate);

    async function loadSlots() {
      setSlotsLoading(true);
      setSlotsError(null);
      try {
        const data: Slot[] = await apiClient.get(`/slots?date=${date}`);
        if (cancelled) return;
        setSlots(data);
        setSelectedTimeState((prev) => (prev && data.some((s) => s.start_time === prev) ? prev : null));
      } catch (err) {
        if (cancelled) return;
        setSlots([]);
        setSlotsError(
          err instanceof ApiError && err.status === 400
            ? 'Please choose a valid date.'
            : 'Could not load the times. Please try again.'
        );
      } finally {
        if (!cancelled) setSlotsLoading(false);
      }
    }

    loadSlots();
    return () => {
      cancelled = true;
    };
  }, [selectedDate]);

  // A new choice makes the previous answer outdated
  const forgetResult = () => {
    setResult(null);
    setCheckError(null);
  };

  const setSelectedDate = useCallback((date: Date) => {
    setSelectedDateState(date);
    setSelectedTimeState(null);
    setResult(null);
    setCheckError(null);
  }, []);

  const setSelectedTime = useCallback((time: string) => {
    setSelectedTimeState(time);
    setResult(null);
    setCheckError(null);
  }, []);

  // The party can be bigger than the free seats: the answer will be "not available".
  // The upper limit is the capacity of the slot.
  const selectedSlot = slots.find((s) => s.start_time === selectedTime) ?? null;
  const maxPartySize = selectedSlot?.total_seats ?? 1;

  const setPartySize = useCallback(
    (size: number) => {
      setPartySizeState(Math.max(1, Math.min(size, maxPartySize)));
      forgetResult();
    },
    [maxPartySize]
  );

  const canCheck = Boolean(selectedDate && selectedTime && partySize > 0) && !checking;

  const checkAvailability = async () => {
    if (!selectedDate || !selectedTime || checking) return;
    setChecking(true);
    setCheckError(null);
    setResult(null);
    try {
      const params = new URLSearchParams({
        date: formatLocalDate(selectedDate),
        slot: selectedTime,
        partySize: String(partySize),
      });
      const data: AvailabilityResponse = await apiClient.get(`/slots/availability?${params}`);
      setResult(
        data.available.length > 0
          ? { status: 'available', tables: data.available }
          : { status: 'unavailable' }
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setCheckError('This time is not available any more. Please choose another one.');
      } else if (err instanceof ApiError && err.status === 400) {
        setCheckError('Please check the date, the time and the number of people.');
      } else {
        setCheckError('Could not check the availability. Please try again.');
      }
    } finally {
      setChecking(false);
    }
  };

  return {
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
  };
}