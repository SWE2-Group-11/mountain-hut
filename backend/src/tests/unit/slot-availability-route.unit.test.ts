import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import slotRouter from "../../routes/slot-route";
import { getAvailability, getSlots } from "../../controllers/slot-controller";
import { sendAppError } from "../../services/error-service";
import { NotFoundError } from "../../models/errors/notfound-error";
import type { GetAvailabilityResponseDTO } from "../../models/dto/slot-dto";


// The route is tested on its own: the controller is replaced by fakes, so no database is needed
vi.mock("../../controllers/slot-controller", () => ({
    getSlots: vi.fn(),
    getConfigurations: vi.fn(),
    createSlot: vi.fn(),
    getAvailability: vi.fn(),
}));

const URL = "/slots/availability";
const DAY = "2030-06-15";
// Query values always arrive as strings, like in a real request
const QUERY = { date: DAY, slot: "12:00", partySize: "4" };
// What the route should pass on: the same fields, with partySize turned into a number
const PARSED_QUERY = { date: DAY, slot: "12:00", partySize: 4 };
const ONE_TABLE: GetAvailabilityResponseDTO = { available: [{ tableId: 2, assignedSeats: 4 }] };
const STRICT_PARTY_SIZE_MESSAGE = "partySize: partySize must be a positive integer";

// Minimal app: the router and the error format are the real ones
const app = express();
app.use("/slots", slotRouter);
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    sendAppError(err, res);
});

beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getAvailability).mockReturnValue(ONE_TABLE);
});

describe("GET /slots/availability — route", () => {
    describe("successful request", () => {
        // Why: checking availability is public, so no login or session is needed
        it("is public: it answers 200 without any login", async () => {
            // Arrange: the app has no session at all

            // Act
            const res = await request(app).get(URL).query(QUERY);

            // Assert
            expect(res.status).toBe(200);
        });

        // Why: the route must hand the validated query to the controller, with partySize as a number
        it("calls the controller once with the parsed query, with partySize as a number", async () => {
            // Arrange: default mock from beforeEach

            // Act
            await request(app).get(URL).query(QUERY);

            // Assert
            expect(getAvailability).toHaveBeenCalledTimes(1);
            expect(getAvailability).toHaveBeenCalledWith(PARSED_QUERY);
        });

        // Why: the route must not change the controller's answer, whether the party fits at one table or is split
        it.each([
            { label: "one table", response: ONE_TABLE },
            {
                label: "a party split over several tables",
                response: { available: [{ tableId: 2, assignedSeats: 4 }, { tableId: 1, assignedSeats: 3 }] },
            },
        ])("answers 200 with what the controller returns for $label", async ({ response }) => {
            // Arrange
            vi.mocked(getAvailability).mockReturnValue(response);

            // Act
            const res = await request(app).get(URL).query(QUERY);

            // Assert
            expect(res.status).toBe(200);
            expect(res.body).toEqual(response);
        });

        // Why: "the party cannot be seated" and "the slot is closed" are normal answers (an empty list), not errors
        it("answers 200 with an empty list when the controller finds no arrangement", async () => {
            // Arrange
            vi.mocked(getAvailability).mockReturnValue({ available: [] });

            // Act
            const res = await request(app).get(URL).query(QUERY);

            // Assert
            expect(res.status).toBe(200);
            expect(res.body).toEqual({ available: [] });
        });

        // Why: unknown parameters must not reach the controller
        it("passes only the three known fields to the controller and ignores other parameters", async () => {
            // Arrange
            const query = { ...QUERY, extra: "x", hiker_id: "1" };

            // Act
            await request(app).get(URL).query(query);

            // Assert
            expect(getAvailability).toHaveBeenCalledWith(PARSED_QUERY);
        });
    });

    describe("validation", () => {
        // Why: invalid input must be stopped by the route with a 400, before the controller is called
        it.each([
            { label: "a missing date", query: `slot=12:00&partySize=4` },
            { label: "a missing slot", query: `date=${DAY}&partySize=4` },
            { label: "a missing party size", query: `date=${DAY}&slot=12:00` },
            { label: "no parameters at all", query: `` },
            { label: "a date that does not exist", query: `date=2030-02-30&slot=12:00&partySize=4` },
            { label: "a date with a wrong format", query: `date=15-06-2030&slot=12:00&partySize=4` },
            { label: "a time that does not exist", query: `date=${DAY}&slot=24:00&partySize=4` },
            { label: "a time without a leading zero", query: `date=${DAY}&slot=9:30&partySize=4` },
            { label: "a party size of 0", query: `date=${DAY}&slot=12:00&partySize=0` },
            { label: "a negative party size", query: `date=${DAY}&slot=12:00&partySize=-1` },
            { label: "a decimal party size", query: `date=${DAY}&slot=12:00&partySize=2.5` },
            { label: "a party size sent as text", query: `date=${DAY}&slot=12:00&partySize=abc` },
            { label: "an empty party size", query: `date=${DAY}&slot=12:00&partySize=` },
            { label: "a repeated date", query: `date=${DAY}&date=2030-06-16&slot=12:00&partySize=4` },
            { label: "a repeated party size", query: `date=${DAY}&slot=12:00&partySize=2&partySize=3` },
        ])("answers 400 and skips the controller for $label", async ({ query }) => {
            // Arrange: the query string is written by hand so repeated parameters are sent as they are

            // Act
            const res = await request(app).get(`${URL}?${query}`);

            // Assert
            expect(res.status).toBe(400);
            expect(res.body).toMatchObject({ code: 400, name: "BadRequestError", message: expect.any(String) });
            expect(getAvailability).not.toHaveBeenCalled();
        });

        // Why: the 400 message starts with the name of the wrong field, so the user knows what to fix
        it("names the wrong field at the start of the 400 message", async () => {
            // Arrange
            const query = { date: DAY, slot: "12:00" };

            // Act
            const res = await request(app).get(URL).query(query);

            // Assert
            expect(res.status).toBe(400);
            expect(res.body.message.startsWith("partySize: ")).toBe(true);
        });

        // Why: only plain digits are a valid party size; these values look like numbers to JavaScript but are rejected
        it.each([
            { label: "a hexadecimal number", partySize: "0x10" },
            { label: "scientific notation", partySize: "1e2" },
            { label: "a number with spaces around it", partySize: " 7 " },
        ])("answers 400 with a clear message for $label", async ({ partySize }) => {
            // Arrange
            const query = { ...QUERY, partySize };

            // Act
            const res = await request(app).get(URL).query(query);

            // Assert
            expect(res.status).toBe(400);
            expect(res.body).toEqual({ code: 400, name: "BadRequestError", message: STRICT_PARTY_SIZE_MESSAGE });
            expect(getAvailability).not.toHaveBeenCalled();
        });
    });

    describe("controller errors", () => {
        // Why: an unknown slot is reported by the controller and must reach the client as a 404 in the error format
        it("answers 404 with the error format when the slot does not exist", async () => {
            // Arrange
            vi.mocked(getAvailability).mockImplementation(() => {
                throw new NotFoundError("Slot not found");
            });

            // Act
            const res = await request(app).get(URL).query(QUERY);

            // Assert
            expect(res.status).toBe(404);
            expect(res.body).toEqual({ code: 404, name: "NotFoundError", message: "Slot not found" });
        });

        // Why: an unexpected error (for example from the database) must give a 500 without showing its details
        it("answers 500 without leaking the message of an unexpected error", async () => {
            // Arrange
            vi.spyOn(console, "error").mockImplementation(() => undefined);
            vi.mocked(getAvailability).mockImplementation(() => {
                throw new Error("SQLITE_BUSY: secret details");
            });

            // Act
            const res = await request(app).get(URL).query(QUERY);

            // Assert
            expect(res.status).toBe(500);
            expect(res.body.code).toBe(500);
            expect(JSON.stringify(res.body)).not.toContain("SQLITE_BUSY");
        });
    });

    describe("routing", () => {
        // Why: "/availability" must reach its own handler and not be taken by the GET "/" (list of slots) route
        it("is not handled by the GET /slots route", async () => {
            // Arrange: default mocks from beforeEach

            // Act
            await request(app).get(URL).query(QUERY);

            // Assert
            expect(getAvailability).toHaveBeenCalledTimes(1);
            expect(getSlots).not.toHaveBeenCalled();
        });

        // Why: the endpoint exists only for GET; other methods must not run the availability check
        it("does not call the controller for a POST request", async () => {
            // Arrange: default mocks from beforeEach

            // Act
            const res = await request(app).post(URL).query(QUERY);

            // Assert
            expect(res.status).toBe(404);
            expect(getAvailability).not.toHaveBeenCalled();
        });
    });
});
