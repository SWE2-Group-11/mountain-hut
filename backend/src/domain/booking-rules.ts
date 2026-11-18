import { DateTime } from "luxon";
import { Slot } from "../models/entities/slot";
import { BOOKING_CUTOFF_HOURS, CHANGE_BOOKING_CUTOFF_HOURS, HUT_TIMEZONE } from "../config/config";

export type TableAvailability = {
    table_number: number;
    seats: number;
    free_seats: number;
};

export type Assignment = {
    table_number: number;
    assigned_seats: number
};

/**
 * Checks whether a slot can still be booked: reservations are allowed
 * up to BOOKING_CUTOFF_HOURS hours before the slot starts.
 * Slot date and time are interpreted in HUT_TIMEZONE, regardless of the server timezone.
 * @param slot The slot to check.
 * @param now The current instant (injectable for testing).
 * @returns true if the booking window is still open, false otherwise.
 */
export const isBookingOpen = (slot: Slot, now: Date = new Date()): boolean =>
    isBeforeCutoff(slot.date, slot.start_time, BOOKING_CUTOFF_HOURS, now);

/**
 * Checks whether an existing reservation can still be changed: changes are allowed
 * up to CHANGE_BOOKING_CUTOFF_HOURS hours before the reserved slot starts.
 * @param date The day of the reserved slot (YYYY-MM-DD).
 * @param start_time The start time of the reserved slot (HH:MM).
 * @param now The current instant (injectable for testing).
 * @returns true if the change window is still open, false otherwise.
 */
export const isChangeOpen = (date: string, start_time: string, now: Date = new Date()): boolean =>
    isBeforeCutoff(date, start_time, CHANGE_BOOKING_CUTOFF_HOURS, now);

/** true if `now` is at most `hours` hours before the slot start (in HUT_TIMEZONE). */
const isBeforeCutoff = (date: string, start_time: string, hours: number, now: Date): boolean => {
    const slot_start = DateTime.fromISO(`${date}T${start_time}`, { zone: HUT_TIMEZONE });
    return now.getTime() <= slot_start.minus({ hours }).toMillis();
};

/**
 * Decides how to seat a party: it stays on one table if possible (the smallest
 * one that fits), otherwise it is spread over the fewest tables possible.
 * @param tables The tables of the slot with their free seats.
 * @param party_size The number of people to seat.
 * @returns The seats to assign per table, or null if the capacity is not enough
 * or the party_size is not an integer or is <= 0.
 */
export const assignSeats = (tables: TableAvailability[], party_size: number): Assignment[] | null => {
    if (!Number.isInteger(party_size) || party_size <= 0) return null;
    const free = tables.filter((t) => t.free_seats > 0);
    if (free.reduce((sum, t) => sum + t.free_seats, 0) < party_size) return null;

    const assignment: Assignment[] = [];
    let remaining = party_size;
    while (remaining > 0) {
        const fitting = free
            .filter((t) => t.free_seats >= remaining)
            .sort((a, b) => a.free_seats - b.free_seats)[0];
        if (fitting) {
            assignment.push({ table_number: fitting.table_number, assigned_seats: remaining });
            remaining = 0;
        } else {
            free.sort((a, b) => b.free_seats - a.free_seats);
            const largest = free.shift()!;
            assignment.push({ table_number: largest.table_number, assigned_seats: largest.free_seats });
            remaining -= largest.free_seats;
        }
    }
    return assignment;
};

