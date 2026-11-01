import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../app";
import { db } from "../database/database";
import {
    resetTestDatabase, dayFromToday, loginAs, createHikerWithoutBookings,
    MARIO, LAURA, EMPLOYEE, NEW_HIKER, PASSWORD,
} from "./helpers";

/*
 * MH-01 Book a table - integration tests.
 * They go through the real HTTP stack (session, role check, validation, controller, DAO)
 * and the real in-memory database, and follow what a user does across several routes.
 */
const SESSION_URL = "/api/v1/session";
const SLOTS_URL = "/api/v1/slots";
const RESERVATIONS_URL = "/api/v1/reservations";

type SlotRow = { start_time: string; available_seats: number };

const countRows = (table: "booking" | "seated_at"): number =>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

const slotAt = async (date: string, time: string): Promise<SlotRow | undefined> => {
    const res = await request(app).get(SLOTS_URL).query({ date });
    return (res.body as SlotRow[]).find((s) => s.start_time === time);
};

describe("Book a table - integration", () => {
    const tomorrow = dayFromToday(1);

    beforeEach(() => {
        resetTestDatabase();
        createHikerWithoutBookings();
    });

    describe("session", () => {
        it("logs in, reads the current user and logs out", async () => {
            const agent = request.agent(app);

            const login = await agent.post(SESSION_URL).send({ username: NEW_HIKER, password: PASSWORD });
            expect(login.status).toBe(201);

            const current = await agent.get(`${SESSION_URL}/current`);
            expect(current.status).toBe(200);
            expect(current.body).toMatchObject({ username: NEW_HIKER, role: "hiker" });
            expect(current.body).not.toHaveProperty("password_hash");

            const logout = await agent.delete(`${SESSION_URL}/current`);
            expect([200, 204]).toContain(logout.status);

            expect((await agent.get(`${SESSION_URL}/current`)).status).toBe(401);
        });

        it("rejects a wrong password", async () => {
            const res = await request(app).post(SESSION_URL).send({ username: MARIO, password: "wrong" });

            expect(res.status).toBe(401);
        });

        it("cannot book after logging out", async () => {
            const hiker = await loginAs(NEW_HIKER);
            await hiker.delete(`${SESSION_URL}/current`);

            const res = await hiker.post(RESERVATIONS_URL).send({ date: tomorrow, slot: "13:00", partySize: 2 });

            expect(res.status).toBe(401);
        });
    });

    describe("hiker journey", () => {
        it("lists the slots, books one and sees the seats go down", async () => {
            const hiker = await loginAs(NEW_HIKER);

            const before = await slotAt(tomorrow, "13:00");
            expect(before?.available_seats).toBe(16);

            const booked = await hiker.post(RESERVATIONS_URL).send({ date: tomorrow, slot: "13:00", partySize: 3 });
            expect(booked.status).toBe(201);
            expect(booked.body).toMatchObject({ date: tomorrow, slot: "13:00", partySize: 3 });

            const after = await slotAt(tomorrow, "13:00");
            expect(after?.available_seats).toBe(13);
        });

        it("stores a booking whose assigned seats add up to the party size", async () => {
            const hiker = await loginAs(NEW_HIKER);

            const res = await hiker.post(RESERVATIONS_URL).send({ date: tomorrow, slot: "12:00", partySize: 7 });

            expect(res.status).toBe(201);
            const stored = db
                .prepare("SELECT SUM(assigned_seats) AS seats FROM seated_at WHERE booking_id = ?")
                .get(res.body.id) as { seats: number };
            expect(stored.seats).toBe(7);
            const sum = res.body.seatings.reduce(
                (total: number, s: { assigned_seats: number }) => total + s.assigned_seats, 0);
            expect(sum).toBe(7);
        });

        it("lets two hikers share a slot until it is full, then hides it", async () => {
            const mario = await loginAs(MARIO);
            const laura = await loginAs(LAURA);

            expect((await mario.post(RESERVATIONS_URL).send({ date: tomorrow, slot: "13:00", partySize: 10 })).status).toBe(201);
            expect((await laura.post(RESERVATIONS_URL).send({ date: tomorrow, slot: "13:00", partySize: 6 })).status).toBe(201);

            expect(await slotAt(tomorrow, "13:00")).toBeUndefined();

            const hiker = await loginAs(NEW_HIKER);
            const late = await hiker.post(RESERVATIONS_URL).send({ date: tomorrow, slot: "13:00", partySize: 1 });
            expect(late.status).toBe(409);
        });

        it("keeps the other slots of the day untouched", async () => {
            const hiker = await loginAs(NEW_HIKER);
            await hiker.post(RESERVATIONS_URL).send({ date: tomorrow, slot: "13:00", partySize: 4 });

            expect((await slotAt(tomorrow, "12:00"))?.available_seats).toBe(7);
            expect((await slotAt(tomorrow, "19:30"))?.available_seats).toBe(12);
        });
    });

    describe("rules that cross layers", () => {
        it("saves nothing when the capacity check fails", async () => {
            const mario = await loginAs(MARIO);
            const bookings = countRows("booking");
            const seatings = countRows("seated_at");

            const res = await mario.post(RESERVATIONS_URL).send({ date: tomorrow, slot: "12:00", partySize: 8 });

            expect(res.status).toBe(409);
            expect(countRows("booking")).toBe(bookings);
            expect(countRows("seated_at")).toBe(seatings);
        });

        it("saves nothing when the same hiker books the same slot twice", async () => {
            const hiker = await loginAs(NEW_HIKER);
            await hiker.post(RESERVATIONS_URL).send({ date: tomorrow, slot: "13:00", partySize: 2 });
            const bookings = countRows("booking");

            const res = await hiker.post(RESERVATIONS_URL).send({ date: tomorrow, slot: "13:00", partySize: 2 });

            expect(res.status).toBe(409);
            expect(countRows("booking")).toBe(bookings);
            expect((await slotAt(tomorrow, "13:00"))?.available_seats).toBe(14);
        });

        it("saves nothing when the request is invalid", async () => {
            const hiker = await loginAs(NEW_HIKER);
            const bookings = countRows("booking");

            const res = await hiker.post(RESERVATIONS_URL).send({ date: tomorrow, slot: "13:00", partySize: 0 });

            expect(res.status).toBe(400);
            expect(countRows("booking")).toBe(bookings);
        });

        it("does not let staff book a table", async () => {
            const employee = await loginAs(EMPLOYEE);
            const bookings = countRows("booking");

            const res = await employee.post(RESERVATIONS_URL).send({ date: tomorrow, slot: "13:00", partySize: 2 });

            expect(res.status).toBe(403);
            expect(countRows("booking")).toBe(bookings);
        });

        it("answers errors with the { code, name, message } shape", async () => {
            const res = await request(app).post(RESERVATIONS_URL).send({});

            expect(res.status).toBe(401);
            expect(res.body).toEqual({
                code: 401,
                name: expect.any(String),
                message: expect.any(String),
            });
        });
    });
});