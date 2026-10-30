import { useState, useCallback } from 'react';
import type { ReservationState } from '../types/reservation.types';
import { allocateTables } from '../utils/tableAllocator';
import type { Table } from '../utils/tableAllocator';

export function useReservation() {
  const [state, setState] = useState<ReservationState>({
    selectedDate: new Date(2026, 9, 28), // Defaulting to Oct 28, 2026 based on mock
    selectedTime: null,
    partySize: 2,
  });

  const [existingBookings, setExistingBookings] = useState<Array<{ date: string; time: string }>>([
    // Mock existing user booking to test the "one booking per slot" rule constraint
    { date: '2026-10-28', time: '12:00' }
  ]);

  const [bookingError, setBookingError] = useState<string | null>(null);
  const [allocationResult, setAllocationResult] = useState<any | null>(null);

  const setSelectedDate = useCallback((date: Date) => {
    setState((prev) => ({ ...prev, selectedDate: date, selectedTime: null }));
    setBookingError(null);
  }, []);

  const setSelectedTime = useCallback((time: string) => {
    setState((prev) => ({ ...prev, selectedTime: time }));
    setBookingError(null);
  }, []);

  const setPartySize = useCallback((size: number) => {
    setState((prev) => ({ ...prev, partySize: Math.max(1, size) }));
    setBookingError(null);
  }, []);

  const isFormValid = Boolean(state.selectedDate && state.selectedTime && state.partySize > 0);

  // Constraint validation and table allocation submit handler
  const confirmReservation = () => {
    if (!state.selectedDate || !state.selectedTime) {
      setBookingError("Please select both a date and a time slot.");
      return false;
    }

    const now = new Date();

    // 1. Constraint: Combine selected date and time string into a target Date object
    const [hours, minutes] = state.selectedTime.split(':').map(Number);
    const targetDateTime = new Date(state.selectedDate);
    targetDateTime.setHours(hours, minutes, 0, 0);

    // 2. Constraint: Hiker can reserve up to 2 hours before the due time
    const twoHoursBefore = new Date(targetDateTime.getTime() - 2 * 60 * 60 * 1000);
    if (now > twoHoursBefore) {
      setBookingError("Bookings must be made at least 2 hours before the time slot.");
      return false;
    }

    // 3. Constraint: Only one booking per time slot on a date
    const formattedDateString = state.selectedDate.toISOString().split('T')[0];
    const duplicate = existingBookings.find(
      (b) => b.date === formattedDateString && b.time === state.selectedTime
    );
    if (duplicate) {
      setBookingError("You already have an active booking for this exact date and time slot.");
      return false;
    }

    // 4. Table Assignment & Sharing Rule Validation
    const mockTableInventory: Table[] = [
      { id: 'Table 1 (Long Bench)', capacity: 6, currentOccupancy: 2 },
      { id: 'Table 2 (Long Bench)', capacity: 6, currentOccupancy: 0 },
      { id: 'Table 3 (Corner Hearth)', capacity: 4, currentOccupancy: 1 },
    ];

    const allocation = allocateTables(state.partySize, mockTableInventory);
    if (!allocation.success) {
      setBookingError(allocation.error || "Not enough seats available.");
      return false;
    }

    // Success: save allocation details and record booking
    setAllocationResult(allocation);
    setExistingBookings((prev) => [...prev, { date: formattedDateString, time: state.selectedTime! }]);
    setBookingError(null);
    return true;
  };

  return {
    ...state,
    setSelectedDate,
    setSelectedTime,
    setPartySize,
    isFormValid,
    bookingError,
    allocationResult,
    confirmReservation,
  };
}