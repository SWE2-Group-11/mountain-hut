import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import accountRouter from "../../routes/account-route";
import { registerHiker } from "../../controllers/account-controller";
import { AccountResponseDTO } from "../../models/dto/account-dto";
import { ConflictError } from "../../models/errors/conflict-error";
import * as errorService from "../../services/error-service";

/*
UNIT tests for account-route.
Covered: POST /accounts (registration): access, validation, what the controller receives, the responses and the error format.
GET /accounts (hiker search) is covered in reserve-for-hiker-route.unit.test.ts.
Expected results come from docs/api.md. The controllers are mocked.
*/

vi.mock("../../controllers/account-controller", () => ({ registerHiker: vi.fn() }));
vi.mock("../../controllers/reservation-controller", () => ({ searchStaffHikers: vi.fn() }));
vi.mock("../../dao/account-dao", () => ({ getAccountByCredentials: vi.fn() }));

const URL = "/accounts";
const HIKER = { id: 7, email: "mario@mountainhut.test", role: "hiker" } as Express.User;
const EMPLOYEE = { id: 2, email: "employee@mountainhut.test", role: "employee" } as Express.User;
const WARDEN = { id: 1, email: "warden@mountainhut.test", role: "warden" } as Express.User;

const VALID_BODY = {
    fullname: "Anna Neri",
    mobile_number: "+39 333 444 5555",
    email: "anna.neri@mountainhut.test",
    password: "secret-pass",
    notes: "Arrives late",
    emergency_contact: "Luca Neri +39 333 000 0000",
};
const CREATED = new AccountResponseDTO(11, VALID_BODY.email, "hiker", false);

// Who is logged in for the current test (undefined = nobody)
let currentUser: Express.User | undefined;

// Minimal app: the session is replaced by currentUser, the router and the error format are the real ones
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
    req.isAuthenticated = (() => currentUser !== undefined) as typeof req.isAuthenticated;
    req.user = currentUser;
    next();
});
app.use(URL, accountRouter);

beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(errorService, "sendAppError");
    currentUser = undefined;
    vi.mocked(registerHiker).mockReturnValue(CREATED);
});

afterEach(() => vi.resetAllMocks());

describe("POST /accounts — route", () => {
    describe("access control", () => {
        it.each([
            { label: "a visitor", user: undefined },
            { label: "a hiker", user: HIKER },
            { label: "an employee", user: EMPLOYEE },
            { label: "a warden", user: WARDEN },
        ])("lets $label register", async ({ user }) => {
            // Why: api.md says the registration needs no authentication
            currentUser = user;

            const res = await request(app).post(URL).send(VALID_BODY);

            expect(res.status).toBe(201);
            expect(registerHiker).toHaveBeenCalledTimes(1);
        });
    });

    describe("validation", () => {
        it.each([
            { label: "an empty body", body: {} },
            { label: "a missing fullname", body: { ...VALID_BODY, fullname: undefined } },
            { label: "a blank fullname", body: { ...VALID_BODY, fullname: "   " } },
            { label: "a missing mobile number", body: { ...VALID_BODY, mobile_number: undefined } },
            { label: "a blank mobile number", body: { ...VALID_BODY, mobile_number: " " } },
            { label: "a missing email", body: { ...VALID_BODY, email: undefined } },
            { label: "an invalid email", body: { ...VALID_BODY, email: "anna@" } },
            { label: "a missing password", body: { ...VALID_BODY, password: undefined } },
            { label: "an empty password", body: { ...VALID_BODY, password: "" } },
            { label: "notes longer than 200 characters", body: { ...VALID_BODY, notes: "a".repeat(201) } },
            { label: "an emergency contact longer than 200 characters", body: { ...VALID_BODY, emergency_contact: "a".repeat(201) } },
            { label: "null notes", body: { ...VALID_BODY, notes: null } },
        ])("answers 400 and skips the controller for $label", async ({ body }) => {
            const res = await request(app).post(URL).send(body);

            expect(res.status).toBe(400);
            expect(res.body).toMatchObject({ code: 400, name: "BadRequestError", message: expect.any(String) });
            expect(registerHiker).not.toHaveBeenCalled();
        });

        it("names the invalid field in the message", async () => {
            const res = await request(app).post(URL).send({ ...VALID_BODY, email: "anna" });

            expect(res.body.message).toMatch(/^email:/);
        });
    });

    describe("controller call", () => {
        it("calls the controller once with the validated body", async () => {
            await request(app).post(URL).send(VALID_BODY);

            expect(registerHiker).toHaveBeenCalledExactlyOnceWith(VALID_BODY);
        });

        it("passes the trimmed fields and the lowercased email to the controller", async () => {
            await request(app).post(URL).send({
                ...VALID_BODY,
                fullname: "  Anna Neri ",
                email: " Anna.Neri@MountainHut.TEST ",
            });

            expect(registerHiker).toHaveBeenCalledExactlyOnceWith(VALID_BODY);
        });

        it("drops the fields that are not in the schema, such as role", async () => {
            // Why: a visitor must not be able to register as staff
            await request(app).post(URL).send({ ...VALID_BODY, role: "warden", must_change_password: true });

            expect(registerHiker).toHaveBeenCalledExactlyOnceWith(VALID_BODY);
        });

        it("answers 201 with what the controller returns", async () => {
            const res = await request(app).post(URL).send(VALID_BODY);

            expect(res.status).toBe(201);
            expect(res.body).toEqual({
                id: 11,
                email: VALID_BODY.email,
                role: "hiker",
                must_change_password: false,
            });
            expect(errorService.sendAppError).not.toHaveBeenCalled();
        });
    });

    describe("controller errors", () => {
        it("answers 409 with the error format when the email is already registered", async () => {
            const error = new ConflictError("An account with this email already exists");
            vi.mocked(registerHiker).mockImplementation(() => {
                throw error;
            });

            const res = await request(app).post(URL).send(VALID_BODY);

            expect(res.status).toBe(409);
            expect(res.body).toEqual({ code: 409, name: error.name, message: error.message });
            expect(errorService.sendAppError).toHaveBeenCalledExactlyOnceWith(error, expect.any(Object));
        });

        it("answers 500 without leaking the message of an unexpected error", async () => {
            // Why: internal details (e.g. SQL errors) must never reach the client
            vi.spyOn(console, "error").mockImplementation(() => undefined);
            const error = new Error("SQLITE_BUSY: secret details");
            vi.mocked(registerHiker).mockImplementation(() => {
                throw error;
            });

            const res = await request(app).post(URL).send(VALID_BODY);

            expect(res.status).toBe(500);
            expect(res.body.code).toBe(500);
            expect(JSON.stringify(res.body)).not.toContain("SQLITE_BUSY");
            expect(errorService.sendAppError).toHaveBeenCalledExactlyOnceWith(error, expect.any(Object));
        });
    });
});