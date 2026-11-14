import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import reservationRouter from "../../routes/reservation-route";
import { 
    createReservation, 
    getReservations, 
    updateReservation 
} from "../../controllers/reservation-controller";
import { BadRequestError } from "../../models/errors/badrequest-error";
import { ConflictError } from "../../models/errors/conflict-error";
import { ForbiddenError } from "../../models/errors/forbidden-error";
import { NotFoundError } from "../../models/errors/notfound-error";
import type { CreateReservationResponseDTO } from "../../models/dto/reservation-dto";
import * as errorService from "../../services/error-service";


vi.mock("../../controllers/reservation-controller", () => ({ 
    createReservation: vi.fn(), 
    getReservations: vi.fn(), 
    updateReservation: vi.fn() 
}));
vi.mock("../../dao/account-dao", () => ({ getAccountByCredentials: vi.fn() }));

const URL = "/reservations";
const HIKER_ID = 7;
const HIKER = { id: HIKER_ID, email: "mario@mountainhut.test", role: "hiker" } as Express.User;
const EMPLOYEE = { id: 2, email: "employee@mountainhut.test", role: "employee" } as Express.User;
const WARDEN = { id: 1, email: "warden@mountainhut.test", role: "warden" } as Express.User;

const VALID_BODY = { date: "2030-06-15", slot: "12:00", partySize: 4 };
const CREATED: CreateReservationResponseDTO = {
    id: 42,
    date: "2030-06-15",
    slot: "12:00",
    partySize: 4,
    seatings: [{ table_number: 1, assigned_seats: 4 }],
    requirements: [{ hasAllergies: true, details: "No peanuts" }]
};

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
app.use(URL, reservationRouter);

beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(errorService, "sendAppError");;
    currentUser = HIKER;
    vi.mocked(createReservation).mockReturnValue(CREATED);
    vi.mocked(getReservations).mockReturnValue([]);
    vi.mocked(updateReservation).mockReturnValue(CREATED);
});

afterEach(() => vi.resetAllMocks());

describe("POST /reservations — route", () => {
    describe("access control", () => {
        it("answers 401 and skips the controller when nobody is logged in", async () => {
            currentUser = undefined;

            const res = await request(app).post(URL).send(VALID_BODY);

            expect(res.status).toBe(401);
            expect(res.body).toMatchObject({ code: 401 });
            expect(createReservation).not.toHaveBeenCalled();
        });

        it.each([
            { label: "an employee", user: EMPLOYEE },
            { label: "a warden", user: WARDEN },
        ])("answers 403 and skips the controller for $label", async ({ user }) => {
            currentUser = user;

            const res = await request(app).post(URL).send(VALID_BODY);

            expect(res.status).toBe(403);
            expect(res.body).toMatchObject({ code: 403 });
            expect(createReservation).not.toHaveBeenCalled();
        });
    });

    describe("validation", () => {
        it.each([
            { label: "a missing party size", body: { date: "2030-06-15", slot: "12:00" } },
            { label: "a party size of 0", body: { ...VALID_BODY, partySize: 0 } },
            { label: "a negative party size", body: { ...VALID_BODY, partySize: -2 } },
            { label: "a decimal party size", body: { ...VALID_BODY, partySize: 1.5 } },
            { label: "a party size sent as text", body: { ...VALID_BODY, partySize: "4" } },
            { label: "a missing date", body: { slot: "12:00", partySize: 4 } },
            { label: "a date that does not exist", body: { ...VALID_BODY, date: "2030-02-30" } },
            { label: "a missing time", body: { date: "2030-06-15", partySize: 4 } },
            { label: "a time with a wrong format", body: { ...VALID_BODY, slot: "25:00" } },
        ])("answers 400 and skips the controller for $label", async ({ body }) => {
            const res = await request(app).post(URL).send(body);

            expect(res.status).toBe(400);
            expect(res.body).toMatchObject({ code: 400, message: expect.any(String) });
            expect(createReservation).not.toHaveBeenCalled();
        });
    });

    describe("controller call", () => {
        it("calls the controller once with the id of the logged-in hiker and the request", async () => {
            await request(app).post(URL).send(VALID_BODY);

            expect(createReservation).toHaveBeenCalledTimes(1);
            expect(createReservation).toHaveBeenCalledWith(HIKER_ID, VALID_BODY);
        });

        it("passes only the validated fields to the controller", async () => {
            await request(app).post(URL).send({ ...VALID_BODY, hikerId: 99 });

            expect(createReservation).toHaveBeenCalledWith(HIKER_ID, VALID_BODY);
        });

        it("answers 201 with what the controller returns", async () => {
            const res = await request(app).post(URL).send(VALID_BODY);

            expect(res.status).toBe(201);
            expect(res.body).toEqual(CREATED);
            expect(errorService.sendAppError).not.toHaveBeenCalled();
        });
    });

    describe("controller errors", () => {
        it.each([
            { label: "BadRequestError", error: new BadRequestError("The selected date and time are not available"), code: 400 },
            { label: "ConflictError", error: new ConflictError("The requested capacity is no longer available"), code: 409 },
        ])("answers $code with the error format for a $label", async ({ error, code }) => {
            vi.mocked(createReservation).mockImplementation(() => {
                throw error;
            });

            const res = await request(app).post(URL).send(VALID_BODY);

            expect(res.status).toBe(code);
            expect(res.body).toEqual({ code, name: error.name, message: error.message });
            expect(errorService.sendAppError).toHaveBeenCalledExactlyOnceWith(error, expect.any(Object));
        });

        it("answers 500 without leaking the message of an unexpected error", async () => {
            vi.spyOn(console, "error").mockImplementation(() => undefined);

            const error = new Error("SQLITE_BUSY: secret details");

            vi.mocked(createReservation).mockImplementation(() => {
                throw error;
            });

            const res = await request(app).post(URL).send(VALID_BODY);

            expect(errorService.sendAppError)
                .toHaveBeenCalledExactlyOnceWith(error, expect.any(Object));

            expect(res.status).toBe(500);
            expect(res.body.code).toBe(500);
            expect(JSON.stringify(res.body)).not.toContain("SQLITE_BUSY");
        });
    });
});

describe("GET /reservations — route", () => {
    it.each([
        { label: "visitor", user: undefined, code: 401 },
        { label: "employee", user: EMPLOYEE, code: 403 },
        { label: "warden", user: WARDEN, code: 403 },
    ])("answers $code for a $label", async ({ user, code }) => {
        currentUser = user;

        const res = await request(app).get(URL);

        expect(res.status).toBe(code);
        expect(getReservations).not.toHaveBeenCalled();
    });

    it.each([
        { label: "reservations", reservations: [CREATED] },
        { label: "an empty list", reservations: [] },
    ])("returns $label from the controller", async ({ reservations }) => {
        vi.mocked(getReservations).mockReturnValue(reservations);

        const res = await request(app).get(URL);

        expect(getReservations).toHaveBeenCalledExactlyOnceWith(HIKER_ID);
        expect(res.status).toBe(200);
        expect(res.body).toEqual(reservations);
    });

    it("answers 500 without exposing internal errors", async () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);

        const error = new Error("private SQL details");

        vi.mocked(getReservations).mockImplementation(() => {
            throw error;
        });

        const res = await request(app).get(URL);

        expect(res.status).toBe(500);
        expect(res.body.code).toBe(500);
        expect(JSON.stringify(res.body)).not.toContain(error.message);
        expect(errorService.sendAppError).toHaveBeenCalledExactlyOnceWith(error, expect.any(Object));
    });
});

describe("PATCH /reservations/:reservationId — route", () => {
    it.each([
        { label: "visitor", user: undefined, code: 401 },
        { label: "employee", user: EMPLOYEE, code: 403 },
        { label: "warden", user: WARDEN, code: 403 },
    ])("checks access before validation for a $label",
        async ({ user, code }) => {
            currentUser = user;

            const res = await request(app)
                .patch(`${URL}/invalid`)
                .send({});

            expect(res.status).toBe(code);
            expect(updateReservation).not.toHaveBeenCalled();
        }
    );

    it.each(["abc", "0", "-1", "1.5"])(
        "rejects invalid reservation ID %s",
        async (id) => {
            const res = await request(app)
                .patch(`${URL}/${id}`)
                .send({ partySize: 4 });

            expect(res.status).toBe(400);
            expect(updateReservation).not.toHaveBeenCalled();
        }
    );

    it.each([
        {},
        { hikerId: 99 },
        { partySize: 0 },
        { partySize: null },
        { date: "2030-02-30" },
        { slot: "25:00" },
        { requirements: [{ hasAllergies: true, details: "  " }] },
    ])("rejects invalid body %j", async (body) => {
        const res = await request(app)
            .patch(`${URL}/42`)
            .send(body);

        expect(res.status).toBe(400);
        expect(updateReservation).not.toHaveBeenCalled();
    });

    it("uses the session hiker, converts the ID and strips unknown fields",
        async () => {
            const res = await request(app)
                .patch(`${URL}/42`)
                .send({ partySize: 4, hikerId: 99 });

            expect(updateReservation).toHaveBeenCalledExactlyOnceWith(
                HIKER_ID,
                42,
                { partySize: 4 }
            );
            expect(res.status).toBe(200);
            expect(res.body).toEqual(CREATED);
        }
    );

    it("accepts an empty requirements array", async () => {
        const updated = { ...CREATED, requirements: [] };
        vi.mocked(updateReservation).mockReturnValue(updated);

        const res = await request(app)
            .patch(`${URL}/42`)
            .send({ requirements: [] });

        expect(updateReservation).toHaveBeenCalledExactlyOnceWith(
            HIKER_ID,
            42,
            { requirements: [] }
        );
        expect(res.status).toBe(200);
        expect(res.body).toEqual(updated);
    });

    it.each([
        new BadRequestError("Changes are no longer allowed"),
        new ForbiddenError("The reservation belongs to another user"),
        new NotFoundError("Reservation not found"),
        new ConflictError("Insufficient capacity"),
    ])("maps controller error %s to its HTTP response", async (error) => {
        vi.mocked(updateReservation).mockImplementation(() => {
            throw error;
        });

        const res = await request(app)
            .patch(`${URL}/42`)
            .send({ partySize: 4 });

        expect(res.status).toBe(error.statusCode);
        expect(res.body).toEqual({
            code: error.statusCode,
            name: error.name,
            message: error.message,
        });
        expect(errorService.sendAppError)
            .toHaveBeenCalledExactlyOnceWith(error, expect.any(Object));
    });

    it("answers 500 without exposing internal errors", async () => {
        vi.spyOn(console, "error").mockImplementation(() => undefined);

        const error = new Error("private SQL details");

        vi.mocked(updateReservation).mockImplementation(() => {
            throw error;
        });

        const res = await request(app)
            .patch(`${URL}/42`)
            .send({ partySize: 4 });

        expect(res.status).toBe(500);
        expect(res.body.code).toBe(500);
        expect(JSON.stringify(res.body)).not.toContain(error.message);
    });
});