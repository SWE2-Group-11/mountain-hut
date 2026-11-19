import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "../../app";
import { db } from "../../database/database";
import { notifyBookingCreated } from "../../notifications/booking-confirmation";
import {
    resetTestDatabase, dayFromToday, huTime, loginAs, createHikerWithoutBookings,
    MARIO, EMPLOYEE, NEW_HIKER,
} from "../helpers";

/*
 * MH-07 Reserve for a hiker - integration tests.
 * The HTTP app, sessions, validation, controllers, DAOs and SQLite are real.
 * Only the outgoing confirmation notification is mocked, as in the other
 * integration tests. Staff bookings must not schedule that notification.
 *
 * Every test starts from the seed: tomorrow at 13:00 is empty, with tables
 * T1 = 4, T2 = 4, T3 = 6 and T4 = 2 (16 seats in total).
 */
vi.mock("../../notifications/booking-confirmation", () => ({ notifyBookingCreated: vi.fn() }));

const RESERVATIONS_URL = "/api/v1/reservations";
const SLOTS_URL = "/api/v1/slots";
const SESSION_URL = "/api/v1/session";
const WARDEN = "warden@mountainhut.test";
const EMAIL = "story7@mountainhut.test";
const REGISTERED = {
    mode: "registered",
    fullname: "Anna Test",
    mobile_number: "+39 333 7654321",
    email: EMAIL,
};

type Seating = { table_number: number; assigned_seats: number };

const accountId = (email: string): number =>
    db.prepare<[string], { id: number }>("SELECT id FROM account WHERE email = ?").get(email)!.id;

const storedSeatings = (bookingId: number): Seating[] =>
    db.prepare<[number], Seating>(
        "SELECT table_number, assigned_seats FROM seated_at WHERE booking_id = ? ORDER BY table_number"
    ).all(bookingId);

// Compare actual rows, not just their counts: rejected requests must also
// leave existing bookings, seat assignments and account details untouched.
const databaseState = () => ({
    accounts: db.prepare("SELECT * FROM account ORDER BY id").all(),
    hikers: db.prepare("SELECT * FROM hiker ORDER BY account_id").all(),
    bookings: db.prepare("SELECT * FROM booking ORDER BY id").all(),
    guests: db.prepare("SELECT * FROM temporary_hiker ORDER BY booking_id").all(),
    seats: db.prepare("SELECT * FROM seated_at ORDER BY booking_id, slot_date, slot_start_time, table_number").all(),
    requirements: db.prepare("SELECT * FROM dietary_requirement ORDER BY id").all(),
});

describe("Reserve for a hiker - integration", () => {
    let tomorrow: string;
    const book = (hiker: object, partySize = 2) => ({ date: tomorrow, slot: "13:00", partySize, hiker });

    beforeEach(() => {
        resetTestDatabase();
        createHikerWithoutBookings();
        tomorrow = dayFromToday(1);
        vi.mocked(notifyBookingCreated).mockReset();
    });

    afterEach(() => vi.useRealTimers());

    describe("access and validation", () => {
        it("rejects a visitor and leaves the database unchanged", async () => {
            const before = databaseState();

            const res = await request(app).post(RESERVATIONS_URL).send(book(REGISTERED));

            expect(res.status).toBe(401);
            expect(res.body).toMatchObject({ code: 401, name: "UnauthorizedError" });
            expect(databaseState()).toEqual(before);
        });

        it.each([
            { role: "employee", email: EMPLOYEE },
            { role: "warden", email: WARDEN },
        ])("lets the $role reserve for an existing hiker", async ({ email }) => {
            const staff = await loginAs(email);
            const hikerId = accountId(NEW_HIKER);

            const res = await staff.post(RESERVATIONS_URL).send(book({ mode: "existing", hikerId }));

            expect(res.status).toBe(201);
            expect(res.body.hikerId).toBe(hikerId);
            expect(db.prepare("SELECT hiker_id FROM booking WHERE id = ?").get(res.body.id)).toEqual({ hiker_id: hikerId });
            expect(hikerId).not.toBe(accountId(email));
        });

        it("books for the logged-in hiker even if another hiker is supplied", async () => {
            const hiker = await loginAs(NEW_HIKER);

            const res = await hiker.post(RESERVATIONS_URL).send(book({ mode: "existing", hikerId: accountId(MARIO) }));

            expect(res.status).toBe(201);
            expect(db.prepare("SELECT hiker_id FROM booking WHERE id = ?").get(res.body.id)).toEqual({ hiker_id: accountId(NEW_HIKER) });
            expect(res.body).not.toHaveProperty("initialPassword");
        });

        it("answers 400, rather than 403, when staff omit the required hiker", async () => {
            const staff = await loginAs(EMPLOYEE);
            const before = databaseState();

            const res = await staff.post(RESERVATIONS_URL)
                .send({ date: tomorrow, slot: "13:00", partySize: 2 });

            expect(res.status).toBe(400);
            expect(res.body).toMatchObject({ code: 400, name: "BadRequestError" });
            expect(databaseState()).toEqual(before);
        });

        it.each([
            { label: "unknown mode", hiker: { mode: "guest", fullname: "Paolo Test" } },
            { label: "missing existing id", hiker: { mode: "existing" } },
            { label: "invalid new email", hiker: { ...REGISTERED, email: "not-an-email" } },
        ])("rejects $label without saving anything", async ({ hiker }) => {
            const staff = await loginAs(EMPLOYEE);
            const before = databaseState();

            const res = await staff.post(RESERVATIONS_URL).send(book(hiker));

            expect(res.status).toBe(400);
            expect(databaseState()).toEqual(before);
        });

        it("rejects invalid food needs before creating an account", async () => {
            const staff = await loginAs(EMPLOYEE);
            const before = databaseState();

            const res = await staff.post(RESERVATIONS_URL).send({
                ...book(REGISTERED), requirements: [{ hasAllergies: true, details: "  " }],
            });

            expect(res.status).toBe(400);
            expect(databaseState()).toEqual(before);
        });
    });

    describe("existing and temporary hikers", () => {
        it("stores the booking, seats and dietary requirements together", async () => {
            const staff = await loginAs(EMPLOYEE);
            const hikerId = accountId(NEW_HIKER);
            const requirements = [{ hasAllergies: true, details: "1 peanut allergy" }];

            const res = await staff.post(RESERVATIONS_URL).send({
                ...book({ mode: "existing", hikerId }), requirements,
            });

            expect(res.status).toBe(201);
            expect(res.body).toEqual({
                id: expect.any(Number), date: tomorrow, slot: "13:00", partySize: 2,
                hikerId, seatings: [{ table_number: 4, assigned_seats: 2 }], requirements,
            });
            expect(db.prepare("SELECT hiker_id FROM booking WHERE id = ?").get(res.body.id)).toEqual({ hiker_id: hikerId });
            expect(storedSeatings(res.body.id)).toEqual(res.body.seatings);
            expect(db.prepare("SELECT slot_date, slot_start_time FROM seated_at WHERE booking_id = ?").all(res.body.id)).toEqual([{ slot_date: tomorrow, slot_start_time: "13:00" }]);
            expect(db.prepare("SELECT allergy_flag, description FROM dietary_requirement WHERE booking_id = ?").all(res.body.id)).toEqual([{ allergy_flag: 1, description: "1 peanut allergy" }]);
        });

        it.each([
            { label: "with phone", phone: "+39 333 7654321" },
            { label: "without phone", phone: undefined },
        ])("stores a temporary guest $label without creating an account", async ({ phone }) => {
            const staff = await loginAs(EMPLOYEE);
            const before = databaseState();

            const res = await staff.post(RESERVATIONS_URL).send(book({
                mode: "temporary", fullname: "Paolo Test", mobile_number: phone,
            }));

            expect(res.status).toBe(201);
            expect(res.body.hikerId).toBeNull();
            expect(res.body).not.toHaveProperty("initialPassword");
            expect(db.prepare("SELECT hiker_id FROM booking WHERE id = ?").get(res.body.id)).toEqual({ hiker_id: null });
            expect(db.prepare("SELECT full_name, mobile_number FROM temporary_hiker WHERE booking_id = ?").get(res.body.id)).toEqual({ full_name: "Paolo Test", mobile_number: phone ?? null });
            expect(storedSeatings(res.body.id)).toEqual([{ table_number: 4, assigned_seats: 2 }]);
            expect(databaseState().accounts).toEqual(before.accounts);
            expect(databaseState().hikers).toEqual(before.hikers);
        });
    });

    describe("new hiker accounts", () => {
        it.each([
            { label: "required fields only", optional: {}, notes: null, contact: null },
            {
                label: "a full profile", optional: { notes: "Arrives by bike", emergency_contact: "Luca +39 333 0000000" },
                notes: "Arrives by bike", contact: "Luca +39 333 0000000",
            },
        ])("creates an account with $label and a usable initial password", async ({ optional, notes, contact }) => {
            const staff = await loginAs(EMPLOYEE);

            const res = await staff.post(RESERVATIONS_URL).send(book({ ...REGISTERED, ...optional }));

            expect(res.status).toBe(201);
            expect(res.body.initialPassword).toEqual(expect.any(String));
            expect(res.body.initialPassword.length).toBeGreaterThan(0);
            expect(db.prepare("SELECT id, must_change_password FROM account WHERE email = ?").get(EMAIL)).toEqual({ id: res.body.hikerId, must_change_password: 1 });
            expect(db.prepare("SELECT full_name, mobile_number, notes, emergency_contact FROM hiker WHERE account_id = ?").get(res.body.hikerId))
                .toEqual({ full_name: REGISTERED.fullname, mobile_number: REGISTERED.mobile_number, notes, emergency_contact: contact });
            expect(db.prepare("SELECT hiker_id FROM booking WHERE id = ?").get(res.body.id)).toEqual({ hiker_id: res.body.hikerId });
            expect(storedSeatings(res.body.id)).toEqual([{ table_number: 4, assigned_seats: 2 }]);
            expect(res.body).not.toHaveProperty("password_hash");
            expect(res.body).not.toHaveProperty("password_salt");

            // Authentication verifies the returned password against the stored hash.
            const login = await request(app).post(SESSION_URL).send({ email: EMAIL, password: res.body.initialPassword });
            expect(login.status).toBe(201);
            expect(login.body).toMatchObject({ id: res.body.hikerId, role: "hiker" });
        });

        it.each([MARIO, EMPLOYEE])("rejects the already registered email %s without writes", async (email) => {
            const staff = await loginAs(EMPLOYEE);
            const before = databaseState();

            const res = await staff.post(RESERVATIONS_URL).send(book({ ...REGISTERED, email: ` ${email.toUpperCase()} ` }));

            expect(res.status).toBe(409);
            expect(databaseState()).toEqual(before);
        });
    });

    describe("capacity and transactions", () => {
        it("rejects a second booking in the same slot without changing the first", async () => {
            const staff = await loginAs(EMPLOYEE);
            const body = book({ mode: "existing", hikerId: accountId(NEW_HIKER) });
            expect((await staff.post(RESERVATIONS_URL).send(body)).status).toBe(201);
            const before = databaseState();

            const res = await staff.post(RESERVATIONS_URL).send(body);

            expect(res.status).toBe(409);
            expect(databaseState()).toEqual(before);
        });

        it.each(["existing", "temporary", "registered"])("saves nothing on missing capacity in %s mode", async (mode) => {
            const staff = await loginAs(EMPLOYEE);
            const before = databaseState();
            const hiker = mode === "existing" ? { mode, hikerId: accountId(NEW_HIKER) }
                : mode === "temporary" ? { mode, fullname: "Paolo Test" } : REGISTERED;

            // There are only 16 seats. In registered mode, account creation happens
            // before allocation: this checks the rollback of the nested transactions.
            const res = await staff.post(RESERVATIONS_URL).send({
                ...book(hiker, 17), requirements: [{ hasAllergies: false, details: "2 vegetarians" }],
            });

            expect(res.status).toBe(409);
            expect(databaseState()).toEqual(before);
            expect(db.prepare("SELECT id FROM account WHERE email = ?").get(EMAIL)).toBeUndefined();
        });

        it("splits a large party over the fewest tables and updates public availability", async () => {
            const staff = await loginAs(EMPLOYEE);

            const res = await staff.post(RESERVATIONS_URL).send(book({ mode: "temporary", fullname: "Paolo Test" }, 9));

            expect(res.status).toBe(201);
            const seats = storedSeatings(res.body.id);
            expect(seats).toHaveLength(2);
            expect(seats).toContainEqual({ table_number: 3, assigned_seats: 6 });
            expect(seats.reduce((sum, seat) => sum + seat.assigned_seats, 0)).toBe(9);
            const slots = await request(app).get(SLOTS_URL).query({ date: tomorrow });
            expect(slots.status).toBe(200);
            expect(slots.body.find((slot: { start_time: string }) => slot.start_time === "13:00")).toMatchObject({ available_seats: 7, total_seats: 16 });
        });

        it.each([
            { label: "unknown hiker", id: 999999 },
            { label: "a staff account", id: 2 },
        ])("rejects an existing hiker id belonging to $label", async ({ id }) => {
            const staff = await loginAs(EMPLOYEE);
            const before = databaseState();

            const res = await staff.post(RESERVATIONS_URL).send(book({ mode: "existing", hikerId: id }));

            expect(res.status).toBe(404);
            expect(databaseState()).toEqual(before);
        });

        it("rejects a nonexistent slot before creating an account", async () => {
            const staff = await loginAs(EMPLOYEE);
            const before = databaseState();

            const res = await staff.post(RESERVATIONS_URL).send({ ...book(REGISTERED), slot: "15:00" });

            expect(res.status).toBe(404);
            expect(databaseState()).toEqual(before);
        });
    });

    describe("staff booking window", () => {
        it.each([
            { label: "30 minutes before", offset: -30 * 60 * 1000, status: 201 },
            { label: "exactly at the start", offset: 0, status: 201 },
            { label: "one millisecond after", offset: 1, status: 400 },
        ])("checks the slot $label", async ({ offset, status }) => {
            const staff = await loginAs(EMPLOYEE);
            const before = databaseState();
            // Fake only Date: HTTP/session timers keep running normally.
            vi.useFakeTimers({ toFake: ["Date"] });
            vi.setSystemTime(new Date(huTime(tomorrow, "13:00").getTime() + offset));

            const res = await staff.post(RESERVATIONS_URL).send(book(REGISTERED));

            expect(res.status).toBe(status);
            if (status === 400) expect(databaseState()).toEqual(before);
            else expect(storedSeatings(res.body.id)).toEqual([{ table_number: 4, assigned_seats: 2 }]);
        });
    });

    describe("confirmation notification", () => {
        it.each(["existing", "temporary", "registered"])("does not notify for staff bookings in %s mode", async (mode) => {
            const staff = await loginAs(EMPLOYEE);
            const hiker = mode === "existing" ? { mode, hikerId: accountId(NEW_HIKER) }
                : mode === "temporary" ? { mode, fullname: "Paolo Test" } : REGISTERED;

            const res = await staff.post(RESERVATIONS_URL).send(book(hiker));

            expect(res.status).toBe(201);
            expect(notifyBookingCreated).not.toHaveBeenCalled();
        });
    });
});
