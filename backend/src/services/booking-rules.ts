// services/booking-rules.ts
import { DateTime } from "luxon";
import { Slot } from "../models/entities/slot";
import { BOOKING_CUTOFF_HOURS, HUT_TIMEZONE } from "../config/config";

/**
 * Checks whether a slot can still be booked: reservations are allowed
 * up to BOOKING_CUTOFF_HOURS hours before the slot starts.
 * Slot date and time are interpreted in HUT_TIMEZONE, regardless of the server timezone.
 * @param slot The slot to check.
 * @param now The current instant (injectable for testing).
 * @returns true if the booking window is still open, false otherwise.
 */
export const isBookingOpen = (slot: Slot, now: Date = new Date()): boolean => {
    const slot_start = DateTime.fromISO(`${slot.date}T${slot.start_time}`, { zone: HUT_TIMEZONE });
    const deadline = slot_start.minus({ hours: BOOKING_CUTOFF_HOURS });
    return now.getTime() <= deadline.toMillis();
};