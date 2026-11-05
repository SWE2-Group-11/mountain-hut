import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import { app } from "../../app";
import {
    resetTestDatabase, dayFromToday, huTime, loginAs, createHikerWithoutBookings,
    MARIO, LAURA, EMPLOYEE, NEW_HIKER,
} from "../helpers";

const RESERVATIONS_URL = "/api/v1/reservations";
const SLOTS_URL = "/api/v1/slots";

/*
 * Mario and Laura already have a booking at 12:00 tomorrow, so the tests that book 12:00
 * use a hiker without bookings (NEW_HIKER) to avoid the "one booking per slot" rule.
 *
 * Seed for every slot of tomorrow: tables of 4, 4, 6 and 2 seats (16 in total).
 *  - 12:00 already has 9 seats taken -> free: table 1 (3 seats), table 2 (4 seats) = 7
 *  - 13:00 is empty                  -> 16 free
 *  - 19:30 has table 1 full          -> 12 free
 */
describe("POST /api/v1/reservations", () => {
    const tomorrow = dayFromToday(1);
    const book = (slot: string, partySize: number, date = tomorrow) => ({ date, slot, partySize });

    beforeEach(() => {
        resetTestDatabase();
        createHikerWithoutBookings();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe("access control", () => {
        it("answers 401 when nobody is logged in", async () => {
            const res = await request(app).post(RESERVATIONS_URL).send(book("13:00", 2));

            expect(res.status).toBe(401);
            expect(res.body).toMatchObject({ code: 401 });
        });

        it("answers 403 for a staff account", async () => {
            const employee = await loginAs(EMPLOYEE);

            const res = await employee.post(RESERVATIONS_URL).send(book("13:00", 2));

            expect(res.status).toBe(403);
            expect(res.body).toMatchObject({ code: 403 });
        });
    });

    describe("validation (400)", () => {
        it.each([
            ["a missing party size", { date: tomorrow, slot: "13:00" }],
            ["a party size of 0", { date: tomorrow, slot: "13:00", partySize: 0 }],
            ["a negative party size", { date: tomorrow, slot: "13:00", partySize: -2 }],
            ["a decimal party size", { date: tomorrow, slot: "13:00", partySize: 1.5 }],
            ["a party size sent as text", { date: tomorrow, slot: "13:00", partySize: "2" }],
            ["a missing date", { slot: "13:00", partySize: 2 }],
            ["a date that does not exist", { date: "2026-02-30", slot: "13:00", partySize: 2 }],
            ["a missing time", { date: tomorrow, partySize: 2 }],
            ["a time with a wrong format", { date: tomorrow, slot: "25:00", partySize: 2 }],
        ])("rejects %s", async (_label, body) => {
            const mario = await loginAs(MARIO);

            const res = await mario.post(RESERVATIONS_URL).send(body);

            expect(res.status).toBe(400);
            expect(res.body).toMatchObject({ code: 400, message: expect.any(String) });
        });

        it("rejects a (date, time) that is not an existing slot", async () => {
            const mario = await loginAs(MARIO);

            const res = await mario.post(RESERVATIONS_URL).send(book("15:00", 2));

            expect(res.status).toBe(400);
            expect(res.body.message).toMatch(/not available/i);
        });

        it("rejects a slot on a day without slots", async () => {
            const mario = await loginAs(MARIO);

            const res = await mario.post(RESERVATIONS_URL).send(book("13:00", 2, dayFromToday(30)));

            expect(res.status).toBe(400);
        });

        it("rejects a malformed JSON body", async () => {
            const mario = await loginAs(MARIO);

            const res = await mario
                .post(RESERVATIONS_URL)
                .set("Content-Type", "application/json")
                .send("{ not json");

            expect(res.status).toBe(400);
        });
    });

    describe("booking window (2 hours before the slot)", () => {
        it("rejects a booking made less than 2 hours before the slot", async () => {
            const hiker = await loginAs(NEW_HIKER);
            vi.useFakeTimers({ toFake: ["Date"] });
            vi.setSystemTime(huTime(tomorrow, "10:01")); // the 12:00 slot closed at 10:00

            const res = await hiker.post(RESERVATIONS_URL).send(book("12:00", 2));

            expect(res.status).toBe(400);
            expect(res.body.message).toMatch(/2 hours/);
        });

        it("accepts a booking made exactly 2 hours before the slot", async () => {
            const mario = await loginAs(MARIO);
            vi.useFakeTimers({ toFake: ["Date"] });
            vi.setSystemTime(huTime(tomorrow, "11:00")); // 13:00 slot, 2 hours before

            const res = await mario.post(RESERVATIONS_URL).send(book("13:00", 2));

            expect(res.status).toBe(201);
        });
    });

    describe("successful booking (201)", () => {
        it("returns the booking with the seats assigned", async () => {
            const mario = await loginAs(MARIO);

            const res = await mario.post(RESERVATIONS_URL).send(book("13:00", 2));

            expect(res.status).toBe(201);
            expect(res.body).toEqual({
                id: expect.any(Number),
                date: tomorrow,
                slot: "13:00",
                partySize: 2,
                seatings: [{ table_number: 4, assigned_seats: 2 }], // smallest table that fits
                requirements: [],
            });
        });

        it("keeps the party together on the smallest table that fits", async () => {
            const mario = await loginAs(MARIO);

            const res = await mario.post(RESERVATIONS_URL).send(book("13:00", 5));

            expect(res.body.seatings).toEqual([{ table_number: 3, assigned_seats: 5 }]); // only the 6-seat table fits
        });

        it("shares a table that already has other guests", async () => {
            const hiker = await loginAs(NEW_HIKER);

            // 12:00 has table 1 with 3 free seats and table 2 with 4 free seats
            const res = await hiker.post(RESERVATIONS_URL).send(book("12:00", 2));

            expect(res.status).toBe(201);
            expect(res.body.seatings).toEqual([{ table_number: 1, assigned_seats: 2 }]);
        });

        it("splits the party over the fewest tables when no single table fits", async () => {
            const hiker = await loginAs(NEW_HIKER);

            const res = await hiker.post(RESERVATIONS_URL).send(book("12:00", 7)); // free: 3 + 4

            expect(res.status).toBe(201);
            expect(res.body.seatings).toHaveLength(2);
            expect(res.body.seatings).toEqual(
                expect.arrayContaining([
                    { table_number: 2, assigned_seats: 4 },
                    { table_number: 1, assigned_seats: 3 },
                ])
            );
        });

        it("reduces the seats shown for the slot", async () => {
            const mario = await loginAs(MARIO);
            await mario.post(RESERVATIONS_URL).send(book("13:00", 4));

            const slots = await request(app).get(SLOTS_URL).query({ date: tomorrow });

            const slot = slots.body.find((s: { start_time: string }) => s.start_time === "13:00");
            expect(slot.available_seats).toBe(12);
        });

        it("accepts a party that fills the slot exactly and then hides the slot", async () => {
            const hiker = await loginAs(NEW_HIKER);

            const res = await hiker.post(RESERVATIONS_URL).send(book("12:00", 7));
            expect(res.status).toBe(201);

            const slots = await request(app).get(SLOTS_URL).query({ date: tomorrow });
            expect(slots.body.map((s: { start_time: string }) => s.start_time)).not.toContain("12:00");
        });
    });

    describe("capacity (409)", () => {
        it("rejects a party larger than the free seats", async () => {
            const hiker = await loginAs(NEW_HIKER);

            const res = await hiker.post(RESERVATIONS_URL).send(book("12:00", 8)); // only 7 free

            expect(res.status).toBe(409);
            expect(res.body).toMatchObject({ code: 409, message: expect.any(String) });
        });

        it("does not save anything when the booking is rejected", async () => {
            const hiker = await loginAs(NEW_HIKER);
            await hiker.post(RESERVATIONS_URL).send(book("12:00", 8));

            const slots = await request(app).get(SLOTS_URL).query({ date: tomorrow });

            const slot = slots.body.find((s: { start_time: string }) => s.start_time === "12:00");
            expect(slot.available_seats).toBe(7);
        });

        it("rejects a second hiker once the previous bookings used all the seats", async () => {
            const mario = await loginAs(MARIO);
            const laura = await loginAs(LAURA);
            expect((await mario.post(RESERVATIONS_URL).send(book("13:00", 16))).status).toBe(201);

            const res = await laura.post(RESERVATIONS_URL).send(book("13:00", 1));

            expect(res.status).toBe(409);
        });
    });

    describe("one booking per slot (409)", () => {
        it("rejects a second booking of the same hiker in a slot", async () => {
            const mario = await loginAs(MARIO); // already booked 12:00 tomorrow

            const res = await mario.post(RESERVATIONS_URL).send(book("12:00", 1));

            expect(res.status).toBe(409);
            expect(res.body).toMatchObject({ code: 409, message: expect.stringMatching(/already have a booking/i) });
        });

        it("rejects a second booking made through the API in the same slot", async () => {
            const hiker = await loginAs(NEW_HIKER);
            expect((await hiker.post(RESERVATIONS_URL).send(book("13:00", 2))).status).toBe(201);

            const res = await hiker.post(RESERVATIONS_URL).send(book("13:00", 2));

            expect(res.status).toBe(409);
        });

        it("does not save anything when the second booking is rejected", async () => {
            const mario = await loginAs(MARIO);
            await mario.post(RESERVATIONS_URL).send(book("12:00", 1));

            const slots = await request(app).get(SLOTS_URL).query({ date: tomorrow });

            const slot = slots.body.find((s: { start_time: string }) => s.start_time === "12:00");
            expect(slot.available_seats).toBe(7);
        });

        it("lets the same hiker book a different slot", async () => {
            const mario = await loginAs(MARIO);

            const res = await mario.post(RESERVATIONS_URL).send(book("13:00", 2));

            expect(res.status).toBe(201);
        });

        it("does not block other hikers from the same slot", async () => {
            const hiker = await loginAs(NEW_HIKER);

            const res = await hiker.post(RESERVATIONS_URL).send(book("12:00", 2));

            expect(res.status).toBe(201);
        });
    });
});