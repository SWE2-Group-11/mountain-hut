import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient, ApiError } from '../../../api/client';
import { formatLocalDate } from '../../reservation/hooks/useReservation';
import { peopleMentioned, rowError, toRequirements } from '../../reservation/utils/requirements';
import type { Reservation, Requirement, Slot } from '../../reservation/types/reservation.types';
import { slotOptionsFor } from '../utils/changeWindow';
import { rowsFromRequirements } from '../utils/foodNeeds';
import { useFoodNeedRows } from './useFoodNeedRows';

// What PATCH /reservations/:id accepts: only what the hiker changed is sent
interface ChangeBody {
  date?: string;
  slot?: string;
  partySize?: number;
  requirements?: Requirement[];
}

export function useChangeBooking(booking: Reservation, onSaved: (updated: Reservation) => void) {
  const [selectedDate, setSelectedDateState] = useState<Date>(() => new Date(`${booking.date}T00:00:00`));
  const [selectedTime, setSelectedTime] = useState<string | null>(booking.slot);
  const [chosenPartySize, setPartySizeState] = useState(booking.partySize);

  // Food needs: left as they are, or being edited (the form starts with the current ones; empty = remove all)
  const [editingRequirements, setEditingRequirements] = useState(false);
  const requirementRows = useFoodNeedRows();

  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dateKey = formatLocalDate(selectedDate);
  const slotOptions = useMemo(() => slotOptionsFor(slots, booking, dateKey), [slots, booking, dateKey]);
  const selectedSlot = slotOptions.find((slot) => slot.start_time === selectedTime) ?? null;
  const maxSeats = selectedSlot?.available_seats ?? 0;
  // Never more people than the seats of the chosen time, even when the free seats shrink after a reload
  const partySize = selectedSlot ? Math.max(1, Math.min(chosenPartySize, maxSeats)) : chosenPartySize;

  // Load the slots of the chosen day
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setSlotsLoading(true);
      setSlotsError(null);
      try {
        const data: Slot[] = await apiClient.get(`/slots?date=${dateKey}`);
        if (cancelled) return;
        setSlots(data);
        // Keep the choice only while it is still possible
        const options = slotOptionsFor(data, booking, dateKey);
        setSelectedTime((prev) => (prev && options.some((s) => s.start_time === prev) ? prev : null));
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
    load();
    return () => {
      cancelled = true;
    };
  }, [dateKey, refreshKey, booking]);

  const setSelectedDate = useCallback((date: Date) => {
    setSelectedDateState(date);
    setSelectedTime(null);
    setError(null);
  }, []);

  const chooseTime = useCallback(
    (time: string) => {
      const option = slotOptions.find((slot) => slot.start_time === time);
      setSelectedTime(time);
      setPartySizeState((prev) => Math.max(1, Math.min(prev, option?.available_seats ?? 1)));
      setError(null);
    },
    [slotOptions]
  );

  const setPartySize = useCallback(
    (size: number) => {
      setPartySizeState(Math.max(1, Math.min(size, maxSeats || 1)));
      setError(null);
    },
    [maxSeats]
  );

  const editRequirements = useCallback(() => {
    requirementRows.load(rowsFromRequirements(booking.requirements ?? []));
    setEditingRequirements(true);
    setError(null);
  }, [requirementRows, booking.requirements]);

  // Back to the food needs of the booking, forgetting what was edited
  const cancelRequirementsEdit = useCallback(() => {
    requirementRows.reset();
    setEditingRequirements(false);
    setError(null);
  }, [requirementRows]);

  // Edited food needs: every allergy is described, and the notes do not cover more people than the party
  const requirementsValid =
    !editingRequirements ||
    (requirementRows.rows.every((row) => rowError(row) === null) &&
      peopleMentioned(requirementRows.rows) <= partySize);

  // Only what is different from the booking is sent
  const body: ChangeBody = {};
  if (dateKey !== booking.date) body.date = dateKey;
  if (selectedTime && selectedTime !== booking.slot) body.slot = selectedTime;
  if (partySize !== booking.partySize) body.partySize = partySize;
  if (editingRequirements) {
    const requirements = toRequirements(requirementRows.rows);
    const current = (booking.requirements ?? []).map(({ hasAllergies, details }) => ({ hasAllergies, details }));
    // Opening the editor and changing nothing is not a change
    if (JSON.stringify(requirements) !== JSON.stringify(current)) body.requirements = requirements;
  }
  const hasChanges = Object.keys(body).length > 0;

  const canSave = Boolean(
    hasChanges && selectedTime && partySize >= 1 && partySize <= maxSeats && requirementsValid && !saving
  );

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const updated: Reservation = await apiClient.patch(`/reservations/${booking.id}`, body);
      onSaved(updated);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('Please log in again to change your booking.');
      } else if (err instanceof ApiError && (err.status === 400 || err.status === 404 || err.status === 409)) {
        // The server says why: too late to change, no room, already booked in that slot...
        setError(err.message);
        setRefreshKey((k) => k + 1); // the free seats may have changed
      } else {
        setError('Something went wrong. Your booking was not changed. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  return {
    selectedDate,
    selectedTime,
    partySize,
    slotOptions,
    slotsLoading,
    slotsError,
    maxSeats,
    editingRequirements,
    requirementRows,
    requirementsValid,
    hasChanges,
    canSave,
    saving,
    error,
    setSelectedDate,
    chooseTime,
    setPartySize,
    editRequirements,
    cancelRequirementsEdit,
    save,
  };
}