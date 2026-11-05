import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../app";
import { db } from "../database/database";
import {
    resetTestDatabase, dayFromToday, loginAs, createHikerWithoutBookings,
    MARIO, EMPLOYEE, NEW_HIKER,
} from "./helpers";

/*
 * Provide party requirements - integration tests.
 * They go through the real HTTP stack (session, role check, validation, controller, DAO)
 * and the real in-memory database, and check what is stored for the kitchen.
 *
 * The seed already has 3 dietary requirements: two for booking 2 and one for booking 3.
 */
const RESERVATIONS_URL = "/api/v1/reservations";

type StoredRequirement = { booking_id: number; allergy_flag: number; description: string };

const countRows = (table: "booking" | "seated_at" | "dietary_requirement"): number =>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

const storedRequirements = (booking_id: number): StoredRequirement[] =>
    db.prepare(
        "SELECT booking_id, allergy_flag, description FROM dietary_requirement WHERE booking_id = ? ORDER BY id"
    ).all(booking_id) as StoredRequirement[];

describe("Provide party requirements - integration", () => {
    const tomorrow = dayFromToday(1);
    const reservation = (partySize: number, requirements?: unknown) =>
        ({ date: tomorrow, slot: "13:00", partySize, requirements });

    beforeEach(() => {
        resetTestDatabase();
        createHikerWithoutBookings();
    });

    describe("saving the requirements with the booking", () => {
        it("stores every requirement linked to the new booking", async () => {
            const hiker = await loginAs(NEW_HIKER);

            const res = await hiker.post(RESERVATIONS_URL).send(reservation(4, [
                { hasAllergies: true, details: "1 peanut allergy" },
                { hasAllergies: false, details: "2 vegetarians" },
            ]));

            expect(res.status).toBe(201);
            expect(storedRequirements(res.body.id)).toEqual([
                { booking_id: res.body.id, allergy_flag: 1, description: "1 peanut allergy" },
                { booking_id: res.body.id, allergy_flag: 0, description: "2 vegetarians" },
            ]);
        });

        it("stores the trimmed details", async () => {
            const hiker = await loginAs(NEW_HIKER);

            const res = await hiker.post(RESERVATIONS_URL)
                .send(reservation(2, [{ hasAllergies: false, details: "  1 vegan  " }]));

            expect(res.status).toBe(201);
            expect(storedRequirements(res.body.id).map((r) => r.description)).toEqual(["1 vegan"]);
        });

        it.each([
            ["omitted", undefined],
            ["an empty list", []],
        ])("stores no requirement when they are %s", async (_label, requirements) => {
            const hiker = await loginAs(NEW_HIKER);
            const before = countRows("dietary_requirement");

            const res = await hiker.post(RESERVATIONS_URL).send(reservation(2, requirements));

            expect(res.status).toBe(201);
            expect(storedRequirements(res.body.id)).toEqual([]);
            expect(countRows("dietary_requirement")).toBe(before);
        });

        it("keeps the requirements of the other bookings untouched", async () => {
            const hiker = await loginAs(NEW_HIKER);
            const seeded = [...storedRequirements(2), ...storedRequirements(3)];

            await hiker.post(RESERVATIONS_URL)
                .send(reservation(2, [{ hasAllergies: true, details: "1 gluten intolerance" }]));

            expect([...storedRequirements(2), ...storedRequirements(3)]).toEqual(seeded);
        });

        it("keeps the requirements of each booking separate", async () => {
            const hiker = await loginAs(NEW_HIKER);
            const mario = await loginAs(MARIO);

            const first = await hiker.post(RESERVATIONS_URL)
                .send(reservation(2, [{ hasAllergies: true, details: "1 shellfish allergy" }]));
            const second = await mario.post(RESERVATIONS_URL)
                .send(reservation(3, [{ hasAllergies: false, details: "3 vegetarians" }]));

            expect(first.status).toBe(201);
            expect(second.status).toBe(201);
            expect(storedRequirements(first.body.id).map((r) => r.description)).toEqual(["1 shellfish allergy"]);
            expect(storedRequirements(second.body.id).map((r) => r.description)).toEqual(["3 vegetarians"]);
        });
    });

    describe("rules that cross layers", () => {
        it("saves nothing when the capacity check fails", async () => {
            const mario = await loginAs(MARIO);
            const bookings = countRows("booking");
            const seatings = countRows("seated_at");
            const requirements = countRows("dietary_requirement");

            const res = await mario.post(RESERVATIONS_URL).send({
                date: tomorrow, slot: "12:00", partySize: 8, // only 7 free
                requirements: [{ hasAllergies: false, details: "2 vegetarians" }],
            });

            expect(res.status).toBe(409);
            expect(countRows("booking")).toBe(bookings);
            expect(countRows("seated_at")).toBe(seatings);
            expect(countRows("dietary_requirement")).toBe(requirements);
        });

        it("saves neither the booking nor the requirements when a requirement is invalid", async () => {
            const hiker = await loginAs(NEW_HIKER);
            const bookings = countRows("booking");
            const requirements = countRows("dietary_requirement");

            const res = await hiker.post(RESERVATIONS_URL).send(reservation(3, [
                { hasAllergies: false, details: "2 vegetarians" },
                { hasAllergies: true, details: " " },
            ]));

            expect(res.status).toBe(400);
            expect(countRows("booking")).toBe(bookings);
            expect(countRows("dietary_requirement")).toBe(requirements);
        });

        it("saves nothing when the slot does not exist", async () => {
            const hiker = await loginAs(NEW_HIKER);
            const requirements = countRows("dietary_requirement");

            const res = await hiker.post(RESERVATIONS_URL).send({
                date: tomorrow, slot: "15:00", partySize: 2,
                requirements: [{ hasAllergies: true, details: "1 peanut allergy" }],
            });

            expect(res.status).toBe(400);
            expect(countRows("dietary_requirement")).toBe(requirements);
        });

        it("does not let staff provide requirements", async () => {
            const employee = await loginAs(EMPLOYEE);
            const requirements = countRows("dietary_requirement");

            const res = await employee.post(RESERVATIONS_URL)
                .send(reservation(2, [{ hasAllergies: true, details: "1 peanut allergy" }]));

            expect(res.status).toBe(403);
            expect(countRows("dietary_requirement")).toBe(requirements);
        });

        it("does not accept requirements from an anonymous user", async () => {
            const requirements = countRows("dietary_requirement");

            const res = await request(app).post(RESERVATIONS_URL)
                .send(reservation(2, [{ hasAllergies: true, details: "1 peanut allergy" }]));

            expect(res.status).toBe(401);
            expect(countRows("dietary_requirement")).toBe(requirements);
        });
    });
});
