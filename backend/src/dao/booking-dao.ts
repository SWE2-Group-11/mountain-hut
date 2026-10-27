import { db } from "../database/database";
import { Booking } from "../models/entities/booking";
import { SeatedAt } from "../models/entities/seated_at";

export type TableAvailability = {
    table_number: number;
    seats: number;
    free_seats: number;
};

type Assignment = { table_number: number; assigned_seats: number };

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
 * @returns The seats to assign per table, or null if the capacity is not enough.
 */
const assignSeats = (tables: TableAvailability[], party_size: number): Assignment[] | null => {
    const free = tables.filter((t) => t.free_seats > 0).map((t) => ({ ...t }));
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
 * Persists a new booking and the seats assigned to it, atomically.
 * @param hiker_id The account of the hiker making the reservation.
 * @param date The day of the slot (YYYY-MM-DD).
 * @param start_time The start time of the slot (HH:MM).
 * @param party_size The number of people to seat.
 * @returns The new booking with its seatings, or null if the capacity is no longer available.
 */
export const saveBooking = (
    hiker_id: number,
    date: string,
    start_time: string,
    party_size: number
): { booking: Booking; seatings: SeatedAt[] } | null =>
    db.transaction(() => {
        const assignment = assignSeats(getTablesAvailability(date, start_time), party_size);
        if (!assignment) return null;

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
        return { booking, seatings };
    })();