import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import { app } from "../../app";
import { db } from "../../database/database";
import { resetTestDatabase, dayFromToday, huTime, loginAs, MARIO } from "../helpers";

const AVAILABILITY_URL = "/api/v1/slots/availability";
const RESERVATIONS_URL = "/api/v1/reservations";
const SLOTS_URL = "/api/v1/slots";

type AvailableTable = { tableId: number; assignedSeats: number };
type Seating = { table_number: number; assigned_seats: number };

/*
 * Seed for every slot of tomorrow: tables 1-4 with 4, 4, 6 and 2 seats (16 in total).
 *
 *   Slot  | Already booked                        | Free per table (T1/T2/T3/T4) | Free
 *   12:00 | Mario: T4 x2 - Laura: T3 x6, T1 x1   | 3 / 4 / 0 / 0                | 7
 *   13:00 | nothing                              | 4 / 4 / 6 / 2                | 16
 *   19:30 | Mario: T1 x4                         | 0 / 4 / 6 / 2                | 12
 *
 * Seat rule: one table if possible (the smallest that fits), otherwise the table
 * with the most free seats first, then the rest, so the party uses the fewest tables.
 */
describe("GET /api/v1/slots/availability", () => {
    const tomorrow = dayFromToday(1);

    /** Asks for availability as a visitor who is not logged in. Query params are always strings. */
    const check = (slot: string, partySize: number | string, date = tomorrow) =>
        request(app).get(AVAILABILITY_URL).query({ date, slot, partySize: String(partySize) });

    const sumSeats = (available: AvailableTable[]): number =>
        available.reduce((sum, table) => sum + table.assignedSeats, 0);

    /** Read-only: counts the rows of a table. Never used to write. */
    const countRows = (table: "booking" | "seated_at"): number =>
        (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

    beforeEach(() => {
        // A freshly seeded in-memory DB for every test, so no test depends on another one
        resetTestDatabase();
    });

    afterEach(() => {
        // Put the real clock back in case a test faked it
        vi.useRealTimers();
    });

    describe("proposing tables", () => {
        it("seats a party that fits at one table on the smallest table that fits", async () => {
            // Why: the happy path through route, schema, controller, SQL and seat rule together.
            // At 13:00 only table 3 (6 seats) can take 5 people.

            const res = await check("13:00", 5);

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ available: [{ tableId: 3, assignedSeats: 5 }] });
        });

        it("splits a larger party over the fewest tables, and the split adds up to the party size", async () => {
            // Why: no table has 10 seats, so the party must be split. The biggest table has 6,
            // so 2 tables is the minimum: 6 on table 3, the other 4 on the smallest table that fits.

            const res = await check("13:00", 10);

            expect(res.status).toBe(200);
            expect(res.body.available).toEqual([
                { tableId: 3, assignedSeats: 6 },
                { tableId: 1, assignedSeats: 4 },
            ]);
            expect(res.body.available).toHaveLength(2);
            expect(sumSeats(res.body.available)).toBe(10);
        });

        it("proposes a split when the party exactly fills the free seats", async () => {
            // Why: 12:00 has exactly 7 free seats, and table 1 is partly booked in the seed (3 of 4 free),
            // so this proves the SQL subtracts the seats already taken.

            const res = await check("12:00", 7);

            expect(res.status).toBe(200);
            expect(res.body.available).toEqual([
                { tableId: 2, assignedSeats: 4 },
                { tableId: 1, assignedSeats: 3 },
            ]);
            expect(sumSeats(res.body.available)).toBe(7);
        });

        it("returns an empty list when the party is one person too many", async () => {
            // Why: "not enough seats" is a normal answer (200 with an empty list), not an error.

            const res = await check("12:00", 8);

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ available: [] });
        });
    });

    describe("after a real booking", () => {
        it("shows fewer free seats after a real booking for the same slot", async () => {
            // Why: proves the availability check reads the seated_at rows that a real booking writes.
            const mario = await loginAs(MARIO);
            const before = await check("13:00", 10);
            expect(before.body.available).toEqual([
                { tableId: 3, assignedSeats: 6 },
                { tableId: 1, assignedSeats: 4 },
            ]);
            const booking = await mario.post(RESERVATIONS_URL).send({ date: tomorrow, slot: "13:00", partySize: 7 });
            expect(booking.status).toBe(201);

            const nine = await check("13:00", 9);
            const ten = await check("13:00", 10);

            // 16 - 7 = 9 seats left: table 3 is full, table 4 has 1 seat left
            expect(nine.status).toBe(200);
            expect(nine.body.available).toEqual([
                { tableId: 1, assignedSeats: 4 },
                { tableId: 2, assignedSeats: 4 },
                { tableId: 4, assignedSeats: 1 },
            ]);
            expect(ten.status).toBe(200);
            expect(ten.body).toEqual({ available: [] });
        });

        it("proposes exactly the tables that a real booking then gets", async () => {
            // Why: the user should be seated the way the check promised. Both use the same seat rule,
            // but only an end-to-end comparison over HTTP proves it.
            const mario = await loginAs(MARIO);

            const proposal = await check("13:00", 7);
            const booking = await mario.post(RESERVATIONS_URL).send({ date: tomorrow, slot: "13:00", partySize: 7 });

            expect(proposal.status).toBe(200);
            expect(booking.status).toBe(201);
            const proposed = proposal.body.available.map((t: AvailableTable) => [t.tableId, t.assignedSeats]);
            const booked = booking.body.seatings.map((s: Seating) => [s.table_number, s.assigned_seats]);
            expect(proposed).toEqual([[3, 6], [4, 1]]);
            expect(booked).toEqual(proposed);
        });
    });

    describe("unknown slot (404)", () => {
        it("answers 404 for a time that is not a slot of that day", async () => {
            // Why: "this slot does not exist" (404) must stay different from "not enough seats" (200, []).

            const res = await check("11:00", 2);

            expect(res.status).toBe(404);
            expect(res.body).toEqual({ code: 404, name: "NotFoundError", message: "Slot not found" });
        });

        it("answers 404 for a day without slots", async () => {
            // Why: same rule for a date that has no slots at all.

            const res = await check("13:00", 2, dayFromToday(30));

            expect(res.status).toBe(404);
            expect(res.body).toEqual({ code: 404, name: "NotFoundError", message: "Slot not found" });
        });
    });

    describe("validation (400)", () => {
        const valid = () => ({ date: tomorrow, slot: "13:00", partySize: "2" });
        const without = (field: "date" | "slot" | "partySize") => {
            const query: Record<string, string> = valid();
            delete query[field];
            return query;
        };
        const PARTY_SIZE_MESSAGE = "partySize: partySize must be a positive integer";

        it.each([
            ["a missing date", () => without("date"), "date: "],
            ["a missing time", () => without("slot"), "slot: "],
            ["a date that does not exist", () => ({ ...valid(), date: "2026-02-30" }), "date: "],
            ["a time with a wrong format", () => ({ ...valid(), slot: "24:00" }), "slot: "],
        ])("rejects %s and names the field", async (_label, query, fieldPrefix) => {
            // Why: proves the validation is wired in front of the controller in the real app,
            // and that the message tells the user which field is wrong.

            const res = await request(app).get(AVAILABILITY_URL).query(query());

            expect(res.status).toBe(400);
            expect(res.body).toMatchObject({ code: 400, name: "BadRequestError" });
            expect(res.body.message.startsWith(fieldPrefix)).toBe(true);
        });

        it.each([
            ["a missing party size", () => without("partySize")],
            ["a party size of 0", () => ({ ...valid(), partySize: "0" })],
            ["a decimal party size", () => ({ ...valid(), partySize: "2.5" })],
            ["a party size that is text", () => ({ ...valid(), partySize: "abc" })],
        ])("rejects %s with a clear message", async (_label, query) => {
            // Why: the party size must be a positive whole number, and the user gets one clear message.

            const res = await request(app).get(AVAILABILITY_URL).query(query());

            expect(res.status).toBe(400);
            expect(res.body).toEqual({ code: 400, name: "BadRequestError", message: PARTY_SIZE_MESSAGE });
        });
    });

    describe("booking window (2 hours before the slot)", () => {
        it("still proposes a split exactly 2 hours before the slot", async () => {
            // Why: the rule is "up to 2 hours before", so 10:00 for the 12:00 slot is still open.
            // The fake clock makes "now" the same on every run; only Date is faked, so HTTP still works.
            vi.useFakeTimers({ toFake: ["Date"] });
            vi.setSystemTime(huTime(tomorrow, "10:00"));

            const res = await check("12:00", 2);

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ available: [{ tableId: 1, assignedSeats: 2 }] });
        });

        it("returns an empty list one millisecond after the cutoff", async () => {
            // Why: right after the cutoff the slot is closed. It still exists, so the answer is 200 [] and not 404.
            vi.useFakeTimers({ toFake: ["Date"] });
            vi.setSystemTime(huTime(tomorrow, "10:00").getTime() + 1);

            const res = await check("12:00", 2);

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ available: [] });
        });

        it("returns an empty list for a slot that has already started", async () => {
            // Why: a slot in the past is closed too, but it is still a real slot, so again 200 [].
            vi.useFakeTimers({ toFake: ["Date"] });
            vi.setSystemTime(huTime(tomorrow, "12:30"));

            const res = await check("12:00", 2);

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ available: [] });
        });
    });

    describe("access", () => {
        it("works without logging in", async () => {
            // Why: the endpoint is public, so a visitor can check before creating an account.

            const res = await check("13:00", 5);

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ available: [{ tableId: 3, assignedSeats: 5 }] });
        });

        it("gives the same answer to a logged-in hiker", async () => {
            // Why: being logged in must not change or block the answer.
            const mario = await loginAs(MARIO);
            const anonymous = await check("13:00", 5);

            const res = await mario.get(AVAILABILITY_URL).query({ date: tomorrow, slot: "13:00", partySize: "5" });

            expect(res.status).toBe(200);
            expect(res.body).toEqual(anonymous.body);
        });
    });

    describe("read-only and consistency", () => {
        it("never creates a booking when checking availability", async () => {
            // Why: checking is not booking. We check twice: through the public API (seats shown by GET /slots)
            // and directly in the DB (row counts, read-only).
            const bookingsBefore = countRows("booking");
            const seatsBefore = countRows("seated_at");

            await check("12:00", 7);
            await check("12:00", 8);
            await check("13:00", 16);

            const slots = await request(app).get(SLOTS_URL).query({ date: tomorrow });
            expect(slots.status).toBe(200);
            expect(slots.body.map((s: { start_time: string; available_seats: number }) => [s.start_time, s.available_seats]))
                .toEqual([["12:00", 7], ["13:00", 16], ["19:30", 12]]);
            expect(countRows("booking")).toBe(bookingsBefore);
            expect(countRows("seated_at")).toBe(seatsBefore);
        });

        it("agrees with the free seats shown by GET /slots", async () => {
            // Why: the slot list and the availability check must tell the same story. For each slot,
            // a party of exactly the free seats fits, and one more person does not.
            const slots = await request(app).get(SLOTS_URL).query({ date: tomorrow });
            expect(slots.body).toHaveLength(3);

            for (const slot of slots.body as { start_time: string; available_seats: number }[]) {
                const fits = await check(slot.start_time, slot.available_seats);
                const tooMany = await check(slot.start_time, slot.available_seats + 1);

                expect(fits.status).toBe(200);
                expect(fits.body.available.length).toBeGreaterThan(0);
                expect(sumSeats(fits.body.available)).toBe(slot.available_seats);
                expect(tooMany.status).toBe(200);
                expect(tooMany.body).toEqual({ available: [] });
            }
        });
    });
});
