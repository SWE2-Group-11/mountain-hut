import Database from "better-sqlite3";
import { SEED_MODE, SEED_RANDOM_SEED } from "../../config/config";
import { insertSeedAccounts } from "./accounts";
import { insertRandomSlots } from "./slots";
import { insertRandomBookings } from "./bookings";
import { insertRandomHikes } from "./hikes";
import { readSql } from "../sql-files";
import seedrandom from "seedrandom";

/**
 * Fills freshly created tables: accounts from the seed accounts file, then slots, tables and bookings,
 * random (SEED_MODE=random) or the fixed test data (SEED_MODE=fixed).
 * @param db The database being seeded, inside the reset transaction.
 */
export const seedDatabase = (db: Database.Database): void => {
    insertSeedAccounts(db);
    db.exec(readSql("schema", "seed.sql"));
    if (SEED_MODE === "fixed") {
        db.exec(readSql("fixtures", "seed.sql"));
    } else {
        const random = seedrandom(SEED_RANDOM_SEED);
        console.log(`Random seed: ${SEED_RANDOM_SEED}`);
        insertRandomSlots(db, random);
        insertRandomBookings(db, random);
        insertRandomHikes(db, random);
    }
    printSeedSummary(db);
};

/** Prints a summary of the seeded data: slots with tables, bookings with seats, hikers with hikes. */
const printSeedSummary = (db: Database.Database): void => {
    const all = <T>(sql: string) => db.prepare(sql).all() as T[];

    console.log("Slots:");
    for (const s of all<{ date: string; start_time: string; tables: string | null }>(`
        SELECT s.date, s.start_time, group_concat('table ' || st.table_number || ' (' || st.seats || ' seats)', ', ') AS tables
        FROM slot s LEFT JOIN slot_table st ON st.slot_date = s.date AND st.slot_start_time = s.start_time
        GROUP BY s.date, s.start_time ORDER BY s.date, s.start_time`))
        console.log(`  ${s.date} ${s.start_time}: ${s.tables ?? "no tables"}`);

    console.log("Bookings:");
    for (const b of all<{ id: number; guest: string; slot: string; seats: string }>(`
        SELECT b.id, COALESCE(h.full_name, t.full_name || ' (temporary hiker)') AS guest,
               sa.slot_date || ' ' || sa.slot_start_time AS slot,
               group_concat('table ' || sa.table_number || ': ' || sa.assigned_seats || ' seats', ', ') AS seats
        FROM booking b
        LEFT JOIN hiker h ON h.account_id = b.hiker_id
        LEFT JOIN temporary_hiker t ON t.booking_id = b.id
        JOIN seated_at sa ON sa.booking_id = b.id
        GROUP BY b.id, h.full_name, t.full_name, sa.slot_date, sa.slot_start_time ORDER BY b.id`))
        console.log(`  #${b.id} ${b.guest}, ${b.slot}: ${b.seats}`);

    console.log("Hikers:");
    for (const h of all<{ full_name: string; hikes: string | null }>(`
        SELECT h.full_name, group_concat(k.destination || ' (' || CASE
                   WHEN k.completed_at < k.planned_departure_at THEN 'cancelled'
                   WHEN k.completed_at IS NOT NULL THEN 'completed'
                   WHEN strftime('%Y-%m-%dT%H:%M:%SZ', 'now') < k.planned_departure_at THEN 'registered'
                   WHEN strftime('%Y-%m-%dT%H:%M:%SZ', 'now') > k.expected_return_at THEN 'overdue'
                   ELSE 'active' END || ')', ', ') AS hikes
        FROM hiker h LEFT JOIN hike k ON k.hiker_id = h.account_id
        GROUP BY h.account_id, h.full_name ORDER BY h.account_id`))
        console.log(`  ${h.full_name}: ${h.hikes ?? "no hikes"}`);
};