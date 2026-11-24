import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { DateTime } from "luxon";
import { app } from "../../app";
import { db } from "../../database/database";
import { HUT_TIMEZONE } from "../../config/config";
import { EMPLOYEE, huTime, LAURA, loginAs, MARIO, resetTestDatabase } from "../helpers";

// Integration tests of "Repeat weekly schedule": the real app (routes, validation, controller, DAO)
// on the in-memory database, filled with the seed. Nothing is mocked except the outgoing email
vi.mock("../../notifications/booking-confirmation", () => ({ notifyBookingCreated: vi.fn() }));

const WARDEN = "warden@mountainhut.test";
const COPY_WEEK = "/api/v1/slots/copy-week";
const SLOTS = "/api/v1/slots";
const RESERVATIONS = "/api/v1/reservations";

/** Monday (YYYY-MM-DD) of the hut week `offset` weeks from the current one. */
const week = (offset: number): string =>
    DateTime.now().setZone(HUT_TIMEZONE).startOf("week").plus({ weeks: offset }).toISODate()!;

/** The day `days` days after the given date (YYYY-MM-DD). */
const dayOf = (date: string, days: number): string => DateTime.fromISO(date).plus({ days }).toISODate()!;

// The seed only has slots tomorrow and the day after, so they fall in week(0) or week(1).
// The source week is last week: copying a past week forward is the usual case.
const SOURCE = week(-1);
const TARGET = week(5);
const OTHER_TARGET = week(6);

const TWO_TABLES = [
    { tableNumber: 1, seats: 4 },
    { tableNumber: 2, seats: 6 },
];
const ONE_TABLE = [{ tableNumber: 1, seats: 8 }];

type StoredSlot = { day: number; start_time: string; duration: number };
type StoredTable = { day: number; start_time: string; table_number: number; seats: number };

/** Adds a slot with its tables straight to the database. */
const insertSlot = (date: string, startTime: string, duration: number, tables = TWO_TABLES): void => {
    db.prepare("INSERT INTO slot (date, start_time, duration) VALUES (?, ?, ?)").run(date, startTime, duration);
    for (const { tableNumber, seats } of tables) {
        db.prepare(
            "INSERT INTO slot_table (slot_date, slot_start_time, table_number, seats) VALUES (?, ?, ?, ?)"
        ).run(date, startTime, tableNumber, seats);
    }
};

/** Adds a booking straight to the database, seated at one table of a slot. */
const insertBooking = (date: string, startTime: string, tableNumber: number, seats: number): void => {
    const { lastInsertRowid } = db.prepare("INSERT INTO booking (hiker_id) VALUES (NULL)").run();
    db.prepare(
        `INSERT INTO seated_at (booking_id, slot_date, slot_start_time, table_number, assigned_seats)
         VALUES (?, ?, ?, ?, ?)`
    ).run(lastInsertRowid, date, startTime, tableNumber, seats);
};

/** The source schedule: Monday lunch, Wednesday dinner and a Sunday breakfast at the end of the week. */
const insertSourceWeek = (): void => {
    insertSlot(SOURCE, "12:00", 60);
    insertSlot(dayOf(SOURCE, 2), "19:30", 90);
    insertSlot(dayOf(SOURCE, 6), "08:00", 30, ONE_TABLE);
};

const SOURCE_SLOTS: StoredSlot[] = [
    { day: 0, start_time: "12:00", duration: 60 },
    { day: 2, start_time: "19:30", duration: 90 },
    { day: 6, start_time: "08:00", duration: 30 },
];
const SOURCE_TABLES: StoredTable[] = [
    { day: 0, start_time: "12:00", table_number: 1, seats: 4 },
    { day: 0, start_time: "12:00", table_number: 2, seats: 6 },
    { day: 2, start_time: "19:30", table_number: 1, seats: 4 },
    { day: 2, start_time: "19:30", table_number: 2, seats: 6 },
    { day: 6, start_time: "08:00", table_number: 1, seats: 8 },
];

/** The slots of a week as stored, with the day as an offset from its Monday. */
const slotsOfWeek = (weekStart: string): StoredSlot[] =>
    db.prepare<{ weekStart: string }, StoredSlot>(
        `SELECT CAST(julianday(date) - julianday(@weekStart) AS INTEGER) AS day, start_time, duration
         FROM slot WHERE date >= @weekStart AND date < date(@weekStart, '+7 days')
         ORDER BY date, start_time`
    ).all({ weekStart });

/** The tables of a week as stored, with the day as an offset from its Monday. */
const tablesOfWeek = (weekStart: string): StoredTable[] =>
    db.prepare<{ weekStart: string }, StoredTable>(
        `SELECT CAST(julianday(slot_date) - julianday(@weekStart) AS INTEGER) AS day,
                slot_start_time AS start_time, table_number, seats
         FROM slot_table WHERE slot_date >= @weekStart AND slot_date < date(@weekStart, '+7 days')
         ORDER BY slot_date, slot_start_time, table_number`
    ).all({ weekStart });

/** A snapshot of every schedule and booking row, to prove that a refused request changed nothing. */
const snapshot = () => ({
    slots: db.prepare<[], { date: string }>("SELECT * FROM slot ORDER BY date, start_time").all(),
    tables: db.prepare<[], { slot_date: string }>(
        "SELECT * FROM slot_table ORDER BY slot_date, slot_start_time, table_number"
    ).all(),
    seats: db.prepare("SELECT * FROM seated_at ORDER BY booking_id, slot_date, slot_start_time, table_number").all(),
    bookings: db.prepare("SELECT * FROM booking ORDER BY id").all(),
});

const COPY = { sourceWeekStart: SOURCE, targetWeekStarts: [TARGET] };

beforeEach(() => resetTestDatabase());

describe("POST /slots/copy-week - who can repeat a weekly schedule", () => {
    beforeEach(() => insertSourceWeek());

    it("rejects a visitor who is not logged in and copies nothing", async () => {
        const res = await request(app).post(COPY_WEEK).send(COPY);

        expect(res.status).toBe(401);
        expect(res.body).toMatchObject({ code: 401 });
        expect(slotsOfWeek(TARGET)).toEqual([]);
    });

    it("rejects a hiker and copies nothing", async () => {
        const hiker = await loginAs(MARIO);

        const res = await hiker.post(COPY_WEEK).send(COPY);

        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ code: 403 });
        expect(slotsOfWeek(TARGET)).toEqual([]);
    });

    it.each([
        { role: "employee", email: EMPLOYEE },
        { role: "warden", email: WARDEN },
    ])("accepts the $role", async ({ email }) => {
        const staff = await loginAs(email);

        const res = await staff.post(COPY_WEEK).send(COPY);

        expect(res.status).toBe(201);
        expect(slotsOfWeek(TARGET)).toEqual(SOURCE_SLOTS);
    });
});

describe("POST /slots/copy-week - copying a week", () => {
    beforeEach(() => insertSourceWeek());

    it("answers 201 with the source week, the target weeks and the slots copied into each", async () => {
        const employee = await loginAs(EMPLOYEE);

        const res = await employee.post(COPY_WEEK).send({ sourceWeekStart: SOURCE, targetWeekStarts: [TARGET, OTHER_TARGET] });

        expect(res.status).toBe(201);
        expect(res.body).toEqual({ sourceWeekStart: SOURCE, targetWeekStarts: [TARGET, OTHER_TARGET], slotsPerWeek: 3 });
    });

    it("copies every slot on the same weekday, with the same start time, duration and tables", async () => {
        const employee = await loginAs(EMPLOYEE);

        await employee.post(COPY_WEEK).send({ sourceWeekStart: SOURCE, targetWeekStarts: [TARGET, OTHER_TARGET] });

        for (const target of [TARGET, OTHER_TARGET]) {
            expect(slotsOfWeek(target)).toEqual(SOURCE_SLOTS);
            expect(tablesOfWeek(target)).toEqual(SOURCE_TABLES);
        }
    });

    it("copies into weeks that are not consecutive, leaving the weeks in between empty", async () => {
        const employee = await loginAs(EMPLOYEE);

        const res = await employee.post(COPY_WEEK).send({ sourceWeekStart: SOURCE, targetWeekStarts: [week(3), week(8)] });

        expect(res.status).toBe(201);
        expect(slotsOfWeek(week(3))).toEqual(SOURCE_SLOTS);
        expect(slotsOfWeek(week(8))).toEqual(SOURCE_SLOTS);
        for (const between of [week(4), week(5), week(6), week(7)]) {
            expect(slotsOfWeek(between)).toEqual([]);
        }
    });

    it("copies only the slots from Monday to Sunday of the source week", async () => {
        const employee = await loginAs(EMPLOYEE);
        // The Sunday before and the Monday after the source week
        insertSlot(dayOf(SOURCE, -1), "18:00", 60);
        insertSlot(dayOf(SOURCE, 7), "07:00", 60);

        const res = await employee.post(COPY_WEEK).send(COPY);

        expect(res.body.slotsPerWeek).toBe(3);
        expect(slotsOfWeek(TARGET)).toEqual(SOURCE_SLOTS);
        expect(db.prepare("SELECT COUNT(*) AS n FROM slot WHERE date IN (?, ?)")
            .get(dayOf(TARGET, -1), dayOf(TARGET, 7))).toEqual({ n: 0 });
    });

    it("leaves the source week and its bookings untouched", async () => {
        const employee = await loginAs(EMPLOYEE);
        insertBooking(SOURCE, "12:00", 2, 5);
        const seatsBefore = db.prepare("SELECT * FROM seated_at ORDER BY booking_id").all();

        await employee.post(COPY_WEEK).send(COPY);

        expect(slotsOfWeek(SOURCE)).toEqual(SOURCE_SLOTS);
        expect(tablesOfWeek(SOURCE)).toEqual(SOURCE_TABLES);
        expect(db.prepare("SELECT * FROM seated_at ORDER BY booking_id").all()).toEqual(seatsBefore);
    });

    it("never copies the bookings: every seat of the copied slots is free for the hikers", async () => {
        const employee = await loginAs(EMPLOYEE);
        insertBooking(SOURCE, "12:00", 2, 5);
        insertBooking(dayOf(SOURCE, 2), "19:30", 1, 4);

        await employee.post(COPY_WEEK).send(COPY);

        expect(snapshot().seats.length).toBe(5 + 2); // the 5 seeded seatings and the 2 added to the source
        // The public endpoint of the booking page, no login
        expect((await request(app).get(SLOTS).query({ date: TARGET })).body).toEqual([
            { date: TARGET, start_time: "12:00", duration: 60, total_seats: 10, available_seats: 10, menu: null },
        ]);
    });

    it("makes the copied slots bookable by a hiker", async () => {
        const employee = await loginAs(EMPLOYEE);
        const hiker = await loginAs(MARIO);
        const wednesday = dayOf(TARGET, 2);
        await employee.post(COPY_WEEK).send(COPY);

        const res = await hiker.post(RESERVATIONS).send({ date: wednesday, slot: "19:30", partySize: 6 });

        expect(res.status).toBe(201);
        expect((await request(app).get(SLOTS).query({ date: wednesday })).body).toEqual([
            { date: wednesday, start_time: "19:30", duration: 90, total_seats: 10, available_seats: 4, menu: null },
        ]);
    });

    it("leaves the seeded slots and bookings of the other weeks untouched", async () => {
        const employee = await loginAs(EMPLOYEE);
        const before = snapshot();

        await employee.post(COPY_WEEK).send(COPY);

        const after = snapshot();
        const outsideTarget = (date: string) => date < TARGET || date >= dayOf(TARGET, 7);
        expect(after.slots.filter((slot) => outsideTarget(slot.date))).toEqual(before.slots);
        expect(after.tables.filter((table) => outsideTarget(table.slot_date))).toEqual(before.tables);
        expect(after.seats).toEqual(before.seats);
        expect(after.bookings).toEqual(before.bookings);
    });

    it("lets a copied slot be adjusted on its own without changing the source or the other copies", async () => {
        const employee = await loginAs(EMPLOYEE);
        await employee.post(COPY_WEEK).send({ sourceWeekStart: SOURCE, targetWeekStarts: [TARGET, OTHER_TARGET] });

        // Adding a slot to one copied week is a change of that week only
        const res = await employee.post(SLOTS).send({
            date: dayOf(TARGET, 4), startTime: "12:00", endTime: "13:00", tables: ONE_TABLE,
        });

        expect(res.status).toBe(201);
        expect(slotsOfWeek(TARGET)).toHaveLength(4);
        expect(slotsOfWeek(OTHER_TARGET)).toEqual(SOURCE_SLOTS);
        expect(slotsOfWeek(SOURCE)).toEqual(SOURCE_SLOTS);
    });
});

describe("POST /slots/copy-week - a target week that already has a schedule", () => {
    beforeEach(() => insertSourceWeek());

    it("replaces the whole schedule of a target week without bookings", async () => {
        const employee = await loginAs(EMPLOYEE);
        // Same time as a source slot but other tables, and a slot the source does not have
        insertSlot(TARGET, "12:00", 120, ONE_TABLE);
        insertSlot(dayOf(TARGET, 4), "13:00", 60, [{ tableNumber: 7, seats: 2 }]);

        const res = await employee.post(COPY_WEEK).send(COPY);

        expect(res.status).toBe(201);
        expect(slotsOfWeek(TARGET)).toEqual(SOURCE_SLOTS);
        expect(tablesOfWeek(TARGET)).toEqual(SOURCE_TABLES);
    });

    it("can copy the same source again into a week that already received it", async () => {
        const employee = await loginAs(EMPLOYEE);
        await employee.post(COPY_WEEK).send(COPY);

        const res = await employee.post(COPY_WEEK).send(COPY);

        expect(res.status).toBe(201);
        expect(slotsOfWeek(TARGET)).toEqual(SOURCE_SLOTS);
        expect(tablesOfWeek(TARGET)).toEqual(SOURCE_TABLES);
    });

    it("answers 409 when a target week has reservations, and copies nothing into any target", async () => {
        const employee = await loginAs(EMPLOYEE);
        const hiker = await loginAs(LAURA);
        // OTHER_TARGET has its own schedule and a reservation made by a hiker; TARGET is empty
        insertSlot(dayOf(OTHER_TARGET, 3), "13:00", 60, ONE_TABLE);
        const booked = await hiker.post(RESERVATIONS).send({ date: dayOf(OTHER_TARGET, 3), slot: "13:00", partySize: 3 });
        expect(booked.status).toBe(201);
        const before = snapshot();

        const res = await employee.post(COPY_WEEK).send({ sourceWeekStart: SOURCE, targetWeekStarts: [TARGET, OTHER_TARGET] });

        expect(res.status).toBe(409);
        expect(res.body).toMatchObject({ code: 409 });
        expect(snapshot()).toEqual(before);
        expect(slotsOfWeek(TARGET)).toEqual([]);
    });

    it("keeps the reservation of the refused target week, which the hiker still sees", async () => {
        const employee = await loginAs(EMPLOYEE);
        const hiker = await loginAs(LAURA);
        insertSlot(dayOf(TARGET, 3), "13:00", 60, ONE_TABLE);
        await hiker.post(RESERVATIONS).send({ date: dayOf(TARGET, 3), slot: "13:00", partySize: 3 });

        await employee.post(COPY_WEEK).send(COPY);

        const mine = await hiker.get(RESERVATIONS);
        expect(mine.body).toEqual(
            expect.arrayContaining([expect.objectContaining({ date: dayOf(TARGET, 3), slot: "13:00", partySize: 3 })])
        );
        expect(slotsOfWeek(TARGET)).toEqual([{ day: 3, start_time: "13:00", duration: 60 }]);
    });

    it("copies into the week once its only reservation has been cancelled", async () => {
        const employee = await loginAs(EMPLOYEE);
        const hiker = await loginAs(LAURA);
        insertSlot(dayOf(TARGET, 3), "13:00", 60, ONE_TABLE);
        const booked = await hiker.post(RESERVATIONS).send({ date: dayOf(TARGET, 3), slot: "13:00", partySize: 3 });
        expect((await employee.post(COPY_WEEK).send(COPY)).status).toBe(409);

        expect((await hiker.delete(`${RESERVATIONS}/${booked.body.id}`)).status).toBeLessThan(300);
        const res = await employee.post(COPY_WEEK).send(COPY);

        expect(res.status).toBe(201);
        expect(slotsOfWeek(TARGET)).toEqual(SOURCE_SLOTS);
    });
});

describe("POST /slots/copy-week - a source week with nothing to copy", () => {
    it("answers 404 and copies nothing, leaving the existing target schedule in place", async () => {
        const employee = await loginAs(EMPLOYEE);
        insertSlot(TARGET, "12:00", 60);
        const before = snapshot();

        const res = await employee.post(COPY_WEEK).send({ sourceWeekStart: week(10), targetWeekStarts: [TARGET] });

        expect(res.status).toBe(404);
        expect(res.body).toMatchObject({ code: 404 });
        expect(snapshot()).toEqual(before);
    });
});

describe("POST /slots/copy-week - invalid requests", () => {
    beforeEach(() => insertSourceWeek());

    it.each([
        { case: "the body is empty", body: {} },
        { case: "the target weeks are missing", body: { sourceWeekStart: SOURCE } },
        { case: "the source week is missing", body: { targetWeekStarts: [TARGET] } },
        { case: "there is no target week", body: { sourceWeekStart: SOURCE, targetWeekStarts: [] } },
        { case: "the target weeks are not a list", body: { sourceWeekStart: SOURCE, targetWeekStarts: TARGET } },
        { case: "the source week is not a Monday", body: { sourceWeekStart: dayOf(SOURCE, 1), targetWeekStarts: [TARGET] } },
        { case: "a target week is not a Monday", body: { sourceWeekStart: SOURCE, targetWeekStarts: [TARGET, dayOf(OTHER_TARGET, 6)] } },
        { case: "a date is not YYYY-MM-DD", body: { sourceWeekStart: SOURCE, targetWeekStarts: [TARGET.split("-").reverse().join("/")] } },
        { case: "a target week is repeated", body: { sourceWeekStart: SOURCE, targetWeekStarts: [TARGET, TARGET] } },
        { case: "the source week is also a target", body: { sourceWeekStart: SOURCE, targetWeekStarts: [TARGET, SOURCE] } },
        {
            case: "there are more than 52 target weeks",
            body: { sourceWeekStart: SOURCE, targetWeekStarts: Array.from({ length: 53 }, (_, i) => week(i + 2)) },
        },
    ])("answers 400 and copies nothing when $case", async ({ body }) => {
        const employee = await loginAs(EMPLOYEE);
        const before = snapshot();

        const res = await employee.post(COPY_WEEK).send(body);

        expect(res.status).toBe(400);
        expect(res.body).toMatchObject({ code: 400 });
        expect(snapshot()).toEqual(before);
    });

    it("accepts exactly 52 target weeks", async () => {
        const employee = await loginAs(EMPLOYEE);
        const targets = Array.from({ length: 52 }, (_, i) => week(i + 2));

        const res = await employee.post(COPY_WEEK).send({ sourceWeekStart: SOURCE, targetWeekStarts: targets });

        expect(res.status).toBe(201);
        expect(res.body.targetWeekStarts).toEqual(targets);
        expect(slotsOfWeek(targets[51])).toEqual(SOURCE_SLOTS);
    });

    it.each([
        { case: "the current week", target: week(0) },
        { case: "a past week", target: week(-3) },
    ])("answers 400 for $case as a target, and copies into none of the targets", async ({ target }) => {
        const employee = await loginAs(EMPLOYEE);
        const before = snapshot();

        const res = await employee.post(COPY_WEEK).send({ sourceWeekStart: SOURCE, targetWeekStarts: [TARGET, target] });

        expect(res.status).toBe(400);
        expect(res.body).toMatchObject({ code: 400 });
        expect(snapshot()).toEqual(before);
    });
});

describe("POST /slots/copy-week - where the current week ends (Europe/Rome)", () => {
    // Fixed dates far from the seed, which is relative to the real "today"
    const SOURCE_MONDAY = "2030-03-04";
    const NEXT_MONDAY = "2030-03-11";
    const FOLLOWING_MONDAY = "2030-03-18";

    beforeEach(() => insertSlot(SOURCE_MONDAY, "12:00", 60));
    afterEach(() => vi.useRealTimers());

    it("accepts next week on the last minutes of Sunday in the hut", async () => {
        const employee = await loginAs(EMPLOYEE);
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(huTime("2030-03-10", "23:50"));

        const res = await employee.post(COPY_WEEK).send({ sourceWeekStart: SOURCE_MONDAY, targetWeekStarts: [NEXT_MONDAY] });

        expect(res.status).toBe(201);
        expect(slotsOfWeek(NEXT_MONDAY)).toEqual([{ day: 0, start_time: "12:00", duration: 60 }]);
    });

    it("refuses the week that has just started on Monday in the hut, but accepts the following one", async () => {
        const employee = await loginAs(EMPLOYEE);
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(huTime(NEXT_MONDAY, "00:10"));

        const started = await employee.post(COPY_WEEK).send({ sourceWeekStart: SOURCE_MONDAY, targetWeekStarts: [NEXT_MONDAY] });
        const following = await employee.post(COPY_WEEK).send({ sourceWeekStart: SOURCE_MONDAY, targetWeekStarts: [FOLLOWING_MONDAY] });

        expect(started.status).toBe(400);
        expect(slotsOfWeek(NEXT_MONDAY)).toEqual([]);
        expect(following.status).toBe(201);
        expect(slotsOfWeek(FOLLOWING_MONDAY)).toEqual([{ day: 0, start_time: "12:00", duration: 60 }]);
    });
});
