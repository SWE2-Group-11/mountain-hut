import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import reservationRouter from "../../routes/reservation-route";
import accountRouter from "../../routes/account-route";
import {
    createReservation,
    createStaffReservation,
    searchStaffHikers,
} from "../../controllers/reservation-controller";
import { BadRequestError } from "../../models/errors/badrequest-error";
import { ConflictError } from "../../models/errors/conflict-error";
import { NotFoundError } from "../../models/errors/notfound-error";
import type {
    CreateReservationResponseDTO,
    CreateStaffReservationResponseDTO,
    StaffHikerDTO,
} from "../../models/dto/reservation-dto";
import * as errorService from "../../services/error-service";

/*
UNIT tests for the routes of MH-07 "Reserve for a hiker" (route task MH-106, implemented in MH-139):
- POST /reservations: an employee or the warden books a table on behalf of an existing, temporary or new hiker;
- GET /accounts: an employee or the warden searches hikers by name, phone and/or email.
Covered: access control, validation, what the controller receives, the responses and the error format.
Expected results come from the story and docs/api.md. The controllers are mocked.
*/

vi.mock("../../controllers/reservation-controller", () => ({
    createReservation: vi.fn(),
    createStaffReservation: vi.fn(),
    searchStaffHikers: vi.fn(),
    getReservations: vi.fn(),
    updateReservation: vi.fn(),
}));
vi.mock("../../controllers/account-controller", () => ({ registerHiker: vi.fn() }));
vi.mock("../../dao/account-dao", () => ({ getAccountByCredentials: vi.fn() }));

const RESERVATIONS_URL = "/reservations";
const ACCOUNTS_URL = "/accounts";
const HIKER_ID = 7;
const HIKER = { id: HIKER_ID, email: "mario@mountainhut.test", role: "hiker" } as Express.User;
const EMPLOYEE = { id: 2, email: "employee@mountainhut.test", role: "employee" } as Express.User;
const WARDEN = { id: 1, email: "warden@mountainhut.test", role: "warden" } as Express.User;

const BOOKING = { date: "2030-06-15", slot: "12:00", partySize: 4 };
const EXISTING = { mode: "existing", hikerId: 5 };
const TEMPORARY = { mode: "temporary", fullname: "Luigi Verdi", mobile_number: "+39 333 1234567" };
const REGISTERED = {
    mode: "registered",
    fullname: "Anna Bianchi",
    mobile_number: "+39 333 7654321",
    email: "anna@mountainhut.test",
    notes: "Arrives by bike",
    emergency_contact: "Paolo Bianchi +39 333 0000000",
};
const STAFF_BODY = { ...BOOKING, hiker: EXISTING };

const RESERVATION: CreateReservationResponseDTO = {
    id: 42,
    date: "2030-06-15",
    slot: "12:00",
    partySize: 4,
    seatings: [{ table_number: 1, assigned_seats: 4 }],
    requirements: [],
};
const STAFF_CREATED: CreateStaffReservationResponseDTO = { ...RESERVATION, hikerId: 5 };

const HIKERS_FOUND: StaffHikerDTO[] = [
    { id: 5, bookingId: null, fullname: "Mario Rossi", mobile_number: "+39 333 1234567", email: "mario@mountainhut.test", hasAccount: true },
    { id: null, bookingId: 31, fullname: "Mario Verdi", mobile_number: null, email: null, hasAccount: false },
];

// Who is logged in for the current test (undefined = nobody)
let currentUser: Express.User | undefined;

// Minimal app: the session is replaced by currentUser, the routers and the error format are the real ones
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
    req.isAuthenticated = (() => currentUser !== undefined) as typeof req.isAuthenticated;
    req.user = currentUser;
    next();
});
app.use(RESERVATIONS_URL, reservationRouter);
app.use(ACCOUNTS_URL, accountRouter);

beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(errorService, "sendAppError");
    currentUser = EMPLOYEE;
    vi.mocked(createReservation).mockReturnValue(RESERVATION);
    vi.mocked(createStaffReservation).mockReturnValue(STAFF_CREATED);
    vi.mocked(searchStaffHikers).mockReturnValue(HIKERS_FOUND);
});

afterEach(() => vi.resetAllMocks());

describe("POST /reservations for a hiker (staff booking) — route", () => {
    describe("access control", () => {
        it("answers 401 and calls no controller when nobody is logged in", async () => {
            // Why: only logged-in users can book (api.md: Authentication required)
            currentUser = undefined;

            const res = await request(app).post(RESERVATIONS_URL).send(STAFF_BODY);

            expect(res.status).toBe(401);
            expect(res.body).toMatchObject({ code: 401, name: "UnauthorizedError" });
            expect(createStaffReservation).not.toHaveBeenCalled();
            expect(createReservation).not.toHaveBeenCalled();
        });

        it("answers 401 before looking at the body when nobody is logged in", async () => {
            // Why: the team checks access before validation, so a visitor never learns about the body rules
            currentUser = undefined;

            const res = await request(app).post(RESERVATIONS_URL).send({ hiker: { mode: "guest" } });

            expect(res.status).toBe(401);
            expect(createStaffReservation).not.toHaveBeenCalled();
        });

        it.each([
            { label: "an employee", user: EMPLOYEE },
            { label: "a warden", user: WARDEN },
        ])("lets $label book for a hiker", async ({ user }) => {
            // Why: the story is for the employee, and the warden can do everything an employee can
            currentUser = user;

            const res = await request(app).post(RESERVATIONS_URL).send(STAFF_BODY);

            expect(res.status).toBe(201);
            expect(createStaffReservation).toHaveBeenCalledExactlyOnceWith(STAFF_BODY);
            expect(createReservation).not.toHaveBeenCalled();
        });

        it.each([
            { label: "an existing hiker", hiker: EXISTING },
            { label: "a temporary hiker", hiker: TEMPORARY },
        ])("books for the logged-in hiker even if a hiker sends $label in the body", async ({ hiker }) => {
            // Why: a hiker must not reserve for others; api.md says the hiker field is ignored for hikers
            currentUser = HIKER;

            const res = await request(app).post(RESERVATIONS_URL).send({ ...BOOKING, hiker });

            expect(res.status).toBe(201);
            expect(createReservation).toHaveBeenCalledExactlyOnceWith(HIKER_ID, BOOKING);
            expect(createStaffReservation).not.toHaveBeenCalled();
        });
    });

    describe("kinds of hiker", () => {
        it.each([
            { label: "an existing hiker", hiker: EXISTING },
            { label: "a temporary hiker with name and phone", hiker: TEMPORARY },
            { label: "a temporary hiker with only the name", hiker: { mode: "temporary", fullname: "Luigi Verdi" } },
            { label: "a new hiker with the full profile", hiker: REGISTERED },
            {
                label: "a new hiker with only the required details",
                hiker: { mode: "registered", fullname: "Anna Bianchi", mobile_number: "+39 333 7654321", email: "anna@mountainhut.test" },
            },
        ])("passes $label to the controller", async ({ hiker }) => {
            // Why: the story allows an existing hiker, a quick temporary hiker (name + optional phone) or a full profile
            const body = { ...BOOKING, hiker };

            const res = await request(app).post(RESERVATIONS_URL).send(body);

            expect(res.status).toBe(201);
            expect(createStaffReservation).toHaveBeenCalledExactlyOnceWith(body);
        });

        it("passes the dietary requirements of the party together with the hiker", async () => {
            // Why: the staff enters the reservation details in addition to the hiker details
            const body = { ...BOOKING, requirements: [{ hasAllergies: true, details: "2 without gluten" }], hiker: REGISTERED };

            await request(app).post(RESERVATIONS_URL).send(body);

            expect(createStaffReservation).toHaveBeenCalledExactlyOnceWith(body);
        });

        it("cleans the hiker details before the controller gets them", async () => {
            // Why: as for the hiker registration (api.md POST /accounts), spaces are removed and the email is lowercase
            const hiker = {
                mode: "registered",
                fullname: "  Anna Bianchi  ",
                mobile_number: " +39 333 7654321 ",
                email: " Anna@MountainHut.TEST ",
                notes: "  Arrives by bike  ",
            };

            await request(app).post(RESERVATIONS_URL).send({ ...BOOKING, hiker });

            expect(createStaffReservation).toHaveBeenCalledExactlyOnceWith({
                ...BOOKING,
                hiker: {
                    mode: "registered",
                    fullname: "Anna Bianchi",
                    mobile_number: "+39 333 7654321",
                    email: "anna@mountainhut.test",
                    notes: "Arrives by bike",
                },
            });
        });
    });

    describe("validation", () => {
        const LONG = "x".repeat(201);

        it.each([
            { label: "no hiker", body: BOOKING },
            { label: "a hiker without mode", body: { ...BOOKING, hiker: { hikerId: 5 } } },
            { label: "an unknown mode", body: { ...BOOKING, hiker: { mode: "guest", fullname: "Luigi Verdi" } } },
            { label: "an existing hiker without id", body: { ...BOOKING, hiker: { mode: "existing" } } },
            { label: "an existing hiker with id 0", body: { ...BOOKING, hiker: { mode: "existing", hikerId: 0 } } },
            { label: "an existing hiker with a negative id", body: { ...BOOKING, hiker: { mode: "existing", hikerId: -1 } } },
            { label: "an existing hiker with a decimal id", body: { ...BOOKING, hiker: { mode: "existing", hikerId: 1.5 } } },
            { label: "an existing hiker with the id sent as text", body: { ...BOOKING, hiker: { mode: "existing", hikerId: "5" } } },
            { label: "an existing hiker with extra fields", body: { ...BOOKING, hiker: { ...EXISTING, fullname: "Mario Rossi" } } },
            { label: "a temporary hiker without name", body: { ...BOOKING, hiker: { mode: "temporary", mobile_number: "333" } } },
            { label: "a temporary hiker with a blank name", body: { ...BOOKING, hiker: { mode: "temporary", fullname: "   " } } },
            { label: "a temporary hiker with an email", body: { ...BOOKING, hiker: { ...TEMPORARY, email: "luigi@mountainhut.test" } } },
            { label: "a new hiker without name", body: { ...BOOKING, hiker: { ...REGISTERED, fullname: undefined } } },
            { label: "a new hiker without phone", body: { ...BOOKING, hiker: { ...REGISTERED, mobile_number: undefined } } },
            { label: "a new hiker without email", body: { ...BOOKING, hiker: { ...REGISTERED, email: undefined } } },
            { label: "a new hiker with an invalid email", body: { ...BOOKING, hiker: { ...REGISTERED, email: "anna-at-home" } } },
            { label: "a new hiker with notes over 200 characters", body: { ...BOOKING, hiker: { ...REGISTERED, notes: LONG } } },
            { label: "a new hiker with an emergency contact over 200 characters", body: { ...BOOKING, hiker: { ...REGISTERED, emergency_contact: LONG } } },
            { label: "a new hiker with a password", body: { ...BOOKING, hiker: { ...REGISTERED, password: "secret" } } },
            { label: "a new hiker with a role", body: { ...BOOKING, hiker: { ...REGISTERED, role: "warden" } } },
            { label: "an unknown field next to the hiker", body: { ...STAFF_BODY, hikerId: 99 } },
            { label: "a missing date", body: { slot: "12:00", partySize: 4, hiker: EXISTING } },
            { label: "a date that does not exist", body: { ...STAFF_BODY, date: "2030-02-30" } },
            { label: "a time with a wrong format", body: { ...STAFF_BODY, slot: "25:00" } },
            { label: "a party size of 0", body: { ...STAFF_BODY, partySize: 0 } },
            { label: "a requirement with blank details", body: { ...STAFF_BODY, requirements: [{ hasAllergies: false, details: "  " }] } },
        ])("answers 400 and skips the controller for $label", async ({ body }) => {
            // Why: api.md lists missing or invalid fields and a missing/invalid hiker as 400, with no other fields accepted
            const res = await request(app).post(RESERVATIONS_URL).send(body);

            expect(res.status).toBe(400);
            expect(res.body).toMatchObject({ code: 400, name: "BadRequestError", message: expect.any(String) });
            expect(createStaffReservation).not.toHaveBeenCalled();
            expect(createReservation).not.toHaveBeenCalled();
        });
    });

    describe("response", () => {
        it.each([
            { label: "an existing hiker", hiker: EXISTING, created: STAFF_CREATED },
            { label: "a temporary hiker", hiker: TEMPORARY, created: { ...RESERVATION, hikerId: null } },
            { label: "a new hiker", hiker: REGISTERED, created: { ...RESERVATION, hikerId: 12, initialPassword: "Xy7-generated" } },
        ])("answers 201 with what the controller returns for $label", async ({ hiker, created }) => {
            // Why: api.md 201 returns the booking plus hikerId (null for a temporary hiker) and initialPassword for a new account
            vi.mocked(createStaffReservation).mockReturnValue(created);

            const res = await request(app).post(RESERVATIONS_URL).send({ ...BOOKING, hiker });

            expect(res.status).toBe(201);
            expect(res.body).toEqual(created);
            expect(errorService.sendAppError).not.toHaveBeenCalled();
        });
    });

    describe("controller errors", () => {
        it.each([
            { label: "the slot does not exist", error: new NotFoundError("The requested slot does not exist"), code: 404 },
            { label: "the existing hiker does not exist", error: new NotFoundError("Hiker not found"), code: 404 },
            { label: "the hiker already has a booking in the slot", error: new ConflictError("The hiker already has a booking for this slot"), code: 409 },
            { label: "there are no seats left", error: new ConflictError("The requested capacity is no longer available"), code: 409 },
            { label: "the email is already used", error: new ConflictError("An account with this email already exists"), code: 409 },
            { label: "the slot has already started", error: new BadRequestError("Staff reservations cannot be made after the slot has started"), code: 400 },
        ])("answers $code with the error format when $label", async ({ error, code }) => {
            // Why: api.md maps these cases to 404, 409 and 400 in the team's { code, name, message } format
            vi.mocked(createStaffReservation).mockImplementation(() => {
                throw error;
            });

            const res = await request(app).post(RESERVATIONS_URL).send(STAFF_BODY);

            expect(res.status).toBe(code);
            expect(res.body).toEqual({ code, name: error.name, message: error.message });
            expect(errorService.sendAppError).toHaveBeenCalledExactlyOnceWith(error, expect.any(Object));
        });

        it("answers 500 without leaking the message of an unexpected error", async () => {
            // Why: internal details (e.g. SQL errors) must never reach the client
            vi.spyOn(console, "error").mockImplementation(() => undefined);
            const error = new Error("SQLITE_BUSY: secret details");
            vi.mocked(createStaffReservation).mockImplementation(() => {
                throw error;
            });

            const res = await request(app).post(RESERVATIONS_URL).send(STAFF_BODY);

            expect(res.status).toBe(500);
            expect(res.body.code).toBe(500);
            expect(JSON.stringify(res.body)).not.toContain("SQLITE_BUSY");
            expect(errorService.sendAppError).toHaveBeenCalledExactlyOnceWith(error, expect.any(Object));
        });
    });
});

describe("GET /accounts (hiker search) — route", () => {
    describe("access control", () => {
        it("answers 401 and skips the controller when nobody is logged in", async () => {
            // Why: the search needs a logged-in user (api.md: Authentication required)
            currentUser = undefined;

            const res = await request(app).get(ACCOUNTS_URL).query({ name: "Mario" });

            expect(res.status).toBe(401);
            expect(res.body).toMatchObject({ code: 401, name: "UnauthorizedError" });
            expect(searchStaffHikers).not.toHaveBeenCalled();
        });

        it("answers 401 before looking at the query when nobody is logged in", async () => {
            // Why: the team checks access before validation, so a visitor never learns about the query rules
            currentUser = undefined;

            const res = await request(app).get(ACCOUNTS_URL);

            expect(res.status).toBe(401);
            expect(searchStaffHikers).not.toHaveBeenCalled();
        });

        it("answers 403 and skips the controller for a hiker", async () => {
            // Why: the story says a hiker must not search other hikers (api.md: employee, warden)
            currentUser = HIKER;

            const res = await request(app).get(ACCOUNTS_URL).query({ name: "Mario" });

            expect(res.status).toBe(403);
            expect(res.body).toMatchObject({ code: 403, name: "ForbiddenError" });
            expect(searchStaffHikers).not.toHaveBeenCalled();
        });

        it.each([
            { label: "an employee", user: EMPLOYEE },
            { label: "a warden", user: WARDEN },
        ])("lets $label search hikers", async ({ user }) => {
            // Why: the employee looks up the hiker before booking, and the warden can do everything an employee can
            currentUser = user;

            const res = await request(app).get(ACCOUNTS_URL).query({ name: "Mario" });

            expect(res.status).toBe(200);
            expect(searchStaffHikers).toHaveBeenCalledTimes(1);
        });
    });

    describe("search criteria", () => {
        it.each([
            { label: "the name", query: { name: "Mario" } },
            { label: "the phone", query: { phone: "333 123" } },
            { label: "the email", query: { email: "mario@mountainhut.test" } },
            { label: "name, phone and email together", query: { name: "Mario", phone: "333", email: "mario@mountainhut.test" } },
        ])("passes $label to the controller", async ({ query }) => {
            // Why: the story says a hiker can be matched by name, phone or email; api.md combines several with AND
            const res = await request(app).get(ACCOUNTS_URL).query(query);

            expect(res.status).toBe(200);
            expect(searchStaffHikers).toHaveBeenCalledExactlyOnceWith(query);
        });

        it("removes the spaces around the name and lowercases the email before the controller gets them", async () => {
            // Why: api.md says surrounding spaces are removed and the email match is case-insensitive
            await request(app).get(ACCOUNTS_URL).query({ name: "  Mario  ", email: "Mario@MountainHut.TEST" });

            expect(searchStaffHikers).toHaveBeenCalledExactlyOnceWith({ name: "Mario", email: "mario@mountainhut.test" });
        });
    });

    describe("validation", () => {
        it.each([
            { label: "no search parameter", query: {} },
            { label: "an empty name", query: { name: "" } },
            { label: "a name made only of spaces", query: { name: "   " } },
            { label: "an empty phone", query: { phone: "" } },
            { label: "an empty email", query: { email: "" } },
            { label: "an empty name next to a valid email", query: { name: "", email: "mario@mountainhut.test" } },
            { label: "an invalid email", query: { email: "mario-at-home" } },
            { label: "an unknown parameter", query: { role: "hiker" } },
            { label: "an unknown parameter next to a valid one", query: { name: "Mario", role: "warden" } },
        ])("answers 400 and skips the controller for $label", async ({ query }) => {
            // Why: api.md lists no parameter, an empty parameter, an invalid email and an unknown parameter as 400
            const res = await request(app).get(ACCOUNTS_URL).query(query);

            expect(res.status).toBe(400);
            expect(res.body).toMatchObject({ code: 400, name: "BadRequestError", message: expect.any(String) });
            expect(searchStaffHikers).not.toHaveBeenCalled();
        });
    });

    describe("response", () => {
        it("answers 200 with the hikers the controller found", async () => {
            // Why: api.md 200 returns the matching hikers, registered and temporary, with id, bookingId and hasAccount
            const res = await request(app).get(ACCOUNTS_URL).query({ name: "Mario" });

            expect(res.status).toBe(200);
            expect(res.body).toEqual(HIKERS_FOUND);
            expect(errorService.sendAppError).not.toHaveBeenCalled();
        });

        it("answers 200 with an empty list when no hiker matches", async () => {
            // Why: api.md returns [] when no hiker matches, not an error
            vi.mocked(searchStaffHikers).mockReturnValue([]);

            const res = await request(app).get(ACCOUNTS_URL).query({ name: "Nobody" });

            expect(res.status).toBe(200);
            expect(res.body).toEqual([]);
        });

        it("answers 500 without leaking the message of an unexpected error", async () => {
            // Why: internal details (e.g. SQL errors) must never reach the client
            vi.spyOn(console, "error").mockImplementation(() => undefined);
            const error = new Error("SQLITE_BUSY: secret details");
            vi.mocked(searchStaffHikers).mockImplementation(() => {
                throw error;
            });

            const res = await request(app).get(ACCOUNTS_URL).query({ name: "Mario" });

            expect(res.status).toBe(500);
            expect(res.body.code).toBe(500);
            expect(JSON.stringify(res.body)).not.toContain("SQLITE_BUSY");
            expect(errorService.sendAppError).toHaveBeenCalledExactlyOnceWith(error, expect.any(Object));
        });
    });
});
