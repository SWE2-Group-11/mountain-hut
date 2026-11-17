import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiClient, ApiError } from '../../../api/client';
import { formatLocalDate } from '../../reservation/hooks/useReservation';
import { useFoodNeedRows } from '../../my-bookings/hooks/useFoodNeedRows';
import { parseBookingPrefill } from '../../reservation/utils/bookingPrefill';
import { peopleMentioned, rowError, toRequirements } from '../../reservation/utils/requirements';
import type { RequirementRow, Slot } from '../../reservation/types/reservation.types';
import type {
  AccountFields,
  HikerForm,
  HikerMatch,
  HikerMode,
  QuickGuestFields,
  ReservedFor,
  StaffReservation,
} from '../types/staffReservation.types';
import { describeHiker, emptyAccount, emptyHikerForm, emptyQuickGuest, hikerProblem, toHikerPayload } from '../utils/hikerDetails';

// The page where an employee or the warden enters a reservation for a hiker (story MH-07)
export function useStaffReservation() {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Coming from "Check availability": day, time and party size are already chosen
  const [searchParams] = useSearchParams();
  const [prefill] = useState(() => parseBookingPrefill(searchParams, new Date()));
  const pendingPrefill = useRef(prefill);
  const [prefillNotice, setPrefillNotice] = useState<string | null>(null);

  const [selectedDate, setSelectedDateState] = useState<Date>(prefill?.date ?? today);
  const [selectedTime, setSelectedTimeState] = useState<string | null>(prefill?.slot ?? null);
  const [chosenPartySize, setChosenPartySize] = useState(prefill?.partySize ?? 2);

  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const requirementRows = useFoodNeedRows();
  const [hiker, setHiker] = useState<HikerForm>(emptyHikerForm);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reservation, setReservation] = useState<StaffReservation | null>(null);
  const [reservedFor, setReservedFor] = useState<ReservedFor | null>(null);

  const dateKey = formatLocalDate(selectedDate);

  // Load the slots of the chosen day
  useEffect(() => {
    let cancelled = false;
    async function loadSlots() {
      setSlotsLoading(true);
      setSlotsError(null);
      try {
        const data: Slot[] = await apiClient.get(`/slots?date=${dateKey}`);
        if (cancelled) return;
        setSlots(data);

        // The slot may have filled up since the check: say so instead of silently changing the form
        const pending = pendingPrefill.current;
        if (pending && pending.slot && pending.dateKey === dateKey) {
          pendingPrefill.current = null;
          const checked = data.find((s) => s.start_time === pending.slot);
          if (!checked) {
            setPrefillNotice(`The ${pending.slot} table is not available on this day any more. Please choose another time.`);
          } else if (pending.partySize !== null && pending.partySize > checked.available_seats) {
            setPrefillNotice(
              `Only ${checked.available_seats} ${checked.available_seats === 1 ? 'seat is' : 'seats are'} left at ${pending.slot}, so the party size was lowered.`
            );
          }
        }

        // Drop the chosen time if the slot is gone or full
        setSelectedTimeState((prev) => (prev && data.some((s) => s.start_time === prev) ? prev : null));
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
  }, [dateKey, refreshKey]);

  const selectedSlot = slots.find((s) => s.start_time === selectedTime) ?? null;
  const maxAvailableSeats = selectedSlot?.available_seats ?? 0;
  // Never more people than the seats left, even when they shrink after a reload
  const partySize = selectedSlot ? Math.max(1, Math.min(chosenPartySize, maxAvailableSeats)) : chosenPartySize;

  // Any choice made by the employee ends the hand-over from the availability page
  const settlePrefill = useCallback(() => {
    pendingPrefill.current = null;
    setPrefillNotice(null);
  }, []);

  const setSelectedDate = useCallback(
    (date: Date) => {
      settlePrefill();
      setSelectedDateState(date);
      setSelectedTimeState(null);
      setError(null);
    },
    [settlePrefill]
  );

  const setSelectedTime = useCallback(
    (time: string) => {
      settlePrefill();
      const available = slots.find((s) => s.start_time === time)?.available_seats ?? 0;
      setSelectedTimeState(time);
      setChosenPartySize((prev) => (available > 0 ? Math.min(prev, available) : 1));
      setError(null);
    },
    [slots, settlePrefill]
  );

  const setPartySize = useCallback(
    (size: number) => {
      settlePrefill();
      setChosenPartySize(Math.max(1, Math.min(size, maxAvailableSeats || 1)));
      setError(null);
    },
    [maxAvailableSeats, settlePrefill]
  );

  // Who the reservation is for
  const setHikerMode = useCallback((mode: HikerMode) => {
    setHiker((prev) => ({ ...prev, mode }));
    setError(null);
  }, []);
  const selectHiker = useCallback((selected: HikerMatch | null) => {
    setHiker((prev) => ({ ...prev, selected }));
  }, []);
  const updateQuick = useCallback((changes: Partial<QuickGuestFields>) => {
    setHiker((prev) => ({ ...prev, quick: { ...prev.quick, ...changes } }));
  }, []);
  const updateAccount = useCallback((changes: Partial<AccountFields>) => {
    setHiker((prev) => ({ ...prev, account: { ...prev.account, ...changes } }));
  }, []);
  // From the search ("nobody found"): carry the name to the form of a new hiker
  const startNewHiker = useCallback((mode: 'temporary' | 'registered', fullname: string, mobile = '') => {
    setHiker((prev) =>
      mode === 'temporary'
        ? { ...prev, mode, quick: { fullname: fullname || prev.quick.fullname, mobile: mobile || prev.quick.mobile } }
        : { ...prev, mode, account: { ...prev.account, fullname: fullname || prev.account.fullname, mobile: mobile || prev.account.mobile } }
    );
  }, []);

  // Food needs: every allergy is described, and the notes do not cover more people than the party
  const requirementsValid =
    requirementRows.rows.every((row: RequirementRow) => rowError(row) === null) &&
    peopleMentioned(requirementRows.rows) <= partySize;

  const hikerIssue = hikerProblem(hiker);

  // Why the button is not ready yet (shown under it), or null when everything is in place
  const missing: string | null = !selectedTime
    ? 'Choose a time.'
    : partySize < 1 || partySize > maxAvailableSeats
      ? 'Choose the number of people.'
      : !requirementsValid
        ? 'Check the food needs: describe every allergy and do not list more people than the party.'
        : hikerIssue;

  const canSubmit = missing === null && !isSubmitting;

  const submit = async (): Promise<boolean> => {
    if (!canSubmit || !selectedTime) return false;
    setIsSubmitting(true);
    setError(null);
    try {
      const requirements = toRequirements(requirementRows.rows);
      const created: StaffReservation = await apiClient.post('/reservations', {
        date: dateKey,
        slot: selectedTime,
        partySize,
        ...(requirements.length > 0 ? { requirements } : {}),
        hiker: toHikerPayload(hiker),
      });
      setReservedFor(describeHiker(hiker));
      setReservation(created);
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('Please log in again to make a reservation.');
      } else if (err instanceof ApiError && err.status === 403) {
        setError('Only the staff can reserve a table for a hiker.');
      } else if (err instanceof ApiError && (err.status === 400 || err.status === 404 || err.status === 409)) {
        // The server says why: slot already started, hiker already booked, seats gone, email already used...
        setError(err.message);
        setRefreshKey((k) => k + 1); // the free seats may have changed
      } else {
        setError('Something went wrong. The reservation was not made. Please try again.');
      }
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  // Ready for the next reservation: empty form, same day
  const startAnother = useCallback(() => {
    setReservation(null);
    setReservedFor(null);
    setSelectedTimeState(null);
    setChosenPartySize(2);
    requirementRows.reset();
    setHiker({ ...emptyHikerForm, quick: emptyQuickGuest, account: emptyAccount });
    setError(null);
    setRefreshKey((k) => k + 1);
  }, [requirementRows]);

  const clearError = useCallback(() => setError(null), []);

  return {
    selectedDate,
    selectedTime,
    partySize,
    slots,
    slotsLoading,
    slotsError,
    maxAvailableSeats,
    prefillNotice,
    requirementRows,
    hiker,
    missing,
    canSubmit,
    isSubmitting,
    error,
    reservation,
    reservedFor,
    setSelectedDate,
    setSelectedTime,
    setPartySize,
    setHikerMode,
    selectHiker,
    updateQuick,
    updateAccount,
    startNewHiker,
    submit,
    startAnother,
    clearError,
  };
}