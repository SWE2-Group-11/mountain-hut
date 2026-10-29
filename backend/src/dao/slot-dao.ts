import { db } from "../database/database";
import { Slot } from "../models/entities/slot";

export type SlotAvailability = {
    slot: Slot;
    total_seats: number;
    available_seats: number;
};

/**
 * Retrieves a slot given its primary key.
 * @param date The day of the slot (YYYY-MM-DD).
 * @param start_time The start time of the slot (HH:MM).
 * @returns The slot, or null if it does not exist.
 */
export const getSlot = (date: string, start_time: string): Slot | null => {
    const sql = "SELECT date, start_time, duration FROM slot WHERE date = ? AND start_time = ?";
    const row = db
        .prepare<[string, string], { date: string; start_time: string; duration: number }>(sql)
        .get(date, start_time);
    return row ? new Slot(row.date, row.start_time, row.duration) : null;
};

/**
 * Retrieves the slots of a day that still have at least one free seat,
 * together with their booking availability.
 * @param date The day to look up (YYYY-MM-DD).
 * @returns The available slots ordered by start time, or [] if none is available.
 */
export const getAvailableSlotsByDate = (date: string): SlotAvailability[] => {
    const sql = `
        SELECT s.date, s.start_time, s.duration,
               COALESCE(SUM(st.seats), 0) AS total_seats,
               COALESCE(SUM(st.seats), 0) - COALESCE((
                   SELECT SUM(sa.assigned_seats)
                   FROM seated_at sa
                   WHERE sa.slot_date = s.date AND sa.slot_start_time = s.start_time
               ), 0) AS available_seats
        FROM slot s
        LEFT JOIN slot_table st ON st.slot_date = s.date AND st.slot_start_time = s.start_time
        WHERE s.date = ?
        GROUP BY s.date, s.start_time
        HAVING available_seats > 0
        ORDER BY s.start_time`;
    const rows = db
        .prepare<[string], {
            date: string; start_time: string; duration: number;
            total_seats: number; available_seats: number;
        }>(sql)
        .all(date);
    return rows.map((r) => ({
        slot: new Slot(r.date, r.start_time, r.duration),
        total_seats: r.total_seats,
        available_seats: r.available_seats,
    }));
};