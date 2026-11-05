import { db } from "../database/database";
import { Booking } from "../models/entities/booking";
import { replaceRequirements, type RequirementInput } from "./dietary-requirement-dao";
import { SeatedAt } from "../models/entities/seated_at";
import { DietaryRequirement } from "../models/entities/dietary_requirement";
import { getDietaryRequirementsByBooking } from "./dietary-requirement-dao";

export type TableAvailability = {
    table_number: number;
    seats: number;
    free_seats: number;
};

export type Assignment = {
    table_number: number;
    assigned_seats: number
};

export type Reservation = {
    booking: Booking;
    date: string;        // YYYY-MM-DD
    start_time: string;  // HH:MM
    party_size: number;
    seatings: SeatedAt[];
    dietary_requirements: DietaryRequirement[];
};

/**
 * Retrieves every table of a slot with the number of seats still free.
 * @param date The day of the slot (YYYY-MM-DD).
 * @param start_time The start time of the slot (HH:MM).
 * @returns The tables of the slot ordered by table number.
 */
export const getTablesAvailability = (date: string, start_time: string): TableAvailability[] => {
    const sql = `
        SELECT st.table_number, st.seats,
               st.seats - COALESCE((
                   SELECT SUM(sa.assigned_seats)
                   FROM seated_at sa
                   WHERE sa.slot_date = st.slot_date
                     AND sa.slot_start_time = st.slot_start_time
                     AND sa.table_number = st.table_number
               ), 0) AS free_seats
        FROM slot_table st
        WHERE st.slot_date = ? AND st.slot_start_time = ?
        ORDER BY st.table_number`;
    return db.prepare<[string, string], TableAvailability>(sql).all(date, start_time);
};

/**
 * Decides how to seat a party: it stays on one table if possible (the smallest
 * one that fits), otherwise it is spread over the fewest tables possible.
 * @param tables The tables of the slot with their free seats.
 * @param party_size The number of people to seat.
 * @returns The seats to assign per table, or null if the capacity is not enough
 * or the party_size is not an integer or is <= 0.
 */
const assignSeats = (tables: TableAvailability[], party_size: number): Assignment[] | null => {
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

/**
 * Persists a new booking with the seats assigned to it and its dietary requirements, atomically.
 * @param hiker_id The account of the hiker making the reservation.
 * @param date The day of the slot (YYYY-MM-DD).
 * @param start_time The start time of the slot (HH:MM).
 * @param party_size The number of people to seat.
 * @param requirements The dietary requirements of the party, validated by the caller (none if omitted).
 * @returns The new booking with its seatings and dietary requirements,
 * or null if the capacity is no longer available.
 */
export const saveBooking = (
    hiker_id: number,
    date: string,
    start_time: string,
    party_size: number,
    requirements: RequirementInput[] = []
): { booking: Booking; seatings: SeatedAt[]; dietary_requirements: DietaryRequirement[] } | null =>
    db.transaction(() => {
        const assignment = getBookingAvailability(date, start_time, party_size);
        if (!assignment || (Array.isArray(assignment) && assignment.length === 0)) return null;

        const result = db.prepare("INSERT INTO booking (hiker_id) VALUES (?)").run(hiker_id);
        const booking = new Booking(Number(result.lastInsertRowid), hiker_id);

        const sql = `INSERT INTO seated_at
                     (booking_id, slot_date, slot_start_time, table_number, assigned_seats)
                     VALUES (?, ?, ?, ?, ?)`;
        const insert = db.prepare(sql);
        const seatings: SeatedAt[] = [];
        for (const a of assignment) {
            insert.run(booking.id, date, start_time, a.table_number, a.assigned_seats);
            seatings.push(new SeatedAt(booking.id, date, start_time, a.table_number, a.assigned_seats));
        }

        const dietary_requirements = requirements.length > 0
            ? replaceRequirements(booking.id, requirements)
            : [];
        return { booking, seatings, dietary_requirements };
    })();

/** 
 * Checks whether a party can be accommodated in the selected slot.
 * Returns a possible table arrangement without reserving any seats.
 * @param date The slot date (YYYY-MM-DD).
 * @param start_time The slot start time (HH:mm).
 * @param party_size A positive integer, validated by the caller.
 * @returns The proposed assignments, or null if the slot does not exist, has no tables,
 * has not enough free seats, or the party size is not a positive integer.
 * Callers must check that the slot exists (getSlot) to answer 404.
 */
export const getBookingAvailability = (
    date: string,
    start_time: string,
    party_size: number
): Assignment[] | null => {
    const tables = getTablesAvailability(date, start_time);
    return assignSeats(tables, party_size);
}

/**
 * Removes all the seats assigned to a booking, releasing them for other reservations.
 * @param booking_id The id of the booking whose seats are released.
 */
export const deleteSeatings = (booking_id: number): void => {
    db.prepare("DELETE FROM seated_at WHERE booking_id = ?").run(booking_id);
};

/**
 * Persists the given seat assignment for a booking.
 * @param booking_id The id of the booking the seats are assigned to.
 * @param date The day of the slot (YYYY-MM-DD).
 * @param start_time The start time of the slot (HH:MM).
 * @param assignment The seats to assign per table.
 * @returns The created seatings, in the same order as the assignment.
 */
export const insertSeatings = (
    booking_id: number,
    date: string,
    start_time: string,
    assignment: Assignment[]
): SeatedAt[] => {
    const sql = `INSERT INTO seated_at
                 (booking_id, slot_date, slot_start_time, table_number, assigned_seats)
                 VALUES (?, ?, ?, ?, ?)`;
    const insert = db.prepare(sql);

    return assignment.map((a) => {
        insert.run(booking_id, date, start_time, a.table_number, a.assigned_seats);
        return new SeatedAt(booking_id, date, start_time, a.table_number, a.assigned_seats);
    });
};

/**
 * Retrieves the seats assigned to a booking.
 * All the seatings of a booking belong to the same slot.
 * @param booking_id The id of the booking.
 * @returns The seatings ordered by table number (empty if none).
 */
export const getSeatingsByBooking = (booking_id: number): SeatedAt[] => {
    const sql = `SELECT booking_id, slot_date, slot_start_time, table_number, assigned_seats
                 FROM seated_at
                 WHERE booking_id = ?
                 ORDER BY table_number`;
    return db.prepare<[number], SeatedAt>(sql).all(booking_id);
};

/**
 * Retrieves a booking with its slot, party size, seatings and dietary requirements.
 * @param booking_id The id of the booking.
 * @returns The reservation, or null if it does not exist or has no seatings.
 */
export const getBooking = (booking_id: number): Reservation | null => {
    const sql = `SELECT id, hiker_id
                 FROM booking
                 WHERE id = ?`;
    const row = db.prepare<[number], { id: number; hiker_id: number }>(sql).get(booking_id);
    if (!row) return null;

    const seatings = getSeatingsByBooking(booking_id);
    if (seatings.length === 0) return null;

    return {
        booking: new Booking(row.id, row.hiker_id),
        date: seatings[0].slot_date,
        start_time: seatings[0].slot_start_time,
        party_size: seatings.reduce((sum, s) => sum + s.assigned_seats, 0),
        seatings: seatings,
        dietary_requirements: getDietaryRequirementsByBooking(booking_id),
    };
};

/**
 * Retrieves the bookings of a hiker whose slot has not started yet.
 * @param hiker_id The id of the hiker.
 * @param now The current local date-time in the hut timezone (YYYY-MM-DD HH:MM).
 * @returns The active reservations ordered by slot date and time (empty if none).
 */
export const getActiveBookingsByHiker = (hiker_id: number, now: string): Reservation[] => {
    const sql = `SELECT b.id
                 FROM booking b
                 JOIN seated_at sa ON sa.booking_id = b.id
                 WHERE b.hiker_id = ?
                   AND sa.slot_date || ' ' || sa.slot_start_time > ?
                 GROUP BY b.id
                 ORDER BY MIN(sa.slot_date || ' ' || sa.slot_start_time)`;
    const rows = db.prepare<[number, string], { id: number }>(sql).all(hiker_id, now);
    const reservations: Reservation[] = [];
    for (const row of rows) {
        const reservation = getBooking(row.id);
        if (reservation !== null) {
            reservations.push(reservation);
        }
    }
    return reservations;
};