import { db } from "../database/database";
import { Slot } from "../models/entities/slot";
import { SlotTable } from "../models/entities/slot_table";

export type SlotAvailability = {
    slot: Slot;
    total_seats: number;
    available_seats: number;
};

export type TableInput = {
    table_number: number;
    seats: number;
};

export type SlotConfiguration = {
    slot: Slot;
    tables: SlotTable[];
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

/**
 * Retrieves the tables defined for a slot.
 * @param date The day of the slot (YYYY-MM-DD).
 * @param start_time The start time of the slot (HH:MM).
 * @returns The tables of the slot ordered by table number, or [] if there are none.
 */
export const getSlotTables = (date: string, start_time: string): SlotTable[] => {
    const sql = `SELECT slot_date, slot_start_time, table_number, seats
                 FROM slot_table
                 WHERE slot_date = ? AND slot_start_time = ?
                 ORDER BY table_number`;
    const rows = db
        .prepare<[string, string], {
            slot_date: string; slot_start_time: string; table_number: number; seats: number;
        }>(sql)
        .all(date, start_time);
    return rows.map((r) => new SlotTable(r.slot_date, r.slot_start_time, r.table_number, r.seats));
};

/**
 * Retrieves the configurations of existing slots that can be reused,
 * most recent dates first and latest start time first within the same date.
 * @param from Optional inclusive start date (YYYY-MM-DD).
 * @param to Optional inclusive end date (YYYY-MM-DD).
 * @param limit The maximum number of configurations to return.
 * @returns The slots with their tables, or [] if none exists.
 */
export const getSavedConfigurations = (
    from: string | null,
    to: string | null,
    limit: number
): SlotConfiguration[] => {
    const sql = `SELECT date, start_time, duration
                 FROM slot
                 WHERE (@from IS NULL OR date >= @from)
                   AND (@to IS NULL OR date <= @to)
                 ORDER BY date DESC, start_time DESC
                 LIMIT @limit`;
    const rows = db
        .prepare<
            { from: string | null; to: string | null; limit: number },
            { date: string; start_time: string; duration: number }
        >(sql)
        .all({ from, to, limit });
    return rows.map((r) => ({
        slot: new Slot(r.date, r.start_time, r.duration),
        tables: getSlotTables(r.date, r.start_time),
    }));
};

/**
 * Persists a new slot together with its tables and seats, atomically.
 * @param date The day of the slot (YYYY-MM-DD).
 * @param start_time The start time of the slot (HH:MM).
 * @param duration The duration of the slot, in minutes.
 * @param tables The tables available in the slot, with their seats.
 * @returns The new slot with its tables, or null if it overlaps an existing slot of the same day.
 */
export const saveSlot = (
    date: string,
    start_time: string,
    duration: number,
    tables: TableInput[]
): { slot: Slot; tables: SlotTable[] } | null =>
    db.transaction(() => {
        const [hours, minutes] = start_time.split(":").map(Number);
        const new_start = hours * 60 + minutes;
        const new_end = new_start + duration;

        const overlapSql = `SELECT 1 AS found FROM slot
                            WHERE date = ?
                              AND (CAST(substr(start_time, 1, 2) AS INTEGER) * 60
                                   + CAST(substr(start_time, 4, 2) AS INTEGER)) < ?
                              AND (CAST(substr(start_time, 1, 2) AS INTEGER) * 60
                                   + CAST(substr(start_time, 4, 2) AS INTEGER)) + duration > ?`;
        const overlapping = db
            .prepare<[string, number, number], { found: number }>(overlapSql)
            .get(date, new_end, new_start);
        if (overlapping) return null;

        db.prepare("INSERT INTO slot (date, start_time, duration) VALUES (?, ?, ?)")
            .run(date, start_time, duration);
        const slot = new Slot(date, start_time, duration);

        const sql = `INSERT INTO slot_table (slot_date, slot_start_time, table_number, seats)
                     VALUES (?, ?, ?, ?)`;
        const insert = db.prepare(sql);
        const slotTables = tables.map((t) => {
            insert.run(date, start_time, t.table_number, t.seats);
            return new SlotTable(date, start_time, t.table_number, t.seats);
        });
        return { slot, tables: slotTables };
    })();