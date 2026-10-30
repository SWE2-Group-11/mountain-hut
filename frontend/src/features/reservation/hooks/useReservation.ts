import { useState, useCallback, useMemo } from 'react';
import type { ReservationState } from '../types/reservation.types';
import { allocateTables } from '../utils/tableAllocator';
import type { Table } from '../utils/tableAllocator';

export const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Default fallback tables totaling 14 free seats to match the UI
const DEFAULT_SLOT_TABLES: Table[] = [
  { id: 'Table 1', capacity: 8, currentOccupancy: 2 }, // 6 free
  { id: 'Table 2', capacity: 8, currentOccupancy: 0 }, // 8 free (Total: 14)
];

// Mock tables per time slot (synced so standard slots have 14 free seats)
const INITIAL_SLOT_TABLES: Record<string, Table[]> = {
  '12:00': [
    { id: 'Table 1', capacity: 6, currentOccupancy: 2 }, // 4 free
    { id: 'Table 2', capacity: 6, currentOccupancy: 0 }, // 6 free
    { id: 'Table 3', capacity: 4, currentOccupancy: 0 }, // 4 free (Total: 14)
  ],
  '12:30': [
    { id: 'Table 1', capacity: 6, currentOccupancy: 0 }, // 6 free
    { id: 'Table 2', capacity: 8, currentOccupancy: 0 }, // 8 free (Total: 14)
  ],
  '13:00': [
    { id: 'Table 1', capacity: 8, currentOccupancy: 0 }, // 8 free
    { id: 'Table 2', capacity: 6, currentOccupancy: 0 }, // 6 free (Total: 14)
  ],
  '19:00': [
    { id: 'Table 1', capacity: 8, currentOccupancy: 0 }, // 8 free
    { id: 'Table 2', capacity: 6, currentOccupancy: 0 }, // 6 free (Total: 14)
  ],
  '19:30': [
    { id: 'Table 1', capacity: 8, currentOccupancy: 0 }, // 8 free
    { id: 'Table 2', capacity: 6, currentOccupancy: 0 }, // 6 free (Total: 14)
  ],
};

// Helper to normalize time strings (e.g. "12:00 PM" -> "12:00")
const normalizeTime = (time: string): string => {
  return time.replace(/\s*(AM|PM)/i, '').trim();
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

  const [existingBookings, setExistingBookings] = useState<Array<{ date: string; time: string }>>([]);
  const [slotTables, setSlotTables] = useState<Record<string, Table[]>>(INITIAL_SLOT_TABLES);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [allocationResult, setAllocationResult] = useState<{
    allocation: Array<{ tableId: string; seatsAssigned: number }>;
    isSplit: boolean;
  } | null>(null);

  // Helper: check if a (date, time) is at least 2 hours in the future
  const isSlotAtLeastTwoHoursAway = useCallback((date: Date | null, time: string): boolean => {
    if (!date) return false;
    const now = new Date();
    const cleanTime = normalizeTime(time);
    const [hours, minutes] = cleanTime.split(':').map(Number);
    const targetDateTime = new Date(date);
    targetDateTime.setHours(hours, minutes || 0, 0, 0);

    const twoHoursBefore = new Date(targetDateTime.getTime() - 2 * 60 * 60 * 1000);
    return now <= twoHoursBefore;
  }, []);

  // Helper: get remaining seats for a time slot
 const getAvailableSeatsForSlot = useCallback(
  (time: string | null): number => {
    if (!time || !state.selectedDate) return 14;

    // 1. Check if the date is in the past (ignoring time component for day comparison)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetDay = new Date(state.selectedDate);
    targetDay.setHours(0, 0, 0, 0);

    if (targetDay < today) {
      return 0; // Past dates have 0 available seats
    }

    // 2. Check the 2-hour cutoff rule for today or any date
    if (!isSlotAtLeastTwoHoursAway(state.selectedDate, time)) {
      return 0; // Slots less than 2 hours away have 0 available seats
    }

    const cleanTime = normalizeTime(time);
    const tables = slotTables[cleanTime] || DEFAULT_SLOT_TABLES;
    return tables.reduce((sum, t) => sum + (t.capacity - t.currentOccupancy), 0);
  },
  [state.selectedDate, slotTables, isSlotAtLeastTwoHoursAway]
);

const maxAvailableSeats = useMemo(
  () => getAvailableSeatsForSlot(state.selectedTime),
  [state.selectedTime, getAvailableSeatsForSlot]
);

  const setSelectedDate = useCallback((date: Date) => {
    setState((prev) => ({ ...prev, selectedDate: date, selectedTime: null }));
    setBookingError(null);
    setAllocationResult(null);
  }, []);

  const setSelectedTime = useCallback(
    (time: string) => {
      const available = getAvailableSeatsForSlot(time);
      setState((prev) => ({
        ...prev,
        selectedTime: time,
        partySize: available > 0 ? Math.min(prev.partySize, available) : 1,
      }));
      setBookingError(null);
      setAllocationResult(null);
    },
    [getAvailableSeatsForSlot]
  );

  const setPartySize = useCallback(
    (size: number) => {
      setState((prev) => {
        const limit = getAvailableSeatsForSlot(prev.selectedTime);
        return {
          ...prev,
          partySize: Math.max(1, Math.min(size, limit)),
        };
      });
      setBookingError(null);
      setAllocationResult(null);
    },
    [getAvailableSeatsForSlot]
  );

  const isFormValid = Boolean(
    state.selectedDate &&
      state.selectedTime &&
      state.partySize > 0 &&
      state.partySize <= maxAvailableSeats
  );

  const confirmReservation = () => {
    if (!state.selectedDate || !state.selectedTime) {
      setBookingError('Please select an available date and time slot.');
      return false;
    }

    if (!isSlotAtLeastTwoHoursAway(state.selectedDate, state.selectedTime)) {
      setBookingError('Reservations must be made at least 2 hours before the selected time.');
      return false;
    }

    const formattedDate = formatLocalDate(state.selectedDate);
    const cleanTime = normalizeTime(state.selectedTime);

    const hasDuplicate = existingBookings.some(
      (b) => b.date === formattedDate && b.time === cleanTime
    );
    if (hasDuplicate) {
      setBookingError(
        'You already have a reservation for this date and time slot. To add more people, please modify your existing reservation.'
      );
      return false;
    }

    const currentTables = slotTables[cleanTime] || DEFAULT_SLOT_TABLES;
    const result = allocateTables(state.partySize, currentTables);

    if (!result.success || !result.allocation) {
      setBookingError(result.error || 'Not enough seats available for this party size.');
      return false;
    }

    setSlotTables((prev) => {
      const updated = (prev[cleanTime] || currentTables).map((table) => {
        const assigned = result.allocation!.find((a) => a.tableId === table.id);
        return assigned
          ? { ...table, currentOccupancy: table.currentOccupancy + assigned.seatsAssigned }
          : table;
      });
      return { ...prev, [cleanTime]: updated };
    });

    setAllocationResult({
      allocation: result.allocation,
      isSplit: Boolean(result.isSplit),
    });
    setExistingBookings((prev) => [...prev, { date: formattedDate, time: cleanTime }]);
    setBookingError(null);
    return true;
  };

  return {
    ...state,
    maxAvailableSeats,
    isFormValid,
    bookingError,
    allocationResult,
    setSelectedDate,
    setSelectedTime,
    setPartySize,
    isSlotAtLeastTwoHoursAway,
    getAvailableSeatsForSlot,
    confirmReservation,
  };
}