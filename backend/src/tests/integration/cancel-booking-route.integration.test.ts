import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import { app } from "../../app";
import { db } from "../../database/database";
import {
    resetTestDatabase, dayFromToday, huTime, loginAs, createHikerWithoutBookings,
    MARIO, LAURA, EMPLOYEE, NEW_HIKER,
} from "../helpers";

/*
 * Cancel a booking (MH-8): DELETE /api/v1/reservations/:reservationId.
 * Everything is real: session, route, validation, controller, DAO, SQL, transaction, in-memory database.
 *
 * Seed (reset before every test). Every slot has tables T1 = 4, T2 = 4, T3 = 6, T4 = 2 seats (16 in total).
 *  - booking 1: Mario, D1 12:00, T4 x 2 (party 2), no requirements
 *  - booking 2: Laura, D1 12:00, T1 x 1 + T3 x 6 (party 7), 2 requirements
 *  - booking 3: Mario, D1 19:30, T1 x 4 (party 4), 1 requirement
 *  - booking 4: temporary hiker (made by staff), D2 12:00, T2 x 3
 * Free seats: D1 12:00 = 7 | D1 13:00 = 16 | D1 19:30 = 12 | D2 12:00 = 13
 *
 * A hiker can cancel at any time: the tests with a faked clock prove that even a slot that has already
 * started can be cancelled.
 */

const RESERVATIONS_URL = "/api/v1/reservations";
const SLOTS_URL = "/api/v1/slots";
const WARDEN = "warden@mountainhut.test";

// Computed once with the real clock: a faked clock would otherwise shift dayFromToday
const D1 = dayFromToday(1);
const D2 = dayFromToday(2);

type Seat = { date: string; slot: string; table_number: number; assigned_seats: number };

const bookingExists = (id: number): boolean =>
    db.prepare("SELECT 1 FROM booking WHERE id = ?").get(id) !== undefined;

const bookingCount = (): number =>
    db.prepare<[], { n: number }>("SELECT COUNT(*) AS n FROM booking").get()!.n;

const hikerCount = (): number =>
    db.prepare<[], { n: number }>("SELECT COUNT(*) AS n FROM hiker").get()!.n;

const seatsOf = (bookingId: number): Seat[] =>
    db.prepare<[number], Seat>(
        `SELECT slot_date AS date, slot_start_time AS slot, table_number, assigned_seats
         FROM seated_at WHERE booking_id = ? ORDER BY table_number`
    ).all(bookingId);

const requirementCount = (bookingId: number): number =>
    db.prepare<[number], { n: number }>("SELECT COUNT(*) AS n FROM dietary_requirement WHERE booking_id = ?")
        .get(bookingId)!.n;

const availableSeats = async (date: string, slot: string): Promise<number | undefined> => {
    const res = await request(app).get(SLOTS_URL).query({ date });
    return res.body.find((s: { start_time: string }) => s.start_time === slot)?.available_seats;
};

/** Every table of the seed booking is as it was at the start. */
const expectSeedBookingIntact = (id: number, seats: Seat[], requirements: number) => {
    expect(bookingExists(id)).toBe(true);
    expect(seatsOf(id)).toEqual(seats);
    expect(requirementCount(id)).toBe(requirements);
};

const BOOKING_1_SEATS: Seat[] = [{ date: D1, slot: "12:00", table_number: 4, assigned_seats: 2 }];
const BOOKING_2_SEATS: Seat[] = [
    { date: D1, slot: "12:00", table_number: 1, assigned_seats: 1 },
    { date: D1, slot: "12:00", table_number: 3, assigned_seats: 6 },
];
const BOOKING_3_SEATS: Seat[] = [{ date: D1, slot: "19:30", table_number: 1, assigned_seats: 4 }];

describe("DELETE /api/v1/reservations/:reservationId", () => {
    beforeEach(() => {
        resetTestDatabase();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe("access control", () => {
        it("answers 401 when nobody is logged in", async () => {
            // Only a logged-in hiker may cancel a booking.

            const res = await request(app).delete(`${RESERVATIONS_URL}/1`);

            expect(res.status).toBe(401);
            expect(res.body).toMatchObject({ code: 401, message: "Not authenticated" });
            expectSeedBookingIntact(1, BOOKING_1_SEATS, 0);
        });

        it.each([
            ["an employee", EMPLOYEE],
            ["the warden", WARDEN],
        ])("answers 403 to %s", async (_label, email) => {
            // Staff accounts cannot use the hiker's "cancel my booking" endpoint.
            const staff = await loginAs(email);

            const res = await staff.delete(`${RESERVATIONS_URL}/1`);

            expect(res.status).toBe(403);
            expect(res.body).toMatchObject({ code: 403, message: "Not allowed for this role" });
            expectSeedBookingIntact(1, BOOKING_1_SEATS, 0);
        });

        it("answers 403 when the booking belongs to another hiker", async () => {
            // Laura must not cancel Mario's booking: nothing is deleted.
            const laura = await loginAs(LAURA);

            const res = await laura.delete(`${RESERVATIONS_URL}/1`);

            expect(res.status).toBe(403);
            expect(res.body).toMatchObject({ code: 403 });
            expectSeedBookingIntact(1, BOOKING_1_SEATS, 0);
        });

        it("answers 403 when the booking was made by the staff for another hiker", async () => {
            // Booking 4 belongs to a temporary hiker created by the staff, not to Mario.
            const mario = await loginAs(MARIO);

            const res = await mario.delete(`${RESERVATIONS_URL}/4`);

            expect(res.status).toBe(403);
            expect(bookingExists(4)).toBe(true);
            expect(await availableSeats(D2, "12:00")).toBe(13);
        });
    });

    describe("the reservation id", () => {
        it.each(["abc", "0", "-1", "1.5"])("answers 400 to the invalid id %s", async (id) => {
            // Only a positive whole number is an id: the request never reaches the database.
            const mario = await loginAs(MARIO);

            const res = await mario.delete(`${RESERVATIONS_URL}/${id}`);

            expect(res.status).toBe(400);
            expect(bookingCount()).toBe(4);
        });

        it("answers 404 when the booking does not exist", async () => {
            const mario = await loginAs(MARIO);

            const res = await mario.delete(`${RESERVATIONS_URL}/9999`);

            expect(res.status).toBe(404);
            expect(res.body).toMatchObject({ code: 404 });
            expect(bookingCount()).toBe(4);
        });
    });

    describe("cancelling a booking", () => {
        it("answers 204 with no body and removes the booking and its seats", async () => {
            const mario = await loginAs(MARIO);

            const res = await mario.delete(`${RESERVATIONS_URL}/1`);

            expect(res.status).toBe(204);
            expect(res.body).toEqual({});
            expect(res.text).toBe("");
            expect(bookingExists(1)).toBe(false);
            expect(seatsOf(1)).toEqual([]);
        });

        it("gives the seats back, so the slot shows more free seats", async () => {
            // 12:00 has 7 free seats. Booking 1 holds 2: after the cancellation 9 are free.
            const mario = await loginAs(MARIO);
            expect(await availableSeats(D1, "12:00")).toBe(7);

            await mario.delete(`${RESERVATIONS_URL}/1`);

            expect(await availableSeats(D1, "12:00")).toBe(9);
        });

        it("removes the dietary requirements of the booking too", async () => {
            // Laura's booking has two requirements and seats on two tables (7 seats): everything goes.
            const laura = await loginAs(LAURA);
            expect(requirementCount(2)).toBe(2);

            const res = await laura.delete(`${RESERVATIONS_URL}/2`);

            expect(res.status).toBe(204);
            expect(requirementCount(2)).toBe(0);
            expect(seatsOf(2)).toEqual([]);
            expect(await availableSeats(D1, "12:00")).toBe(14);
        });

        it("leaves the other bookings, even in the same slot, untouched", async () => {
            // Booking 2 shares the 12:00 slot with booking 1, booking 3 is Mario's other booking.
            const mario = await loginAs(MARIO);

            await mario.delete(`${RESERVATIONS_URL}/1`);

            expectSeedBookingIntact(2, BOOKING_2_SEATS, 2);
            expectSeedBookingIntact(3, BOOKING_3_SEATS, 1);
            expect(bookingExists(4)).toBe(true);
            expect(bookingCount()).toBe(3);
        });

        it("keeps the hiker, who can book again", async () => {
            // Only the booking is deleted, never the person.
            const mario = await loginAs(MARIO);
            const hikers = hikerCount();

            await mario.delete(`${RESERVATIONS_URL}/1`);

            expect(hikerCount()).toBe(hikers);
            const again = await mario.post(RESERVATIONS_URL).send({ date: D1, slot: "13:00", partySize: 2 });
            expect(again.status).toBe(201);
        });

        it("removes the booking from the list of the hiker", async () => {
            const mario = await loginAs(MARIO);
            const before = await mario.get(RESERVATIONS_URL);
            expect(before.body.map((r: { id: number }) => r.id)).toEqual([1, 3]);

            await mario.delete(`${RESERVATIONS_URL}/1`);

            const after = await mario.get(RESERVATIONS_URL);
            expect(after.status).toBe(200);
            expect(after.body.map((r: { id: number }) => r.id)).toEqual([3]);
        });

        it("answers 404 when the same booking is cancelled twice", async () => {
            // For example, the hiker cancelled it in another tab: the second request finds nothing.
            const mario = await loginAs(MARIO);
            await mario.delete(`${RESERVATIONS_URL}/1`);

            const second = await mario.delete(`${RESERVATIONS_URL}/1`);

            expect(second.status).toBe(404);
            expect(await availableSeats(D1, "12:00")).toBe(9);
        });

        it("lets another hiker book the seats that were given back", async () => {
            // 12:00 has 7 free seats, so a party of 9 does not fit. After Mario's 2 seats are free, it does.
            createHikerWithoutBookings();
            const mario = await loginAs(MARIO);
            const newHiker = await loginAs(NEW_HIKER);
            const party = { date: D1, slot: "12:00", partySize: 9 };
            expect((await newHiker.post(RESERVATIONS_URL).send(party)).status).toBe(409);

            await mario.delete(`${RESERVATIONS_URL}/1`);

            const res = await newHiker.post(RESERVATIONS_URL).send(party);
            expect(res.status).toBe(201);
            expect(await availableSeats(D1, "12:00")).toBeUndefined(); // the slot is now full
        });
    });

    describe("there is no time limit", () => {
        // Unlike a change, a cancellation is allowed at any moment. The clock is set after the login,
        // so that the session itself stays on the real clock.
        it.each([
            ["10 minutes before the slot starts", "11:50"],
            ["when the slot has already started", "12:30"],
            ["after the slot has ended", "15:00"],
        ])("cancels %s", async (_label, time) => {
            const mario = await loginAs(MARIO);
            vi.useFakeTimers({ toFake: ["Date"] });
            vi.setSystemTime(huTime(D1, time));

            const res = await mario.delete(`${RESERVATIONS_URL}/1`);

            expect(res.status).toBe(204);
            expect(bookingExists(1)).toBe(false);
            expect(seatsOf(1)).toEqual([]);
        });
    });
});