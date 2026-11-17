import Database from "better-sqlite3";
import { assignSeats, type TableAvailability } from "../../domain/booking-rules";
import { pickDistinct, randomInt, type Random } from "./random";

/*
 * Random demo bookings, seeded in SEED_MODE=random after the accounts and the slots.
 * Guests are the hikers with an account and the temporary hikers below, in random order.
 * Each guest books a random set of slots; in each, a party of 1..capacity/2 people seated
 * with assignSeats, skipped if the slot has not enough free seats.
 */

/** Dietary requirements the bookings pick from. */
const DEMO_REQUIREMENTS = [
    { allergy_flag: 1, description: "1 peanut allergy" },
    { allergy_flag: 1, description: "1 shellfish allergy" },
    { allergy_flag: 1, description: "1 egg allergy" },
    { allergy_flag: 0, description: "1 vegan" },
    { allergy_flag: 0, description: "2 vegetarians" },
    { allergy_flag: 0, description: "1 lactose-free" },
] as const;

/** People without an account, booked by the staff on their behalf. */
const DEMO_TEMPORARY_HIKERS = [
    { full_name: "Paolo Verdi", mobile_number: "+39 300 000 0101" },
    { full_name: "Giulia Neri", mobile_number: "+39 300 000 0102" },
    { full_name: "Marco Gialli", mobile_number: null },
    { full_name: "Sara Bruno", mobile_number: "+39 300 000 0104" },
] as const;

type SlotRow = { date: string; start_time: string };
type Guest =
    | { kind: "hiker"; account_id: number; full_name: string }
    | { kind: "temporary"; full_name: string; mobile_number: string | null };

const guestLabel = (guest: Guest): string =>
    guest.kind === "hiker"
        ? `Hiker ${guest.account_id} (${guest.full_name})`
        : `Temporary hiker ${guest.full_name}`;

/**
 * Inserts random bookings for every guest, logging the slots and what it creates.
 * @param db The database being seeded, inside the reset transaction.
 * @param random Source of randomness in [0, 1), injectable for testing.
 */
export const insertRandomBookings = (db: Database.Database, random: Random = Math.random): void => {
    const slots = db.prepare<[], SlotRow>(
        "SELECT date, start_time FROM slot ORDER BY date, start_time").all();
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

    console.log("Seeding demo bookings. Slots:");
    for (const slot of slots) {
        const tables = tablesOf.all(slot.date, slot.start_time);
        const layout = tables.map((t) => `T${t.table_number}=${t.seats}`).join(", ");
        console.log(`  ${slot.date} ${slot.start_time}: ${capacityOf(tables)} seats (${layout})`);
    }

    const guests: Guest[] = [
        ...hikers.map((h) => ({ kind: "hiker" as const, ...h })),
        ...DEMO_TEMPORARY_HIKERS.map((t) => ({ kind: "temporary" as const, ...t })),
    ];

    for (const guest of pickDistinct(random, guests, guests.length)) {
        const chosen = pickDistinct(random, slots, randomInt(random, 0, slots.length));
        console.log(`${guestLabel(guest)}: ${chosen.length} slot(s)`);

        for (const slot of chosen) {
            const where = `${slot.date} ${slot.start_time}`;
            const tables = tablesOf.all(slot.date, slot.start_time);
            const capacity = capacityOf(tables);
            if (capacity === 0) {
                console.log(`  ${where}: skipped, no tables`);
                continue;
            }
            const party_size = randomInt(random, 1, Math.max(1, Math.floor(capacity / 2)));
            const assignment = assignSeats(tables, party_size);
            if (!assignment) {
                const free = tables.reduce((sum, t) => sum + t.free_seats, 0);
                console.log(`  ${where}: party of ${party_size} skipped, only ${free} free seats`);
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
                randomInt(random, 0, DEMO_REQUIREMENTS.length));
            for (const r of requirements) {
                insertRequirement.run(booking_id, r.allergy_flag, r.description);
            }

            const seating = assignment.map((a) => `T${a.table_number} x${a.assigned_seats}`).join(", ");
            const diet = requirements.map((r) => r.description).join(", ") || "none";
            console.log(`  ${where}: booking ${booking_id}, party of ${party_size} at ${seating}; requirements: ${diet}`);
        }
    }
};