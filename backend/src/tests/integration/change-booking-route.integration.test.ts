import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import { app } from "../../app";
import { db } from "../../database/database";
import {
    resetTestDatabase, dayFromToday, huTime, loginAs, createHikerWithoutBookings,
    MARIO, LAURA, EMPLOYEE, NEW_HIKER,
} from "../helpers";

/*
 * Change a booking (MH-06): PATCH /api/v1/reservations/:reservationId and GET /api/v1/reservations (route of MH-67).
 * Everything is real: session, route, validation, controller, DAO, SQL, transaction, in-memory database.
 *
 * Seed (reset before every test). Every slot has tables T1 = 4, T2 = 4, T3 = 6, T4 = 2 seats.
 *  - booking 1: Mario, D1 12:00, T4 x 2 (party 2), no requirements
 *  - booking 2: Laura, D1 12:00, T1 x 1 + T3 x 6 (party 7), 2 requirements
 *  - booking 3: Mario, D1 19:30, T1 x 4 (party 4), 1 requirement
 *  - booking 4: temporary hiker (made by staff), D2 12:00, T2 x 3
 * Free seats: D1 12:00 = 7 (T1 3, T2 4) | D1 13:00 = 16 | D1 19:30 = 12 (T2 4, T3 6, T4 2) | D2 12:00 = 13
 *
 * The seed bookings are tomorrow, so with the real clock they are always less than 48 hours away and cannot
 * be changed. Most tests therefore fake the clock to NOW = yesterday 08:00 in the hut's time zone:
 * D1 12:00 is then about 52 hours away and every seed booking can be changed.
 */

const RESERVATIONS_URL = "/api/v1/reservations";
const SLOTS_URL = "/api/v1/slots";
const WARDEN = "warden@mountainhut.test";

// Computed once with the real clock: a faked clock would otherwise shift dayFromToday
const yesterday = dayFromToday(-1);
const D1 = dayFromToday(1);
const D2 = dayFromToday(2);
const D4 = dayFromToday(4);

// "Now" for most tests: every seed booking is more than 48 hours away and every slot more than 2 hours away
const NOW = huTime(yesterday, "08:00");

const HOUR_MS = 60 * 60 * 1000;

type Seat = { date: string; slot: string; table_number: number; assigned_seats: number };
type Requirement = { hasAllergies: boolean; details: string };

/** Logs in, then freezes the clock (logging in first keeps the session login on the real clock). */
const loginAt = async (email: string, at: Date = NOW) => {
    const agent = await loginAs(email);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(at);
    return agent;
};

const seatsOf = (bookingId: number): Seat[] =>
    db.prepare<[number], Seat>(
        `SELECT slot_date AS date, slot_start_time AS slot, table_number, assigned_seats
         FROM seated_at WHERE booking_id = ? ORDER BY table_number`
    ).all(bookingId);

const requirementsOf = (bookingId: number): Requirement[] =>
    db.prepare<[number], { allergy_flag: number; description: string }>(
        "SELECT allergy_flag, description FROM dietary_requirement WHERE booking_id = ? ORDER BY id"
    ).all(bookingId).map((r) => ({ hasAllergies: r.allergy_flag === 1, details: r.description }));

const availableSeats = async (date: string, slot: string): Promise<number | undefined> => {
    const res = await request(app).get(SLOTS_URL).query({ date });
    return res.body.find((s: { start_time: string }) => s.start_time === slot)?.available_seats;
};

/**
 * Adds a slot on D4 at 12:00 (same four tables) and a booking for Mario there (T1 x 2).
 * Used when a test needs a booking far in the future and a slot close to "now".
 * @returns The id of the new booking.
 */
const addFarBooking = (): number => {
    db.prepare("INSERT INTO slot (date, start_time, duration) VALUES (?, '12:00', 60)").run(D4);
    const table = db.prepare(
        "INSERT INTO slot_table (slot_date, slot_start_time, table_number, seats) VALUES (?, '12:00', ?, ?)"
    );
    [[1, 4], [2, 4], [3, 6], [4, 2]].forEach(([number, seats]) => table.run(D4, number, seats));
    const { lastInsertRowid } = db.prepare("INSERT INTO booking (hiker_id) VALUES (3)").run();
    const id = Number(lastInsertRowid);
    db.prepare(
        "INSERT INTO seated_at (booking_id, slot_date, slot_start_time, table_number, assigned_seats) VALUES (?, ?, '12:00', 1, 2)"
    ).run(id, D4);
    return id;
};

const BOOKING_1_SEATS: Seat[] = [{ date: D1, slot: "12:00", table_number: 4, assigned_seats: 2 }];
const BOOKING_2_SEATS: Seat[] = [
    { date: D1, slot: "12:00", table_number: 1, assigned_seats: 1 },
    { date: D1, slot: "12:00", table_number: 3, assigned_seats: 6 },
];
const LAURA_REQUIREMENTS: Requirement[] = [
    { hasAllergies: true, details: "1 vegan, peanut allergy" },
    { hasAllergies: false, details: "2 vegetarians" },
];
const SHELLFISH: Requirement[] = [{ hasAllergies: true, details: "1 shellfish allergy" }];

/** Booking 1 is exactly as in the seed. */
const expectBooking1Unchanged = () => {
    expect(seatsOf(1)).toEqual(BOOKING_1_SEATS);
    expect(requirementsOf(1)).toEqual([]);
};

describe("PATCH /api/v1/reservations/:reservationId", () => {
    beforeEach(() => {
        resetTestDatabase();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe("access control", () => {
        it("answers 401 when nobody is logged in", async () => {
            // Only a logged-in hiker may change a booking.

            const res = await request(app).patch(`${RESERVATIONS_URL}/1`).send({ partySize: 1 });

            expect(res.status).toBe(401);
            expect(res.body).toMatchObject({ code: 401, message: "Not authenticated" });
            expectBooking1Unchanged();
        });

        it.each([
            ["an employee", EMPLOYEE],
            ["the warden", WARDEN],
        ])("answers 403 to %s", async (_label, email) => {
            // Staff accounts cannot use the hiker's "change my booking" endpoint.
            const staff = await loginAt(email);

            const res = await staff.patch(`${RESERVATIONS_URL}/1`).send({ partySize: 1 });

            expect(res.status).toBe(403);
            expect(res.body).toMatchObject({ code: 403, message: "Not allowed for this role" });
            expectBooking1Unchanged();
        });

        it("answers 403 when the booking belongs to another hiker", async () => {
            // Laura must not change Mario's booking. The clock is set so the same request
            // from Mario would be accepted: the only reason for the refusal is the owner.
            const laura = await loginAt(LAURA);

            const res = await laura.patch(`${RESERVATIONS_URL}/1`).send({ partySize: 1 });

            expect(res.status).toBe(403);
            expect(res.body).toMatchObject({ code: 403, message: expect.stringMatching(/another user/) });
            expectBooking1Unchanged();
        });

        it("answers 403 for a booking made by staff for a temporary hiker", async () => {
            // Booking 4 has no hiker account, so no hiker owns it.
            const mario = await loginAt(MARIO);

            const res = await mario.patch(`${RESERVATIONS_URL}/4`).send({ partySize: 1 });

            expect(res.status).toBe(403);
            expect(seatsOf(4)).toEqual([{ date: D2, slot: "12:00", table_number: 2, assigned_seats: 3 }]);
        });

        it("answers 404 for a reservation that does not exist", async () => {
            // An unknown id must be reported as "not found", not as a server error.
            const mario = await loginAt(MARIO);

            const res = await mario.patch(`${RESERVATIONS_URL}/999`).send({ partySize: 1 });

            expect(res.status).toBe(404);
            expect(res.body).toMatchObject({ code: 404, message: "Reservation not found" });
        });
    });

    describe("validation (400)", () => {
        it.each(["abc", "0", "-1", "1.5"])("rejects the reservation id %s", async (id) => {
            // The id in the URL must be a positive whole number; the route checks it before the controller.
            const mario = await loginAt(MARIO);

            const res = await mario.patch(`${RESERVATIONS_URL}/${id}`).send({ partySize: 1 });

            expect(res.status).toBe(400);
            expect(res.body).toMatchObject({ code: 400, message: expect.stringMatching(/^reservationId/) });
            expectBooking1Unchanged();
        });

        it("rejects an empty body", async () => {
            // A change with nothing to change is a client mistake.
            const mario = await loginAt(MARIO);

            const res = await mario.patch(`${RESERVATIONS_URL}/1`).send({});

            expect(res.status).toBe(400);
            expect(res.body).toMatchObject({ code: 400, message: expect.stringMatching(/At least one field/) });
            expectBooking1Unchanged();
        });

        it("rejects a body with only unknown fields", async () => {
            // Unknown fields are dropped by the validation, so this body is empty too.
            const mario = await loginAt(MARIO);

            const res = await mario.patch(`${RESERVATIONS_URL}/1`).send({ foo: 1 });

            expect(res.status).toBe(400);
            expect(res.body.message).toMatch(/At least one field/);
            expectBooking1Unchanged();
        });

        it.each([
            ["a party size of 0", "partySize", { partySize: 0 }],
            ["a negative party size", "partySize", { partySize: -1 }],
            ["a decimal party size", "partySize", { partySize: 1.5 }],
            ["a party size sent as text", "partySize", { partySize: "2" }],
            ["a date that does not exist", "date", { date: "2026-02-30" }],
            ["a date in the wrong format", "date", { date: "tomorrow" }],
            ["a time that does not exist", "slot", { slot: "25:00" }],
            ["a time in the wrong format", "slot", { slot: "12" }],
        ])("rejects %s", async (_label, field, body) => {
            // Each field is checked with the same rules as when booking (MH-01).
            const mario = await loginAt(MARIO);

            const res = await mario.patch(`${RESERVATIONS_URL}/1`).send(body);

            expect(res.status).toBe(400);
            expect(res.body).toMatchObject({ code: 400, message: expect.stringMatching(new RegExp(`^${field}`)) });
            expectBooking1Unchanged();
        });

        it.each([
            ["requirements that are not a list", "1 vegan"],
            ["requirements set to null", null],
            ["a requirement without details", [{ hasAllergies: true }]],
            ["details made only of spaces", [{ hasAllergies: false, details: "   " }]],
            ["an allergy flag sent as text", [{ hasAllergies: "true", details: "1 vegan" }]],
            ["one invalid requirement among valid ones",
                [{ hasAllergies: false, details: "2 vegetarians" }, { hasAllergies: true }]],
        ])("rejects %s", async (_label, requirements) => {
            // Requirements follow the MH-05 rules.
            const mario = await loginAt(MARIO);

            const res = await mario.patch(`${RESERVATIONS_URL}/1`).send({ requirements });

            expect(res.status).toBe(400);
            expect(res.body).toMatchObject({ code: 400, message: expect.stringMatching(/^requirements/) });
            expectBooking1Unchanged();
        });

        it("rejects a malformed JSON body", async () => {
            // Broken JSON must give a clear 400, not a server error.
            const mario = await loginAt(MARIO);

            const res = await mario
                .patch(`${RESERVATIONS_URL}/1`)
                .set("Content-Type", "application/json")
                .send("{ not json");

            expect(res.status).toBe(400);
            expect(res.body).toMatchObject({ code: 400, message: "Malformed JSON body" });
            expectBooking1Unchanged();
        });
    });

    describe("changing only the requirements", () => {
        it("replaces the whole list of requirements", async () => {
            // api.md says a new list replaces the old one. The old "shellfish" entry must disappear.
            const mario = await loginAt(MARIO);
            const requirements = [
                { hasAllergies: true, details: "1 peanut allergy" },
                { hasAllergies: false, details: "2 vegetarians" },
            ];

            const res = await mario.patch(`${RESERVATIONS_URL}/3`).send({ requirements });

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                id: 3,
                date: D1,
                slot: "19:30",
                partySize: 4,
                seatings: [{ table_number: 1, assigned_seats: 4 }],
                requirements,
            });
            expect(requirementsOf(3)).toEqual(requirements);
            expect(seatsOf(3)).toEqual([{ date: D1, slot: "19:30", table_number: 1, assigned_seats: 4 }]);
            expect(requirementsOf(2)).toEqual(LAURA_REQUIREMENTS); // other bookings are not touched
            const list = await mario.get(RESERVATIONS_URL);
            expect(list.body.find((r: { id: number }) => r.id === 3).requirements).toEqual(requirements);
        });

        it("removes every requirement when an empty list is sent", async () => {
            // An empty list is the way to say "no requirements any more".
            const mario = await loginAt(MARIO);

            const res = await mario.patch(`${RESERVATIONS_URL}/3`).send({ requirements: [] });

            expect(res.status).toBe(200);
            expect(res.body.requirements).toEqual([]);
            expect(requirementsOf(3)).toEqual([]);
            const list = await mario.get(RESERVATIONS_URL);
            expect(list.body.find((r: { id: number }) => r.id === 3).requirements).toEqual([]);
        });

        it("keeps the requirements when the field is not sent", async () => {
            // A field that is not sent must stay as it was.
            const mario = await loginAt(MARIO);

            const res = await mario.patch(`${RESERVATIONS_URL}/3`).send({ partySize: 2 });

            expect(res.status).toBe(200);
            expect(res.body.requirements).toEqual(SHELLFISH);
            expect(requirementsOf(3)).toEqual(SHELLFISH);
        });

        it("trims the spaces around the details", async () => {
            // The same cleaning as when booking, so "  1 vegan  " is saved as "1 vegan".
            const mario = await loginAt(MARIO);

            const res = await mario
                .patch(`${RESERVATIONS_URL}/3`)
                .send({ requirements: [{ hasAllergies: false, details: "  1 vegan  " }] });

            expect(res.status).toBe(200);
            expect(res.body.requirements).toEqual([{ hasAllergies: false, details: "1 vegan" }]);
            expect(requirementsOf(3)).toEqual([{ hasAllergies: false, details: "1 vegan" }]);
        });
    });

    describe("changing the party size in the same slot", () => {
        it("frees seats when the party gets smaller", async () => {
            // Fewer people means seats go back to other hikers and the party stays at its table.
            const mario = await loginAt(MARIO);

            const res = await mario.patch(`${RESERVATIONS_URL}/3`).send({ partySize: 2 });

            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({ partySize: 2, seatings: [{ table_number: 1, assigned_seats: 2 }] });
            expect(seatsOf(3)).toEqual([{ date: D1, slot: "19:30", table_number: 1, assigned_seats: 2 }]);
            expect(await availableSeats(D1, "19:30")).toBe(14);
        });

        it("drops a table that becomes empty when the party gets smaller", async () => {
            // Laura's 7 people sit at T1 (1) and T3 (6); going down to 1, the code empties
            // the last table (T3) first, so only T1 is left.
            const laura = await loginAt(LAURA);

            const res = await laura.patch(`${RESERVATIONS_URL}/2`).send({ partySize: 1 });

            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({ partySize: 1, seatings: [{ table_number: 1, assigned_seats: 1 }] });
            expect(seatsOf(2)).toEqual([{ date: D1, slot: "12:00", table_number: 1, assigned_seats: 1 }]);
            expect(requirementsOf(2)).toEqual(LAURA_REQUIREMENTS);
            expect(await availableSeats(D1, "12:00")).toBe(13);
        });

        it("keeps the party at its tables when the extra people fit there", async () => {
            // If the extra people fit at the tables already assigned,
            // the party is not moved. T1 has 3 free seats, so the 2 extra sit there.
            const laura = await loginAt(LAURA);

            const res = await laura.patch(`${RESERVATIONS_URL}/2`).send({ partySize: 9 });

            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({
                partySize: 9,
                seatings: [{ table_number: 1, assigned_seats: 3 }, { table_number: 3, assigned_seats: 6 }],
            });
            expect(seatsOf(2)).toEqual([
                { date: D1, slot: "12:00", table_number: 1, assigned_seats: 3 },
                { date: D1, slot: "12:00", table_number: 3, assigned_seats: 6 },
            ]);
            expect(await availableSeats(D1, "12:00")).toBe(5);
        });

        it("seats the party again when the extra people do not fit at its tables", async () => {
            // Mario's T4 is full, so the party of 4 is seated like a new booking:
            // the smallest single table with 4 free seats is T2.
            const mario = await loginAt(MARIO);

            const res = await mario.patch(`${RESERVATIONS_URL}/1`).send({ partySize: 4 });

            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({ partySize: 4, seatings: [{ table_number: 2, assigned_seats: 4 }] });
            expect(seatsOf(1)).toEqual([{ date: D1, slot: "12:00", table_number: 2, assigned_seats: 4 }]);
            expect(await availableSeats(D1, "12:00")).toBe(5);
        });

        it("seats the whole party again when only some of the extra people fit at its tables", async () => {
            // Laura goes from 7 to 11; T1 has room for only 3 of the 4 extra people, so the
            // whole party is seated again on the fewest tables.
            const laura = await loginAt(LAURA);

            const res = await laura.patch(`${RESERVATIONS_URL}/2`).send({ partySize: 11 });

            expect(res.status).toBe(200);
            expect(res.body.partySize).toBe(11);
            expect(res.body.seatings).toHaveLength(3);
            expect(res.body.seatings).toEqual(expect.arrayContaining([
                { table_number: 3, assigned_seats: 6 },
                { table_number: 1, assigned_seats: 4 },
                { table_number: 2, assigned_seats: 1 },
            ]));
            expect(seatsOf(2).map((s) => [s.table_number, s.assigned_seats])).toEqual([[1, 4], [2, 1], [3, 6]]);
            expect(await availableSeats(D1, "12:00")).toBe(3);
        });

        it("moves the party to a bigger table in the same slot", async () => {
            // Mario's T1 at 19:30 is full, so 5 people go to the only table with room for 5 (T3).
            const mario = await loginAt(MARIO);

            const res = await mario.patch(`${RESERVATIONS_URL}/3`).send({ partySize: 5 });

            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({ partySize: 5, seatings: [{ table_number: 3, assigned_seats: 5 }] });
            expect(seatsOf(3)).toEqual([{ date: D1, slot: "19:30", table_number: 3, assigned_seats: 5 }]);
            expect(await availableSeats(D1, "19:30")).toBe(11);
        });

        it("refuses a bigger party when there is no room and changes nothing", async () => {
            // Atomicity. The code deletes Laura's seats before it knows the new party
            // does not fit (14 seats, 15 people); the transaction must put them back.
            const laura = await loginAt(LAURA);

            const res = await laura.patch(`${RESERVATIONS_URL}/2`).send({ partySize: 15 });

            expect(res.status).toBe(409);
            expect(res.body).toMatchObject({ code: 409, message: expect.stringMatching(/no longer available/) });
            expect(seatsOf(2)).toEqual(BOOKING_2_SEATS);
            expect(await availableSeats(D1, "12:00")).toBe(7);
        });

        it("keeps the requirements when a combined change is refused", async () => {
            // A refused request must not apply any part of the change, not even the requirements.
            const laura = await loginAt(LAURA);

            const res = await laura.patch(`${RESERVATIONS_URL}/2`).send({ partySize: 15, requirements: [] });

            expect(res.status).toBe(409);
            expect(requirementsOf(2)).toEqual(LAURA_REQUIREMENTS);
            expect(seatsOf(2)).toEqual(BOOKING_2_SEATS);
        });

        it("accepts the same party size and keeps the same seats", async () => {
            // Sending the current value is a valid request that changes nothing.
            const mario = await loginAt(MARIO);

            const res = await mario.patch(`${RESERVATIONS_URL}/3`).send({ partySize: 4 });

            expect(res.status).toBe(200);
            expect(res.body.seatings).toEqual([{ table_number: 1, assigned_seats: 4 }]);
            expect(seatsOf(3)).toEqual([{ date: D1, slot: "19:30", table_number: 1, assigned_seats: 4 }]);
        });
    });

    describe("moving to another slot", () => {
        it("moves the booking to another time with room", async () => {
            // The old seats must be freed and the new ones taken, both visible in GET /slots.
            const mario = await loginAt(MARIO);

            const res = await mario.patch(`${RESERVATIONS_URL}/1`).send({ slot: "13:00" });

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                id: 1,
                date: D1,
                slot: "13:00",
                partySize: 2,
                seatings: [{ table_number: 4, assigned_seats: 2 }],
                requirements: [],
            });
            expect(seatsOf(1)).toEqual([{ date: D1, slot: "13:00", table_number: 4, assigned_seats: 2 }]);
            expect(await availableSeats(D1, "12:00")).toBe(9);
            expect(await availableSeats(D1, "13:00")).toBe(14);
            const list = await mario.get(RESERVATIONS_URL);
            expect(list.body.find((r: { id: number }) => r.id === 1).slot).toBe("13:00");
        });

        it("moves the booking to another day and keeps the time", async () => {
            // When only the date is sent, the time stays 12:00. On D2 the smallest table with 2 free seats is T4.
            const mario = await loginAt(MARIO);

            const res = await mario.patch(`${RESERVATIONS_URL}/1`).send({ date: D2 });

            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({ date: D2, slot: "12:00", seatings: [{ table_number: 4, assigned_seats: 2 }] });
            expect(seatsOf(1)).toEqual([{ date: D2, slot: "12:00", table_number: 4, assigned_seats: 2 }]);
            expect(await availableSeats(D2, "12:00")).toBe(11);
            expect(await availableSeats(D1, "12:00")).toBe(9);
        });

        it("moves the booking and changes the party size in one request", async () => {
            // In the new slot the party is seated from scratch; 5 people fit only at T3.
            const mario = await loginAt(MARIO);

            const res = await mario.patch(`${RESERVATIONS_URL}/3`).send({ slot: "13:00", partySize: 5 });

            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({ slot: "13:00", partySize: 5, seatings: [{ table_number: 3, assigned_seats: 5 }] });
            expect(await availableSeats(D1, "19:30")).toBe(16);
            expect(await availableSeats(D1, "13:00")).toBe(11);
        });

        it("keeps the requirements when the booking moves", async () => {
            // Moving changes the seats, not what the party eats.
            const mario = await loginAt(MARIO);

            const res = await mario.patch(`${RESERVATIONS_URL}/3`).send({ slot: "13:00" });

            expect(res.status).toBe(200);
            expect(res.body.requirements).toEqual(SHELLFISH);
            expect(requirementsOf(3)).toEqual(SHELLFISH);
        });

        it("refuses a move to a slot where the hiker already has a booking", async () => {
            // MH-01 allows one booking per hiker per slot; Mario already has booking 3 at 19:30.
            const mario = await loginAt(MARIO);

            const res = await mario.patch(`${RESERVATIONS_URL}/1`).send({ slot: "19:30" });

            expect(res.status).toBe(409);
            expect(res.body).toMatchObject({ code: 409, message: expect.stringMatching(/already have a reservation/) });
            expectBooking1Unchanged();
            expect(await availableSeats(D1, "19:30")).toBe(12);
        });

        it("refuses a move to a slot without enough room and changes nothing", async () => {
            // Atomicity across two slots. Laura's seats at 12:00 are deleted before the code
            // finds that 13 people don't fit at 19:30 (12 free); the transaction must restore them.
            const laura = await loginAt(LAURA);

            const res = await laura.patch(`${RESERVATIONS_URL}/2`).send({ slot: "19:30", partySize: 13 });

            expect(res.status).toBe(409);
            expect(res.body.message).toMatch(/no longer available/);
            expect(seatsOf(2)).toEqual(BOOKING_2_SEATS);
            expect(await availableSeats(D1, "12:00")).toBe(7);
            expect(await availableSeats(D1, "19:30")).toBe(12);
        });

        it("answers 404 for a time that is not a slot", async () => {
            // api.md: a requested slot that does not exist is 404 for PATCH.
            const mario = await loginAt(MARIO);

            const res = await mario.patch(`${RESERVATIONS_URL}/1`).send({ slot: "15:00" });

            expect(res.status).toBe(404);
            expect(res.body).toMatchObject({ code: 404, message: expect.stringMatching(/requested slot does not exist/) });
            expectBooking1Unchanged();
        });

        it("answers 404 for a day without slots", async () => {
            // Same rule when the date has no slots at all.
            const mario = await loginAt(MARIO);

            const res = await mario.patch(`${RESERVATIONS_URL}/1`).send({ date: dayFromToday(30) });

            expect(res.status).toBe(404);
            expectBooking1Unchanged();
        });

        it("accepts a move to the slot the booking is already in", async () => {
            // The booking must not count as a conflict with itself.
            const mario = await loginAt(MARIO);

            const res = await mario.patch(`${RESERVATIONS_URL}/1`).send({ date: D1, slot: "12:00" });

            expect(res.status).toBe(200);
            expect(res.body.seatings).toEqual([{ table_number: 4, assigned_seats: 2 }]);
            expectBooking1Unchanged();
        });
    });

    describe("time rules (hut time zone)", () => {
        // 48 hours before booking 1 (D1 12:00), computed in milliseconds so a daylight saving change cannot shift it
        const CHANGE_DEADLINE = huTime(D1, "12:00").getTime() - 48 * HOUR_MS;

        it("accepts a change exactly 48 hours before the slot", async () => {
            // api.md refuses changes "less than 48 hours before"; exactly 48 hours is still allowed.
            const mario = await loginAt(MARIO, new Date(CHANGE_DEADLINE));

            const res = await mario
                .patch(`${RESERVATIONS_URL}/1`)
                .send({ requirements: [{ hasAllergies: false, details: "1 vegan" }] });

            expect(res.status).toBe(200);
            expect(requirementsOf(1)).toEqual([{ hasAllergies: false, details: "1 vegan" }]);
        });

        it("refuses a change 1 millisecond after the 48-hour limit", async () => {
            // The boundary must be exact; one moment later the booking can no longer change.
            const mario = await loginAt(MARIO, new Date(CHANGE_DEADLINE + 1));

            const res = await mario
                .patch(`${RESERVATIONS_URL}/1`)
                .send({ requirements: [{ hasAllergies: false, details: "1 vegan" }] });

            expect(res.status).toBe(400);
            expect(res.body).toMatchObject({ code: 400, message: expect.stringMatching(/48 hours/) });
            expectBooking1Unchanged();
        });

        it("refuses a move to a slot starting in less than 2 hours", async () => {
            // The MH-01 cutoff also applies to the new slot. The booking on D4 is far away
            // (so it may change), but D1 13:00 starts in 1 hour 30 minutes.
            const id = addFarBooking();
            const mario = await loginAt(MARIO, huTime(D1, "11:30"));

            const res = await mario.patch(`${RESERVATIONS_URL}/${id}`).send({ date: D1, slot: "13:00" });

            expect(res.status).toBe(400);
            expect(res.body).toMatchObject({ code: 400, message: expect.stringMatching(/at least 2 hours/) });
            expect(seatsOf(id)).toEqual([{ date: D4, slot: "12:00", table_number: 1, assigned_seats: 2 }]);
        });

        it("accepts a move to a slot starting exactly 2 hours later", async () => {
            // The 2-hour cutoff includes its boundary, like when booking.
            const id = addFarBooking();
            const mario = await loginAt(MARIO, huTime(D1, "11:00"));

            const res = await mario.patch(`${RESERVATIONS_URL}/${id}`).send({ date: D1, slot: "13:00" });

            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({ date: D1, slot: "13:00", seatings: [{ table_number: 4, assigned_seats: 2 }] });
            expect(seatsOf(id)).toEqual([{ date: D1, slot: "13:00", table_number: 4, assigned_seats: 2 }]);
        });
    });
});

describe("GET /api/v1/reservations", () => {
    beforeEach(() => {
        resetTestDatabase();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("answers 401 when nobody is logged in", async () => {
        // The list of bookings is private.

        const res = await request(app).get(RESERVATIONS_URL);

        expect(res.status).toBe(401);
        expect(res.body).toMatchObject({ code: 401 });
    });

    it("answers 403 to an employee", async () => {
        // This list is "my bookings" for hikers only.
        const employee = await loginAs(EMPLOYEE);

        const res = await employee.get(RESERVATIONS_URL);

        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ code: 403 });
    });

    it("lists only the hiker's own upcoming bookings in date and time order", async () => {
        // Mario sees bookings 1 and 3, never Laura's booking or the temporary hiker's one.
        const mario = await loginAt(MARIO);

        const res = await mario.get(RESERVATIONS_URL);

        expect(res.status).toBe(200);
        expect(res.body).toEqual([
            {
                id: 1, date: D1, slot: "12:00", partySize: 2,
                seatings: [{ table_number: 4, assigned_seats: 2 }], requirements: [],
            },
            {
                id: 3, date: D1, slot: "19:30", partySize: 4,
                seatings: [{ table_number: 1, assigned_seats: 4 }], requirements: SHELLFISH,
            },
        ]);
    });

    it("hides the bookings whose slot has already started", async () => {
        // api.md: only active bookings (slot not started yet). At 12:30 the 12:00 meal has begun.
        const mario = await loginAt(MARIO, huTime(D1, "12:30"));

        const res = await mario.get(RESERVATIONS_URL);

        expect(res.status).toBe(200);
        expect(res.body.map((r: { id: number }) => r.id)).toEqual([3]);
    });

    it("returns an empty list for a hiker without bookings", async () => {
        // No bookings is a normal answer, not an error.
        createHikerWithoutBookings();
        const hiker = await loginAs(NEW_HIKER);

        const res = await hiker.get(RESERVATIONS_URL);

        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });
});
