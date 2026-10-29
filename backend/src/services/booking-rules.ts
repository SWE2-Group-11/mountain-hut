import { Slot } from "../models/entities/slot";
import { BOOKING_CUTOFF_HOURS } from "../config/config";

/**
 * Checks whether a slot can still be booked: reservations are allowed
 * up to BOOKING_CUTOFF_HOURS hours before the slot starts.
 * @param slot The slot to check.
 * @param now The current instant (injectable for testing).
 * @returns true if the booking window is still open, false otherwise.
 */
export const isBookingOpen = (slot: Slot, now: Date = new Date()): boolean => {
    const slot_start = new Date(`${slot.date}T${slot.start_time}:00`);
    return slot_start.getTime() - now.getTime() >= BOOKING_CUTOFF_HOURS * 60 * 60 * 1000;
};