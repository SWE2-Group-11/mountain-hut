import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "../../app";
import { db } from "../../database/database";
import { dayFromToday, EMPLOYEE, huTime, LAURA, loginAs, MARIO, resetTestDatabase } from "../helpers";

// Integration tests of "Define slot capacity": the real app (routes, validation, controllers, DAOs)
// on the in-memory database, filled with the seed. Nothing is mocked except the outgoing email,
// which would try to reach an SMTP server.
vi.mock("../../notifications/booking-confirmation", () => ({ notifyBookingCreated: vi.fn() }));

const WARDEN = "warden@mountainhut.test";
const SLOTS = "/api/v1/slots";
const CONFIGURATIONS = "/api/v1/slots/configurations";
const RESERVATIONS = "/api/v1/reservations";

// The seed has, tomorrow: 12:00-13:00, 13:00-14:00 and 19:30-21:00; the day after: 12:00-13:00.
// Every seeded slot has four tables with 4, 4, 6 and 2 seats (16 in total).
const TOMORROW = dayFromToday(1);
const AFTER_TOMORROW = dayFromToday(2);
const SEEDED_TABLES = [
    { tableNumber: 1, seats: 4 },
    { tableNumber: 2, seats: 4 },
    { tableNumber: 3, seats: 6 },
    { tableNumber: 4, seats: 2 },
];

// A day with no slot in the seed
const DAY = dayFromToday(10);
const TWO_TABLES = [
    { tableNumber: 1, seats: 4 },
    { tableNumber: 2, seats: 6 },
];
const NEW_SLOT = { date: DAY, startTime: "12:00", endTime: "13:30", tables: TWO_TABLES };

const slotCount = (date: string): number =>
    (db.prepare("SELECT COUNT(*) AS n FROM slot WHERE date = ?").get(date) as { n: number }).n;
const tableCount = (): number =>
    (db.prepare("SELECT COUNT(*) AS n FROM slot_table").get() as { n: number }).n;

/** The tables stored for a slot, as written in the database. */
const storedTables = (date: string, startTime: string) =>
    db
        .prepare(
            `SELECT table_number AS tableNumber, seats FROM slot_table
             WHERE slot_date = ? AND slot_start_time = ? ORDER BY table_number`
        )
        .all(date, startTime);

/** Adds a slot straight to the database (with the same four tables as the seed, unless told otherwise). */
const insertSlot = (date: string, startTime: string, duration: number, tables = SEEDED_TABLES): void => {
    db.prepare("INSERT INTO slot (date, start_time, duration) VALUES (?, ?, ?)").run(date, startTime, duration);
    for (const { tableNumber, seats } of tables) {
        db.prepare(
            "INSERT INTO slot_table (slot_date, slot_start_time, table_number, seats) VALUES (?, ?, ?, ?)"
        ).run(date, startTime, tableNumber, seats);
    }
};

const slotsOfDay = async (date: string) => (await request(app).get(SLOTS).query({ date })).body;

beforeEach(() => resetTestDatabase());

describe("POST /slots - who can define a slot", () => {
    it("rejects a visitor who is not logged in and saves nothing", async () => {
        const res = await request(app).post(SLOTS).send(NEW_SLOT);

        expect(res.status).toBe(401);
        expect(res.body).toMatchObject({ code: 401 });
        expect(slotCount(DAY)).toBe(0);
    });

    it("rejects a hiker and saves nothing", async () => {
        const hiker = await loginAs(MARIO);

        const res = await hiker.post(SLOTS).send(NEW_SLOT);

        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ code: 403 });
        expect(slotCount(DAY)).toBe(0);
    });

    it.each([
        { role: "employee", email: EMPLOYEE },
        { role: "warden", email: WARDEN },
    ])("accepts the $role", async ({ email }) => {
        const staff = await loginAs(email);

        const res = await staff.post(SLOTS).send(NEW_SLOT);

        expect(res.status).toBe(201);
        expect(slotCount(DAY)).toBe(1);
    });
});

describe("POST /slots - a slot with new tables", () => {
    it("answers 201 with the slot, its end time and the total seats", async () => {
        const employee = await loginAs(EMPLOYEE);

        const res = await employee.post(SLOTS).send(NEW_SLOT);

        expect(res.status).toBe(201);
        expect(res.body).toEqual({
            date: DAY,
            startTime: "12:00",
            endTime: "13:30",
            tables: TWO_TABLES,
            totalSeats: 10,
        });
    });

    it("stores the slot, its duration and its tables", async () => {
        const employee = await loginAs(EMPLOYEE);

        await employee.post(SLOTS).send(NEW_SLOT);

        expect(db.prepare("SELECT date, start_time, duration FROM slot WHERE date = ?").all(DAY)).toEqual([
            { date: DAY, start_time: "12:00", duration: 90 },
        ]);
        expect(storedTables(DAY, "12:00")).toEqual(TWO_TABLES);
    });

    it("makes the slot visible to the hikers, with all its seats free", async () => {
        const employee = await loginAs(EMPLOYEE);
        await employee.post(SLOTS).send(NEW_SLOT);

        // The public endpoint of the booking page, no login
        expect(await slotsOfDay(DAY)).toEqual([
            { date: DAY, start_time: "12:00", duration: 90, total_seats: 10, available_seats: 10 },
        ]);
    });

    it("keeps the other slots of the same day untouched", async () => {
        const employee = await loginAs(EMPLOYEE);
        const before = await slotsOfDay(TOMORROW);

        await employee.post(SLOTS).send({ ...NEW_SLOT, date: TOMORROW, startTime: "22:00", endTime: "23:00" });

        const after = await slotsOfDay(TOMORROW);
        expect(after).toEqual([
            ...before,
            { date: TOMORROW, start_time: "22:00", duration: 60, total_seats: 10, available_seats: 10 },
        ]);
    });

    it("accepts a slot with a single table", async () => {
        const employee = await loginAs(EMPLOYEE);

        const res = await employee.post(SLOTS).send({ ...NEW_SLOT, tables: [{ tableNumber: 7, seats: 12 }] });

        expect(res.status).toBe(201);
        expect(res.body.totalSeats).toBe(12);
        expect(storedTables(DAY, "12:00")).toEqual([{ tableNumber: 7, seats: 12 }]);
    });

    it("lists the tables by table number when the hikers' side reads them back", async () => {
        const employee = await loginAs(EMPLOYEE);

        await employee.post(SLOTS).send({
            ...NEW_SLOT,
            tables: [
                { tableNumber: 3, seats: 2 },
                { tableNumber: 1, seats: 4 },
            ],
        });

        const res = await employee.get(CONFIGURATIONS).query({ from: DAY, to: DAY });
        expect(res.body[0].tables).toEqual([
            { tableNumber: 1, seats: 4 },
            { tableNumber: 3, seats: 2 },
        ]);
    });
});

describe("POST /slots - a slot that copies the tables of an existing one (copyFrom)", () => {
    const COPY = { date: DAY, startTime: "19:00", endTime: "20:30", copyFrom: { date: TOMORROW, startTime: "12:00" } };

    it("answers 201 with the same tables as the slot it copies", async () => {
        const employee = await loginAs(EMPLOYEE);

        const res = await employee.post(SLOTS).send(COPY);

        expect(res.status).toBe(201);
        expect(res.body).toEqual({
            date: DAY,
            startTime: "19:00",
            endTime: "20:30",
            tables: SEEDED_TABLES,
            totalSeats: 16,
        });
    });

    it("takes the duration from the request, not from the copied slot", async () => {
        const employee = await loginAs(EMPLOYEE);

        await employee.post(SLOTS).send(COPY); // the copied slot lasts 60 minutes, the new one 90

        expect(db.prepare("SELECT duration FROM slot WHERE date = ? AND start_time = ?").get(DAY, "19:00")).toEqual({
            duration: 90,
        });
    });

    it("gives the new slot its own tables and leaves the copied slot as it was", async () => {
        const employee = await loginAs(EMPLOYEE);
        const tablesBefore = tableCount();

        await employee.post(SLOTS).send(COPY);

        expect(tableCount()).toBe(tablesBefore + 4);
        expect(storedTables(DAY, "19:00")).toEqual(SEEDED_TABLES);
        expect(storedTables(TOMORROW, "12:00")).toEqual(SEEDED_TABLES);
    });

    it("can copy a slot that was created through the API", async () => {
        const employee = await loginAs(EMPLOYEE);
        await employee.post(SLOTS).send(NEW_SLOT);

        const res = await employee.post(SLOTS).send({
            date: dayFromToday(11),
            startTime: "12:00",
            endTime: "13:00",
            copyFrom: { date: DAY, startTime: "12:00" },
        });

        expect(res.status).toBe(201);
        expect(res.body.tables).toEqual(TWO_TABLES);
    });

    it("answers 404 when the slot to copy does not exist and saves nothing", async () => {
        const employee = await loginAs(EMPLOYEE);

        const res = await employee.post(SLOTS).send({ ...COPY, copyFrom: { date: DAY, startTime: "08:00" } });

        expect(res.status).toBe(404);
        expect(res.body).toMatchObject({ code: 404, message: expect.any(String) });
        expect(slotCount(DAY)).toBe(0);
    });

    it("answers 400 when the slot to copy has no tables and saves nothing", async () => {
        const employee = await loginAs(EMPLOYEE);
        insertSlot(dayFromToday(12), "10:00", 60, []);

        const res = await employee.post(SLOTS).send({ ...COPY, copyFrom: { date: dayFromToday(12), startTime: "10:00" } });

        expect(res.status).toBe(400);
        expect(res.body).toMatchObject({ code: 400, message: expect.stringContaining("no tables") });
        expect(slotCount(DAY)).toBe(0);
    });
});

describe("POST /slots - invalid requests", () => {
    it.each([
        { label: "a missing date", body: { ...NEW_SLOT, date: undefined } },
        { label: "a date in the wrong format", body: { ...NEW_SLOT, date: "10/12/2030" } },
        { label: "a date that does not exist", body: { ...NEW_SLOT, date: "2030-02-30" } },
        { label: "a missing start time", body: { ...NEW_SLOT, startTime: undefined } },
        { label: "a start time that is not a time", body: { ...NEW_SLOT, startTime: "25:00" } },
        { label: "a missing end time", body: { ...NEW_SLOT, endTime: undefined } },
        { label: "an end time equal to the start time", body: { ...NEW_SLOT, endTime: "12:00" } },
        { label: "an end time before the start time", body: { ...NEW_SLOT, endTime: "11:00" } },
        { label: "an empty list of tables", body: { ...NEW_SLOT, tables: [] } },
        { label: "a table without seats", body: { ...NEW_SLOT, tables: [{ tableNumber: 1 }] } },
        { label: "a table with 0 seats", body: { ...NEW_SLOT, tables: [{ tableNumber: 1, seats: 0 }] } },
        { label: "a table with negative seats", body: { ...NEW_SLOT, tables: [{ tableNumber: 1, seats: -4 }] } },
        { label: "a table number of 0", body: { ...NEW_SLOT, tables: [{ tableNumber: 0, seats: 4 }] } },
        { label: "a decimal table number", body: { ...NEW_SLOT, tables: [{ tableNumber: 1.5, seats: 4 }] } },
        { label: "seats sent as text", body: { ...NEW_SLOT, tables: [{ tableNumber: 1, seats: "4" }] } },
        {
            label: "the same table number twice",
            body: {
                ...NEW_SLOT,
                tables: [
                    { tableNumber: 1, seats: 4 },
                    { tableNumber: 1, seats: 6 },
                ],
            },
        },
        {
            label: "both tables and copyFrom",
            body: { ...NEW_SLOT, copyFrom: { date: TOMORROW, startTime: "12:00" } },
        },
        { label: "neither tables nor copyFrom", body: { ...NEW_SLOT, tables: undefined } },
        {
            label: "a copyFrom without a start time",
            body: { ...NEW_SLOT, tables: undefined, copyFrom: { date: TOMORROW } },
        },
    ])("answers 400 with the error format and saves nothing for $label", async ({ body }) => {
        const employee = await loginAs(EMPLOYEE);
        const tablesBefore = tableCount();

        const res = await employee.post(SLOTS).send(body);

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ code: 400, name: expect.any(String), message: expect.any(String) });
        expect(slotCount(DAY)).toBe(0);
        expect(tableCount()).toBe(tablesBefore);
    });
});

describe("POST /slots - slots of the same day cannot overlap", () => {
    // The seeded slot of the day after tomorrow runs from 12:00 to 13:00
    it.each([
        { label: "the same time", startTime: "12:00", endTime: "13:00" },
        { label: "a start inside the existing slot", startTime: "12:30", endTime: "13:30" },
        { label: "an end inside the existing slot", startTime: "11:30", endTime: "12:30" },
        { label: "a time fully inside the existing slot", startTime: "12:15", endTime: "12:45" },
        { label: "a time that contains the existing slot", startTime: "11:00", endTime: "14:00" },
    ])("answers 409 for $label and saves nothing", async ({ startTime, endTime }) => {
        const employee = await loginAs(EMPLOYEE);
        const tablesBefore = tableCount();

        const res = await employee.post(SLOTS).send({ ...NEW_SLOT, date: AFTER_TOMORROW, startTime, endTime });

        expect(res.status).toBe(409);
        expect(res.body).toEqual({ code: 409, name: expect.any(String), message: expect.stringContaining("overlaps") });
        expect(slotCount(AFTER_TOMORROW)).toBe(1);
        expect(tableCount()).toBe(tablesBefore); // no table of the refused slot is left behind
    });

    it.each([
        { label: "right before", startTime: "11:00", endTime: "12:00" },
        { label: "right after", startTime: "13:00", endTime: "14:00" },
        { label: "well after", startTime: "19:00", endTime: "21:00" },
    ])("accepts a slot that starts or ends where the existing one does ($label)", async ({ startTime, endTime }) => {
        const employee = await loginAs(EMPLOYEE);

        const res = await employee.post(SLOTS).send({ ...NEW_SLOT, date: AFTER_TOMORROW, startTime, endTime });

        expect(res.status).toBe(201);
        expect(slotCount(AFTER_TOMORROW)).toBe(2);
    });

    it("accepts the same time on another day", async () => {
        const employee = await loginAs(EMPLOYEE);

        const res = await employee.post(SLOTS).send({ ...NEW_SLOT, date: dayFromToday(3), startTime: "12:00", endTime: "13:00" });

        expect(res.status).toBe(201);
    });

    it("applies the rule to a slot that was created a moment ago", async () => {
        const employee = await loginAs(EMPLOYEE);
        await employee.post(SLOTS).send({ ...NEW_SLOT, startTime: "12:00", endTime: "13:00" });

        const overlapping = await employee.post(SLOTS).send({ ...NEW_SLOT, startTime: "12:30", endTime: "13:30" });
        const touching = await employee.post(SLOTS).send({ ...NEW_SLOT, startTime: "13:00", endTime: "14:00" });

        expect(overlapping.status).toBe(409);
        expect(touching.status).toBe(201);
        expect((await slotsOfDay(DAY)).map((s: { start_time: string }) => s.start_time)).toEqual(["12:00", "13:00"]);
    });

    it("also applies it when the new slot copies the tables of another one", async () => {
        const employee = await loginAs(EMPLOYEE);

        const res = await employee.post(SLOTS).send({
            date: TOMORROW,
            startTime: "12:30",
            endTime: "13:30",
            copyFrom: { date: AFTER_TOMORROW, startTime: "12:00" },
        });

        expect(res.status).toBe(409);
        expect(slotCount(TOMORROW)).toBe(3);
    });
});

describe("GET /slots/configurations - the setups that can be reused", () => {
    it("rejects a visitor who is not logged in", async () => {
        const res = await request(app).get(CONFIGURATIONS);

        expect(res.status).toBe(401);
        expect(res.body).toMatchObject({ code: 401 });
    });

    it("rejects a hiker", async () => {
        const hiker = await loginAs(LAURA);

        const res = await hiker.get(CONFIGURATIONS);

        expect(res.status).toBe(403);
    });

    it.each([
        { role: "employee", email: EMPLOYEE },
        { role: "warden", email: WARDEN },
    ])("answers the $role with the seeded slots, the most recent first", async ({ email }) => {
        const staff = await loginAs(email);

        const res = await staff.get(CONFIGURATIONS);

        expect(res.status).toBe(200);
        expect(res.body.map((c: { date: string; startTime: string }) => `${c.date} ${c.startTime}`)).toEqual([
            `${AFTER_TOMORROW} 12:00`,
            `${TOMORROW} 19:30`,
            `${TOMORROW} 13:00`,
            `${TOMORROW} 12:00`,
        ]);
    });

    it("describes each slot with its end time, its tables and its total seats", async () => {
        const employee = await loginAs(EMPLOYEE);

        const res = await employee.get(CONFIGURATIONS);

        expect(res.body[0]).toEqual({
            date: AFTER_TOMORROW,
            startTime: "12:00",
            endTime: "13:00",
            tables: SEEDED_TABLES,
            totalSeats: 16,
        });
        expect(res.body[1]).toMatchObject({ startTime: "19:30", endTime: "21:00" });
    });

    it("includes a slot as soon as it has been created", async () => {
        const employee = await loginAs(EMPLOYEE);
        await employee.post(SLOTS).send(NEW_SLOT);

        const res = await employee.get(CONFIGURATIONS);

        expect(res.body).toHaveLength(5);
        expect(res.body[0]).toEqual({ date: DAY, startTime: "12:00", endTime: "13:30", tables: TWO_TABLES, totalSeats: 10 });
    });

    it("lists a slot even when nobody can book it any more", async () => {
        const employee = await loginAs(EMPLOYEE);
        const hiker = await loginAs(MARIO);
        await employee.post(SLOTS).send({ ...NEW_SLOT, tables: [{ tableNumber: 1, seats: 2 }] });
        await hiker.post(RESERVATIONS).send({ date: DAY, slot: "12:00", partySize: 2 });
        expect(await slotsOfDay(DAY)).toEqual([]); // full: hidden from the hikers

        const res = await employee.get(CONFIGURATIONS).query({ from: DAY, to: DAY });

        expect(res.body).toHaveLength(1);
        expect(res.body[0]).toMatchObject({ date: DAY, totalSeats: 2 });
    });

    describe("limit and date range", () => {
        it("returns at most 20 setups when no limit is given", async () => {
            const employee = await loginAs(EMPLOYEE);
            for (let i = 0; i < 22; i++) insertSlot(dayFromToday(20 + i), "12:00", 60);

            const res = await employee.get(CONFIGURATIONS);

            expect(res.body).toHaveLength(20);
            expect(res.body[0].date).toBe(dayFromToday(41)); // the most recent ones
        });

        it("returns as many setups as asked, up to 100", async () => {
            const employee = await loginAs(EMPLOYEE);
            for (let i = 0; i < 22; i++) insertSlot(dayFromToday(20 + i), "12:00", 60);

            expect((await employee.get(CONFIGURATIONS).query({ limit: 2 })).body).toHaveLength(2);
            expect((await employee.get(CONFIGURATIONS).query({ limit: 100 })).body).toHaveLength(26);
        });

        it.each([
            { label: "from the day after tomorrow", query: { from: AFTER_TOMORROW }, count: 1 },
            { label: "up to tomorrow", query: { to: TOMORROW }, count: 3 },
            { label: "for tomorrow only", query: { from: TOMORROW, to: TOMORROW }, count: 3 },
            { label: "for the two seeded days", query: { from: TOMORROW, to: AFTER_TOMORROW }, count: 4 },
            { label: "in a period without slots", query: { from: dayFromToday(30), to: dayFromToday(40) }, count: 0 },
        ])("keeps only the slots $label", async ({ query, count }) => {
            const employee = await loginAs(EMPLOYEE);

            const res = await employee.get(CONFIGURATIONS).query(query);

            expect(res.status).toBe(200);
            expect(res.body).toHaveLength(count);
        });

        it.each([
            { label: "a limit of 0", query: { limit: 0 } },
            { label: "a limit above 100", query: { limit: 101 } },
            { label: "a limit that is not a number", query: { limit: "many" } },
            { label: "a start date that is not a date", query: { from: "soon" } },
            { label: "an end date that does not exist", query: { to: "2030-02-30" } },
            { label: "a start date after the end date", query: { from: AFTER_TOMORROW, to: TOMORROW } },
        ])("answers 400 for $label", async ({ query }) => {
            const employee = await loginAs(EMPLOYEE);

            const res = await employee.get(CONFIGURATIONS).query(query);

            expect(res.status).toBe(400);
            expect(res.body).toEqual({ code: 400, name: expect.any(String), message: expect.any(String) });
        });
    });
});

describe("from the slot an employee defines to the booking a hiker makes", () => {
    it("a day without slots cannot be booked until the employee defines one", async () => {
        const employee = await loginAs(EMPLOYEE);
        const hiker = await loginAs(MARIO);
        const booking = { date: DAY, slot: "12:00", partySize: 2 };

        const before = await hiker.post(RESERVATIONS).send(booking);
        await employee.post(SLOTS).send(NEW_SLOT);
        const after = await hiker.post(RESERVATIONS).send(booking);

        expect(before.status).toBe(400);
        expect(after.status).toBe(201);
    });

    it("the seats of the tables the employee typed are the seats the hikers can take", async () => {
        const employee = await loginAs(EMPLOYEE);
        const hiker = await loginAs(MARIO);
        await employee.post(SLOTS).send(NEW_SLOT); // tables with 4 and 6 seats

        const booked = await hiker.post(RESERVATIONS).send({ date: DAY, slot: "12:00", partySize: 7 });

        expect(booked.status).toBe(201);
        const seated = booked.body.seatings as Array<{ table_number: number; assigned_seats: number }>;
        expect(seated.reduce((sum, s) => sum + s.assigned_seats, 0)).toBe(7);
        expect(seated.every((s) => [1, 2].includes(s.table_number))).toBe(true);
        expect(await slotsOfDay(DAY)).toEqual([
            { date: DAY, start_time: "12:00", duration: 90, total_seats: 10, available_seats: 3 },
        ]);
    });

    it("refuses a party larger than the capacity the employee defined and books nothing", async () => {
        const employee = await loginAs(EMPLOYEE);
        const hiker = await loginAs(MARIO);
        await employee.post(SLOTS).send(NEW_SLOT); // 10 seats

        const res = await hiker.post(RESERVATIONS).send({ date: DAY, slot: "12:00", partySize: 11 });

        expect(res.status).toBe(409);
        expect(res.body).toMatchObject({ code: 409 });
        expect((await slotsOfDay(DAY))[0].available_seats).toBe(10);
    });

    it("the last seats can be booked and the full slot then disappears from the booking page", async () => {
        const employee = await loginAs(EMPLOYEE);
        const mario = await loginAs(MARIO);
        const laura = await loginAs(LAURA);
        await employee.post(SLOTS).send(NEW_SLOT);

        const first = await mario.post(RESERVATIONS).send({ date: DAY, slot: "12:00", partySize: 6 });
        const second = await laura.post(RESERVATIONS).send({ date: DAY, slot: "12:00", partySize: 4 });
        const third = await laura.post(RESERVATIONS).send({ date: DAY, slot: "12:00", partySize: 1 });

        expect(first.status).toBe(201);
        expect(second.status).toBe(201);
        expect(third.status).toBe(409);
        expect(await slotsOfDay(DAY)).toEqual([]);
    });

    it("a slot that copies the tables of another one has the same capacity", async () => {
        const employee = await loginAs(EMPLOYEE);
        const hiker = await loginAs(MARIO);
        await employee.post(SLOTS).send({
            date: DAY,
            startTime: "19:00",
            endTime: "20:30",
            copyFrom: { date: TOMORROW, startTime: "12:00" },
        });

        const tooBig = await hiker.post(RESERVATIONS).send({ date: DAY, slot: "19:00", partySize: 17 });
        const full = await hiker.post(RESERVATIONS).send({ date: DAY, slot: "19:00", partySize: 16 });

        expect(tooBig.status).toBe(409);
        expect(full.status).toBe(201);
        expect(await slotsOfDay(DAY)).toEqual([]);
    });

    it("defining a new slot does not change the availability of the existing ones", async () => {
        const employee = await loginAs(EMPLOYEE);
        const before = await slotsOfDay(TOMORROW);

        await employee.post(SLOTS).send({ ...NEW_SLOT, date: dayFromToday(4) });

        expect(await slotsOfDay(TOMORROW)).toEqual(before);
    });

    it("a slot refused for overlapping cannot be booked", async () => {
        const employee = await loginAs(EMPLOYEE);
        const hiker = await loginAs(MARIO);

        const refused = await employee.post(SLOTS).send({ ...NEW_SLOT, date: AFTER_TOMORROW, startTime: "12:30", endTime: "13:30" });
        const booked = await hiker.post(RESERVATIONS).send({ date: AFTER_TOMORROW, slot: "12:30", partySize: 2 });

        expect(refused.status).toBe(409);
        expect(booked.status).toBe(400);
    });
});

describe("a slot the employee defines, seen through the availability check", () => {
    const AVAILABILITY = "/api/v1/slots/availability";

    it("proposes tables from the capacity the employee defined", async () => {
        const employee = await loginAs(EMPLOYEE);
        await employee.post(SLOTS).send(NEW_SLOT); // tables with 4 and 6 seats

        const res = await request(app).get(AVAILABILITY).query({ date: DAY, slot: "12:00", partySize: 7 });

        expect(res.status).toBe(200);
        const proposed = res.body.available as Array<{ tableId: number; assignedSeats: number }>;
        expect(proposed.reduce((sum, t) => sum + t.assignedSeats, 0)).toBe(7);
        expect(proposed.every((t) => [1, 2].includes(t.tableId))).toBe(true);
    });

    it("proposes nothing for a party larger than the defined capacity", async () => {
        const employee = await loginAs(EMPLOYEE);
        await employee.post(SLOTS).send(NEW_SLOT); // 10 seats

        const res = await request(app).get(AVAILABILITY).query({ date: DAY, slot: "12:00", partySize: 11 });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ available: [] });
    });

    it("answers 404 for a slot nobody has defined", async () => {
        const res = await request(app).get(AVAILABILITY).query({ date: DAY, slot: "12:00", partySize: 2 });

        expect(res.status).toBe(404);
    });

    it("shrinks the proposal as the seats are booked", async () => {
        const employee = await loginAs(EMPLOYEE);
        const hiker = await loginAs(MARIO);
        await employee.post(SLOTS).send(NEW_SLOT);
        await hiker.post(RESERVATIONS).send({ date: DAY, slot: "12:00", partySize: 7 }); // 3 seats left

        const fits = await request(app).get(AVAILABILITY).query({ date: DAY, slot: "12:00", partySize: 3 });
        const tooBig = await request(app).get(AVAILABILITY).query({ date: DAY, slot: "12:00", partySize: 4 });

        expect(fits.body.available).not.toEqual([]);
        expect(tooBig.body).toEqual({ available: [] });
    });
});

describe("the session of the staff", () => {
    it("a logged-out employee can no longer define a slot", async () => {
        const employee = await loginAs(EMPLOYEE);
        expect((await employee.post(SLOTS).send(NEW_SLOT)).status).toBe(201);

        await employee.delete("/api/v1/session/current");
        const res = await employee.post(SLOTS).send({ ...NEW_SLOT, startTime: "15:00", endTime: "16:00" });

        expect(res.status).toBe(401);
        expect(slotCount(DAY)).toBe(1);
    });

    it("a logged-out employee can no longer read the setups", async () => {
        const employee = await loginAs(EMPLOYEE);

        await employee.delete("/api/v1/session/current");
        const res = await employee.get(CONFIGURATIONS);

        expect(res.status).toBe(401);
    });
});

describe("the booking window and the slots the employee defines", () => {
    // Hikers can book up to 2 hours before a slot starts, so a slot that starts sooner is not offered
    afterEach(() => vi.useRealTimers());

    it("defines a slot that is too close to be booked, which the hikers no longer see", async () => {
        const employee = await loginAs(EMPLOYEE);
        const hiker = await loginAs(MARIO);
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(huTime(DAY, "10:00"));

        const close = await employee.post(SLOTS).send({ ...NEW_SLOT, startTime: "11:00", endTime: "12:00" });
        const far = await employee.post(SLOTS).send({ ...NEW_SLOT, startTime: "13:00", endTime: "14:00" });

        expect(close.status).toBe(201);
        expect(far.status).toBe(201);
        expect((await slotsOfDay(DAY)).map((s: { start_time: string }) => s.start_time)).toEqual(["13:00"]);
        expect((await hiker.post(RESERVATIONS).send({ date: DAY, slot: "11:00", partySize: 2 })).status).toBe(400);
        expect((await hiker.post(RESERVATIONS).send({ date: DAY, slot: "13:00", partySize: 2 })).status).toBe(201);
    });

    it("still lists the slot that is too close among the setups the employee can reuse", async () => {
        const employee = await loginAs(EMPLOYEE);
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(huTime(DAY, "10:00"));
        await employee.post(SLOTS).send({ ...NEW_SLOT, startTime: "11:00", endTime: "12:00" });

        const res = await employee.get(CONFIGURATIONS).query({ from: DAY, to: DAY });

        expect(res.body).toHaveLength(1);
        expect(res.body[0]).toMatchObject({ date: DAY, startTime: "11:00" });
    });
});
