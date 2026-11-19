import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import reservationRouter from "../../routes/reservation-route";
import { cancelReservation } from "../../controllers/reservation-controller";
import { ConflictError } from "../../models/errors/conflict-error";
import { ForbiddenError } from "../../models/errors/forbidden-error";
import { NotFoundError } from "../../models/errors/notfound-error";
import * as errorService from "../../services/error-service";

// Only the controller is replaced: requireRole, validateParams and the error format stay real
vi.mock("../../controllers/reservation-controller", () => ({
    cancelReservation: vi.fn(),
    createReservation: vi.fn(),
    createStaffReservation: vi.fn(),
    getReservations: vi.fn(),
    updateReservation: vi.fn(),
}));
vi.mock("../../dao/account-dao", () => ({ getAccountByCredentials: vi.fn() }));

const URL = "/reservations";
const RESERVATION_ID = 42;
const HIKER_ID = 7;
const HIKER = { id: HIKER_ID, email: "mario@mountainhut.test", role: "hiker" } as Express.User;
const EMPLOYEE = { id: 2, email: "employee@mountainhut.test", role: "employee" } as Express.User;
const WARDEN = { id: 1, email: "warden@mountainhut.test", role: "warden" } as Express.User;

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
    vi.spyOn(errorService, "sendAppError");
    currentUser = HIKER;
});

afterEach(() => vi.restoreAllMocks());

describe("DELETE /reservations/:reservationId — route", () => {
    describe("access control", () => {
        // Only a logged-in hiker may cancel (api.md). An invalid id is used on purpose:
        // the answer must still be 401/403, which proves access is checked before validation.
        it.each([
            { label: "a visitor who is not logged in", user: undefined, code: 401 },
            { label: "an employee", user: EMPLOYEE, code: 403 },
            { label: "a warden", user: WARDEN, code: 403 },
        ])("answers $code to $label before validating the id and does not cancel anything", async ({ user, code }) => {
            // Arrange
            currentUser = user;

            // Act
            const res = await request(app).delete(`${URL}/abc`);

            // Assert
            expect(res.status).toBe(code);
            expect(res.body).toMatchObject({ code, name: expect.any(String), message: expect.any(String) });
            expect(cancelReservation).not.toHaveBeenCalled();
        });
    });

    describe("validation", () => {
        // api.md: reservationId must be a positive integer, otherwise 400 and nothing is deleted
        it.each(["abc", "0", "-1", "1.5"])(
            "answers 400 and does not call the controller for the reservation id %s",
            async (id) => {
                // Arrange: the logged-in hiker from beforeEach

                // Act
                const res = await request(app).delete(`${URL}/${id}`);

                // Assert
                expect(res.status).toBe(400);
                expect(res.body).toMatchObject({ code: 400, name: expect.any(String), message: expect.any(String) });
                expect(cancelReservation).not.toHaveBeenCalled();
            }
        );
    });

    describe("successful cancellation", () => {
        // MH-08 / api.md: a hiker can cancel at any time and gets 204 with no body;
        // the id from the URL must reach the controller as a number, not as the string "42"
        it("answers 204 with an empty body and cancels the reservation once for the logged-in hiker", async () => {
            // Arrange: the controller returns nothing on success (default vi.fn())

            // Act
            const res = await request(app).delete(`${URL}/${RESERVATION_ID}`);

            // Assert
            expect(res.status).toBe(204);
            expect(res.text).toBe("");
            expect(res.body).toEqual({});
            expect(cancelReservation).toHaveBeenCalledExactlyOnceWith(HIKER_ID, RESERVATION_ID);
            expect(typeof vi.mocked(cancelReservation).mock.calls[0][0]).toBe("number");
            expect(typeof vi.mocked(cancelReservation).mock.calls[0][1]).toBe("number");
            expect(errorService.sendAppError).not.toHaveBeenCalled();
        });

        // A hiker must not be able to cancel for someone else by sending another id:
        // the owner is taken only from the session
        it("ignores a hikerId sent in the body and uses only the hiker from the session", async () => {
            // Arrange
            const body = { hikerId: 99 };

            // Act
            const res = await request(app).delete(`${URL}/${RESERVATION_ID}`).send(body);

            // Assert
            expect(res.status).toBe(204);
            expect(cancelReservation).toHaveBeenCalledExactlyOnceWith(HIKER_ID, RESERVATION_ID);
        });
    });

    describe("controller errors", () => {
        // api.md: 404 unknown reservation, 403 reservation of another hiker, 409 could not be cancelled;
        // each must come back in the shared {code,name,message} format through sendAppError
        it.each([
            { label: "NotFoundError", error: new NotFoundError("The reservation does not exist"), code: 404 },
            { label: "ForbiddenError", error: new ForbiddenError("This reservation does not belong to the authenticated hiker"), code: 403 },
            { label: "ConflictError", error: new ConflictError("The reservation could not be cancelled"), code: 409 },
        ])("answers $code in the error format when the controller throws a $label", async ({ error, code }) => {
            // Arrange
            vi.mocked(cancelReservation).mockImplementation(() => {
                throw error;
            });

            // Act
            const res = await request(app).delete(`${URL}/${RESERVATION_ID}`);

            // Assert
            expect(res.status).toBe(code);
            expect(res.body).toEqual({ code, name: error.name, message: error.message });
            expect(errorService.sendAppError).toHaveBeenCalledExactlyOnceWith(error, expect.any(Object));
        });

        // An unexpected failure must become a generic 500 and never expose internal details
        it("answers 500 without leaking the message of an unexpected error", async () => {
            // Arrange
            vi.spyOn(console, "error").mockImplementation(() => undefined);
            const error = new Error("private SQL details");
            vi.mocked(cancelReservation).mockImplementation(() => {
                throw error;
            });

            // Act
            const res = await request(app).delete(`${URL}/${RESERVATION_ID}`);

            // Assert
            expect(res.status).toBe(500);
            expect(res.body.code).toBe(500);
            expect(JSON.stringify(res.body)).not.toContain(error.message);
            expect(errorService.sendAppError).toHaveBeenCalledExactlyOnceWith(error, expect.any(Object));
        });
    });
});
