import type { Reservation, Slot } from '../../reservation/types/reservation.types';

// The hut works in its own time zone (backend: HUT_TIMEZONE) and a booking can be
// changed up to 48 hours before its slot starts (backend: CHANGE_BOOKING_CUTOFF_HOURS).
// This is only to tell the hiker in advance: the server makes the final decision.
export const HUT_TIMEZONE = 'Europe/Rome';
export const CHANGE_CUTOFF_HOURS = 48;

const MINUTE = 60_000;

// Minutes from a fixed origin of a wall-clock time, the same way for any time zone
const wallClockMinutes = (date: string, time: string): number => {
  const [year, month, day] = date.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  return Date.UTC(year, month - 1, day, hours, minutes) / MINUTE;
};

// "now" on the wall clock of the hut, whatever the time zone of the visitor's computer
const hutNowMinutes = (now: Date): number => {
  const text = new Intl.DateTimeFormat('sv-SE', {
    timeZone: HUT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now); // "2026-11-12 19:17"
  const [date, time] = text.split(' ');
  return wallClockMinutes(date, time);
};

const deadlineMinutes = (booking: Reservation): number =>
  wallClockMinutes(booking.date, booking.slot) - CHANGE_CUTOFF_HOURS * 60;

export const canChange = (booking: Reservation, now: Date = new Date()): boolean =>
  hutNowMinutes(now) <= deadlineMinutes(booking);

/** The last moment to change the booking, as a readable text in the hut's time ("Wed 11 Nov, 19:30"). */
export const changeDeadlineText = (booking: Reservation): string => {
  const moment = new Date(deadlineMinutes(booking) * MINUTE);
  const date = moment.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
  const time = moment.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
  return `${date}, ${time}`;
};

/**
 * The times offered when changing a booking. The seats of the booking itself are free to be
 * used again, so they are added to its own slot; and that slot is listed even when it is full
 * (the public list hides full slots, but the hiker already has seats in it).
 */
export const slotOptionsFor = (slots: Slot[], booking: Reservation, dateKey: string): Slot[] => {
  if (dateKey !== booking.date) return slots;

  const own = slots.find((slot) => slot.start_time === booking.slot);
  const withOwn: Slot[] = own
    ? slots.map((slot) =>
        slot === own ? { ...slot, available_seats: slot.available_seats + booking.partySize } : slot
      )
    : [
        ...slots,
        {
          date: booking.date,
          start_time: booking.slot,
          duration: 0,
          total_seats: booking.partySize,
          available_seats: booking.partySize,
        },
      ];
  return [...withOwn].sort((a, b) => a.start_time.localeCompare(b.start_time));
};