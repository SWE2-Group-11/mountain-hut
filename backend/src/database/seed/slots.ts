import Database from "better-sqlite3";
import { DateTime } from "luxon";
import { pickOne, randomInt, type Random } from "./random";

/*
 * Random demo slots and tables, seeded in SEED_MODE=random.
 * Slots of the same day never overlap (the app rejects overlapping slots) and
 * end by 23:59 (CHECK in init.sql).
 */

const DAYS = 3;                          // slots from tomorrow for this many days
const MAX_SLOTS_PER_DAY = 3;
const DURATIONS = [45, 60, 90, 120] as const;
const FIRST_START = { min: 7 * 60, max: 12 * 60 };   // first slot of the day, minutes from midnight
const MAX_GAP = 3 * 60;                  // between the end of a slot and the start of the next
const STEP = 15;                         // start times on the quarter hour
const MINUTES_PER_DAY = 24 * 60;
const MAX_TABLES = 6;
const TABLE_SIZES = [2, 4, 6, 8] as const;

/** Minutes from midnight as HH:MM. */
const toTime = (minutes: number): string =>
    `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** Random multiple of STEP in [min, max]. */
const randomStep = (random: Random, min: number, max: number): number =>
    randomInt(random, Math.ceil(min / STEP), Math.floor(max / STEP)) * STEP;

/**
 * Inserts random slots for the next DAYS days: 1..MAX_SLOTS_PER_DAY per day,
 * each with 1..MAX_TABLES tables of random size.
 * @param db The database being seeded, inside the reset transaction.
 * @param random Source of randomness in [0, 1), injectable for testing.
 * @param today The day the slots are relative to (injectable for testing).
 */
export const insertRandomSlots = (
    db: Database.Database,
    random: Random = Math.random,
    today: DateTime = DateTime.now()
): void => {
    const insertSlot = db.prepare<[string, string, number]>(
        "INSERT INTO slot (date, start_time, duration) VALUES (?, ?, ?)");
    const insertTable = db.prepare<[string, string, number, number]>(
        "INSERT INTO slot_table (slot_date, slot_start_time, table_number, seats) VALUES (?, ?, ?, ?)");

    for (let days = 1; days <= DAYS; days++) {
        // Server local date, like date('now', 'localtime') and dayFromToday in the tests
        const date = today.plus({ days }).toISODate()!;
        const count = randomInt(random, 1, MAX_SLOTS_PER_DAY);
        let start = randomStep(random, FIRST_START.min, FIRST_START.max);

        for (let i = 0; i < count; i++) {
            const duration = pickOne(random, DURATIONS);
            if (start + duration >= MINUTES_PER_DAY) break;   // would end after 23:59

            const start_time = toTime(start);
            insertSlot.run(date, start_time, duration);
            const tables = randomInt(random, 1, MAX_TABLES);
            for (let n = 1; n <= tables; n++) {
                insertTable.run(date, start_time, n, pickOne(random, TABLE_SIZES));
            }
            start += duration + randomStep(random, 0, MAX_GAP);
        }
    }
};