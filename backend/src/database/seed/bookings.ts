import Database from "better-sqlite3";
import { assignSeats, type TableAvailability } from "../../domain/booking-rules";
import { pickSome, pickDistinct, randomInt, type Random } from "./random";

/*
 * Random demo bookings, seeded in SEED_MODE=random after the accounts and the slots.
 * Guests are some of the hikers with an account and some of the temporary hikers below (at least one of each), in random order.
 * Each guest books a random set of slots; in each, a party of 1..capacity/2 people seated
 * with assignSeats, skipped if the slot has not enough free seats.
 */

/** Dietary requirements the bookings pick from. */
const DEMO_REQUIREMENTS = [
    { allergy_flag: 1, description: "1 peanut allergy" },
    { allergy_flag: 1, description: "1 shellfish allergy" },
    { allergy_flag: 1, description: "1 egg allergy" },
    { allergy_flag: 0, description: "1 vegan" },
    { allergy_flag: 0, description: "1 vegetarian" },
    { allergy_flag: 0, description: "1 lactose-free" },
] as const;

/** People without an account, booked by the staff on their behalf. */
const DEMO_TEMPORARY_HIKERS = [
    { full_name: "Paolo Verdi", mobile_number: "+39 300 000 0101" },
    { full_name: "Giulia Neri", mobile_number: "+39 300 000 0102" },
    { full_name: "Marco Gialli", mobile_number: null },
    { full_name: "Sara Bruno", mobile_number: "+39 300 000 0104" },
] as const;

type SlotRow = { date: string; start_time: string; menu: string | null };
type Guest =
    | { kind: "hiker"; account_id: number; full_name: string }
    | { kind: "temporary"; full_name: string; mobile_number: string | null };

/**
 * Inserts random bookings for every guest.
 * @param db The database being seeded, inside the reset transaction.
 * @param random Source of randomness in [0, 1), injectable for testing.
 */
export const insertRandomBookings = (db: Database.Database, random: Random = Math.random): void => {
    const slots = db.prepare<[], SlotRow>(
        "SELECT date, start_time, menu FROM slot ORDER BY date, start_time").all();
    const hikers = db.prepare<[], { account_id: number; full_name: string }>(
        "SELECT account_id, full_name FROM hiker ORDER BY account_id").all();

    // Same query as getTablesAvailability in booking-dao, on the db being seeded
    const tablesOf = db.prepare<[string, string], TableAvailability>(`
        SELECT st.table_number, st.seats,
               st.seats - COALESCE((
                   SELECT SUM(sa.assigned_seats) FROM seated_at sa
                   WHERE sa.slot_date = st.slot_date
                     AND sa.slot_start_time = st.slot_start_time
                     AND sa.table_number = st.table_number
               ), 0) AS free_seats
        FROM slot_table st
        WHERE st.slot_date = ? AND st.slot_start_time = ?
        ORDER BY st.table_number`);
    const insertBooking = db.prepare<[number | null]>("INSERT INTO booking (hiker_id) VALUES (?)");
    const insertTemporary = db.prepare<[number | bigint, string, string | null]>(
        "INSERT INTO temporary_hiker (booking_id, full_name, mobile_number) VALUES (?, ?, ?)");
    const insertSeats = db.prepare<[number | bigint, string, string, number, number]>(
        `INSERT INTO seated_at (booking_id, slot_date, slot_start_time, table_number, assigned_seats)
         VALUES (?, ?, ?, ?, ?)`);
    const insertRequirement = db.prepare<[number | bigint, number, string]>(
        "INSERT INTO dietary_requirement (booking_id, allergy_flag, description) VALUES (?, ?, ?)");

    const capacityOf = (tables: TableAvailability[]) => tables.reduce((sum, t) => sum + t.seats, 0);

    // Some hikers with an account and some temporary hikers, at least one of each
    const guests: Guest[] = [
        ...pickSome(random, hikers).map((h) => ({ kind: "hiker" as const, ...h })),
        ...pickSome(random, DEMO_TEMPORARY_HIKERS).map((t) => ({ kind: "temporary" as const, ...t })),
    ];

    // Random order, so the first guests do not always fill the slots
    for (const guest of pickDistinct(random, guests, guests.length)) {
        const chosen = pickDistinct(random, slots, randomInt(random, 0, slots.length));

        for (const slot of chosen) {
            const tables = tablesOf.all(slot.date, slot.start_time);
            const capacity = capacityOf(tables);
            if (capacity === 0) {
                continue;
            }
            const party_size = randomInt(random, 1, Math.max(1, Math.floor(capacity / 2)));
            const assignment = assignSeats(tables, party_size);
            if (!assignment) {
                continue;
            }

            const booking_id = insertBooking.run(guest.kind === "hiker" ? guest.account_id : null).lastInsertRowid;
            if (guest.kind === "temporary") {
                insertTemporary.run(booking_id, guest.full_name, guest.mobile_number);
            }
            for (const a of assignment) {
                insertSeats.run(booking_id, slot.date, slot.start_time, a.table_number, a.assigned_seats);
            }
            const requirements = pickDistinct(random, DEMO_REQUIREMENTS, 
                randomInt(random, 0, Math.min(DEMO_REQUIREMENTS.length, party_size)));
            for (const r of requirements) {
                insertRequirement.run(booking_id, r.allergy_flag, r.description);
            }
        }
    }
};