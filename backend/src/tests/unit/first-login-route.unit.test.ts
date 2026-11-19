import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import accountRouter from "../../routes/account-route";
import reservationRouter from "../../routes/reservation-route";
import slotRouter from "../../routes/slot-route";
import { changePassword, requestPasswordReset, resetPassword } from "../../controllers/account-controller";
import {
    cancelReservation,
    createReservation,
    createStaffReservation,
    getReservations,
    searchStaffHikers,
    updateReservation,
} from "../../controllers/reservation-controller";
import { createSlot, getConfigurations } from "../../controllers/slot-controller";
import { repeatWeeklySchedule } from "../../controllers/weekly-schedule-controller";
import { AccountResponseDTO } from "../../models/dto/account-dto";
import { BadRequestError } from "../../models/errors/badrequest-error";
import { UnauthorizedError } from "../../models/errors/unauthorized-error";
import * as errorService from "../../services/error-service";

/*
UNIT tests for the route layer of MH-171.
Covered:
- the block of the other routes while must_change_password is true (403 "Password change required");
- PUT /accounts/current/password: access, validation, what the controller receives, the session refresh, the errors;
- POST /accounts/password-reset and POST /accounts/password-reset/confirm.
The controllers are mocked.
*/

vi.mock("../../controllers/account-controller", () => ({
    registerHiker: vi.fn(),
    changePassword: vi.fn(),
    requestPasswordReset: vi.fn(),
    resetPassword: vi.fn(),
}));
vi.mock("../../controllers/reservation-controller", () => ({
    cancelReservation: vi.fn(),
    createReservation: vi.fn(),
    createStaffReservation: vi.fn(),
    getReservations: vi.fn(),
    searchStaffHikers: vi.fn(),
    updateReservation: vi.fn(),
}));
vi.mock("../../controllers/slot-controller", () => ({
    createSlot: vi.fn(),
    getAvailability: vi.fn(),
    getConfigurations: vi.fn(),
    getSlots: vi.fn(),
}));
vi.mock("../../controllers/weekly-schedule-controller", () => ({ repeatWeeklySchedule: vi.fn() }));
vi.mock("../../dao/account-dao", () => ({ getAccountByCredentials: vi.fn() }));

const ACCOUNT_ID = 7;
const EMAIL = "anna.neri@mountainhut.test";
const CURRENT = "initial-password-from-staff";
const NEW_PASSWORD = "my-new-password";
const CHANGE_BODY = { current_password: CURRENT, new_password: NEW_PASSWORD };

const user = (role: "hiker" | "employee" | "warden", must_change_password: boolean) =>
    ({ id: ACCOUNT_ID, email: EMAIL, role, must_change_password }) as Express.User;

const FIRST_LOGIN_HIKER = user("hiker", true);
const FIRST_LOGIN_EMPLOYEE = user("employee", true);
const FIRST_LOGIN_WARDEN = user("warden", true);
const CHANGED = new AccountResponseDTO(ACCOUNT_ID, EMAIL, "hiker", false);

const PASSWORD_CHANGE_REQUIRED = { code: 403, name: "ForbiddenError", message: "Password change required" };

// Who is logged in for the current test (undefined = nobody)
let currentUser: Express.User | undefined;

// Minimal app: the session is replaced by currentUser (req.login stores the new copy),
// the routers, the guards, the validation and the error format are the real ones
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
    req.isAuthenticated = (() => currentUser !== undefined) as typeof req.isAuthenticated;
    req.user = currentUser;
    req.login = ((account: Express.User, cb: (err?: unknown) => void) => {
        currentUser = account;
        cb();
    }) as typeof req.login;
    next();
});
app.use("/accounts", accountRouter);
app.use("/reservations", reservationRouter);
app.use("/slots", slotRouter);

const BOOKING = { date: "2030-06-15", slot: "12:00", partySize: 2 };
const EVERY_CONTROLLER = [
    cancelReservation, createReservation, createStaffReservation, getReservations, searchStaffHikers,
    updateReservation, createSlot, getConfigurations, repeatWeeklySchedule,
];

beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(errorService, "sendAppError");
    currentUser = undefined;
    vi.mocked(changePassword).mockReturnValue(CHANGED);
    vi.mocked(getReservations).mockReturnValue([]);
    vi.mocked(searchStaffHikers).mockReturnValue([]);
});

afterEach(() => vi.resetAllMocks());

describe("other routes while the password must be changed", () => {
    it.each([
        { label: "POST /reservations", send: () => request(app).post("/reservations").send(BOOKING) },
        { label: "GET /reservations", send: () => request(app).get("/reservations") },
        { label: "PATCH /reservations/5", send: () => request(app).patch("/reservations/5").send({ partySize: 3 }) },
        { label: "DELETE /reservations/5", send: () => request(app).delete("/reservations/5") },
    ])("answers 403 Password change required to a first-login hiker on $label", async ({ send }) => {
        // Why: requirement - the hiker is forced to change the password; api.md - every other route answers 403
        currentUser = FIRST_LOGIN_HIKER;

        const res = await send();

        expect(res.status).toBe(403);
        expect(res.body).toEqual(PASSWORD_CHANGE_REQUIRED);
        EVERY_CONTROLLER.forEach((controller) => expect(controller).not.toHaveBeenCalled());
    });

    it.each([
        { label: "GET /accounts", send: () => request(app).get("/accounts?name=Mario") },
        { label: "POST /reservations", send: () => request(app).post("/reservations").send(BOOKING) },
        { label: "POST /slots", send: () => request(app).post("/slots").send({}) },
        { label: "GET /slots/configurations", send: () => request(app).get("/slots/configurations") },
        { label: "POST /slots/copy-week", send: () => request(app).post("/slots/copy-week").send({}) },
    ])("answers 403 Password change required to a first-login employee or warden on $label", async ({ send }) => {
        // Why: api.md - every account with a temporary password is blocked, whatever its role
        for (const staff of [FIRST_LOGIN_EMPLOYEE, FIRST_LOGIN_WARDEN]) {
            currentUser = staff;

            const res = await send();

            expect(res.status).toBe(403);
            expect(res.body).toEqual(PASSWORD_CHANGE_REQUIRED);
        }
        EVERY_CONTROLLER.forEach((controller) => expect(controller).not.toHaveBeenCalled());
    });

    it("answers 403 to a first-login hiker on a staff-only route", async () => {
        // Why: api.md - blocked with 403 (the message may be the role one)
        currentUser = FIRST_LOGIN_HIKER;

        const res = await request(app).get("/accounts?name=Mario");

        expect(res.status).toBe(403);
        expect(searchStaffHikers).not.toHaveBeenCalled();
    });

    it("still answers 401 to a visitor, not 403", async () => {
        // Why: api.md - 401 if not authenticated
        const res = await request(app).get("/reservations");

        expect(res.status).toBe(401);
    });

    it("lets the same accounts through once the password has been changed", async () => {
        // Why: the block lasts only until the change
        currentUser = user("hiker", false);
        const hikerRes = await request(app).get("/reservations");
        currentUser = user("employee", false);
        const staffRes = await request(app).get("/accounts?name=Mario");

        expect(hikerRes.status).toBe(200);
        expect(staffRes.status).toBe(200);
        expect(getReservations).toHaveBeenCalledExactlyOnceWith(ACCOUNT_ID);
        expect(searchStaffHikers).toHaveBeenCalledTimes(1);
    });
});

describe("PUT /accounts/current/password — route", () => {
    const URL = "/accounts/current/password";

    describe("access control", () => {
        it("answers 401 to a visitor and skips the controller", async () => {
            // Why: api.md - authentication required
            const res = await request(app).put(URL).send(CHANGE_BODY);

            expect(res.status).toBe(401);
            expect(res.body).toMatchObject({ code: 401, name: "UnauthorizedError" });
            expect(changePassword).not.toHaveBeenCalled();
        });

        it("answers 401 to a visitor even with an invalid body", async () => {
            // Why: the login check comes before the validation
            const res = await request(app).put(URL).send({});

            expect(res.status).toBe(401);
        });

        it.each([
            { label: "a first-login hiker", account: FIRST_LOGIN_HIKER },
            { label: "a first-login employee", account: FIRST_LOGIN_EMPLOYEE },
            { label: "a first-login warden", account: FIRST_LOGIN_WARDEN },
            { label: "a hiker who already changed the password", account: user("hiker", false) },
        ])("lets $label change the password", async ({ account }) => {
            // Why: api.md - allowed even while must_change_password is true
            currentUser = account;

            const res = await request(app).put(URL).send(CHANGE_BODY);

            expect(res.status).toBe(200);
            expect(changePassword).toHaveBeenCalledTimes(1);
        });
    });

    describe("validation", () => {
        it.each([
            { label: "an empty body", body: {} },
            { label: "a missing current password", body: { new_password: NEW_PASSWORD } },
            { label: "an empty current password", body: { current_password: "", new_password: NEW_PASSWORD } },
            { label: "a missing new password", body: { current_password: CURRENT } },
            { label: "a new password of 7 characters", body: { current_password: CURRENT, new_password: "p".repeat(7) } },
            { label: "a new password of 129 characters", body: { current_password: CURRENT, new_password: "p".repeat(129) } },
            { label: "a new password equal to the current one", body: { current_password: NEW_PASSWORD, new_password: NEW_PASSWORD } },
        ])("answers 400 and skips the controller for $label", async ({ body }) => {
            // Why: api.md - 400 for missing or invalid request fields
            currentUser = FIRST_LOGIN_HIKER;

            const res = await request(app).put(URL).send(body);

            expect(res.status).toBe(400);
            expect(res.body).toMatchObject({ code: 400, name: "BadRequestError", message: expect.any(String) });
            expect(changePassword).not.toHaveBeenCalled();
        });

        it("names the new_password field when the new password equals the current one", async () => {
            currentUser = FIRST_LOGIN_HIKER;

            const res = await request(app).put(URL).send({ current_password: NEW_PASSWORD, new_password: NEW_PASSWORD });

            expect(res.body.message).toMatch(/^new_password:/);
        });

        it("keeps the first-login flag in the session when the body is invalid", async () => {
            // Why: nothing changed, the account must stay blocked
            currentUser = FIRST_LOGIN_HIKER;

            await request(app).put(URL).send({});

            expect(currentUser.must_change_password).toBe(true);
        });
    });

    describe("controller call and session", () => {
        it("calls the controller with the logged-in account id and the validated body", async () => {
            // Why: only the logged-in account can be changed, extra fields are dropped
            currentUser = FIRST_LOGIN_HIKER;

            await request(app).put(URL).send({ ...CHANGE_BODY, must_change_password: false, id: 99 });

            expect(changePassword).toHaveBeenCalledExactlyOnceWith(ACCOUNT_ID, CHANGE_BODY);
        });

        it("answers 200 with id, email, role and must_change_password false", async () => {
            // Why: api.md - 200 returns id, email, role and must_change_password (false)
            currentUser = FIRST_LOGIN_HIKER;

            const res = await request(app).put(URL).send(CHANGE_BODY);

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ id: ACCOUNT_ID, email: EMAIL, role: "hiker", must_change_password: false });
            expect(errorService.sendAppError).not.toHaveBeenCalled();
        });

        it("clears the flag in the current session too", async () => {
            // Why: api.md - the change clears the flag (also in the current session)
            currentUser = FIRST_LOGIN_HIKER;

            await request(app).put(URL).send(CHANGE_BODY);

            expect(currentUser.must_change_password).toBe(false);
        });

        it("unblocks the other routes in the same session right after the change", async () => {
            // Why: requirement - after the forced change the hiker can use the app again
            currentUser = FIRST_LOGIN_HIKER;
            const before = await request(app).get("/reservations");

            await request(app).put(URL).send(CHANGE_BODY);
            const after = await request(app).get("/reservations");

            expect(before.status).toBe(403);
            expect(after.status).toBe(200);
        });
    });

    describe("controller errors", () => {
        it("answers 401 with the error format when the current password is wrong", async () => {
            // Why: api.md - 401 if current_password is wrong
            currentUser = FIRST_LOGIN_HIKER;
            const error = new UnauthorizedError("Current password is incorrect");
            vi.mocked(changePassword).mockImplementation(() => {
                throw error;
            });

            const res = await request(app).put(URL).send(CHANGE_BODY);

            expect(res.status).toBe(401);
            expect(res.body).toEqual({ code: 401, name: error.name, message: error.message });
            expect(currentUser.must_change_password).toBe(true);
        });

        it("answers 500 without leaking the message of an unexpected error", async () => {
            // Why: internal details (e.g. SQL errors) must never reach the client
            vi.spyOn(console, "error").mockImplementation(() => undefined);
            currentUser = FIRST_LOGIN_HIKER;
            const error = new Error("SQLITE_BUSY: secret details");
            vi.mocked(changePassword).mockImplementation(() => {
                throw error;
            });

            const res = await request(app).put(URL).send(CHANGE_BODY);

            expect(res.status).toBe(500);
            expect(res.body.code).toBe(500);
            expect(JSON.stringify(res.body)).not.toContain("SQLITE_BUSY");
            expect(errorService.sendAppError).toHaveBeenCalledExactlyOnceWith(error, expect.any(Object));
        });
    });
});

describe("POST /accounts/password-reset — route", () => {
    const URL = "/accounts/password-reset";

    it("answers 202 with an empty body to a visitor and passes the lowercased email", async () => {
        // Why: api.md - no authentication; the email is case-insensitive
        const res = await request(app).post(URL).send({ email: " Anna.Neri@MountainHut.TEST " });

        expect(res.status).toBe(202);
        expect(res.text).toBe("");
        expect(requestPasswordReset).toHaveBeenCalledExactlyOnceWith(EMAIL);
    });

    it("also works for a first-login hiker who is logged in", async () => {
        // Why: requirement - in any case the hiker can recover the password via email
        currentUser = FIRST_LOGIN_HIKER;

        const res = await request(app).post(URL).send({ email: EMAIL });

        expect(res.status).toBe(202);
    });

    it("gives the same answer for a registered and an unregistered email", async () => {
        // Why: api.md - the endpoint does not reveal which addresses have an account
        const known = await request(app).post(URL).send({ email: EMAIL });
        const unknown = await request(app).post(URL).send({ email: "nobody@mountainhut.test" });

        expect(unknown.status).toBe(known.status);
        expect(unknown.text).toBe(known.text);
        expect(unknown.status).toBe(202);
    });

    it.each([
        { label: "a missing email", body: {} },
        { label: "an invalid email", body: { email: "anna@" } },
    ])("answers 400 and skips the controller for $label", async ({ body }) => {
        // Why: api.md - 400 for a missing or invalid email
        const res = await request(app).post(URL).send(body);

        expect(res.status).toBe(400);
        expect(res.body).toMatchObject({ code: 400, name: "BadRequestError" });
        expect(res.body.message).toMatch(/^email:/);
        expect(requestPasswordReset).not.toHaveBeenCalled();
    });

    it("answers 500 without leaking the message of an unexpected error", async () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        vi.mocked(requestPasswordReset).mockImplementation(() => {
            throw new Error("SQLITE_BUSY: secret details");
        });

        const res = await request(app).post(URL).send({ email: EMAIL });

        expect(res.status).toBe(500);
        expect(JSON.stringify(res.body)).not.toContain("SQLITE_BUSY");
    });
});

describe("POST /accounts/password-reset/confirm — route", () => {
    const URL = "/accounts/password-reset/confirm";
    const BODY = { token: "plain-reset-token", new_password: NEW_PASSWORD };

    it("answers 204 to a visitor and passes the token and the new password", async () => {
        // Why: api.md - no authentication; 204 when the password is changed
        const res = await request(app).post(URL).send(BODY);

        expect(res.status).toBe(204);
        expect(resetPassword).toHaveBeenCalledExactlyOnceWith(BODY);
    });

    it("answers 400 with the error format for an invalid or expired link", async () => {
        // Why: api.md - 400 if the token is unknown, already used, replaced or expired
        const error = new BadRequestError("Invalid or expired reset link");
        vi.mocked(resetPassword).mockImplementation(() => {
            throw error;
        });

        const res = await request(app).post(URL).send(BODY);

        expect(res.status).toBe(400);
        expect(res.body).toEqual({ code: 400, name: error.name, message: error.message });
    });

    it.each([
        { label: "a missing token", body: { new_password: NEW_PASSWORD } },
        { label: "a missing new password", body: { token: "plain-reset-token" } },
        { label: "a new password of 7 characters", body: { token: "plain-reset-token", new_password: "p".repeat(7) } },
        { label: "a new password of 129 characters", body: { token: "plain-reset-token", new_password: "p".repeat(129) } },
    ])("answers 400 and skips the controller for $label", async ({ body }) => {
        // Why: api.md - 400 for missing or invalid request fields
        const res = await request(app).post(URL).send(body);

        expect(res.status).toBe(400);
        expect(res.body).toMatchObject({ code: 400, name: "BadRequestError" });
        expect(resetPassword).not.toHaveBeenCalled();
    });

    it("answers 500 without leaking the message of an unexpected error", async () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        vi.mocked(resetPassword).mockImplementation(() => {
            throw new Error("SQLITE_BUSY: secret details");
        });

        const res = await request(app).post(URL).send(BODY);

        expect(res.status).toBe(500);
        expect(JSON.stringify(res.body)).not.toContain("SQLITE_BUSY");
    });
});
