import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import slotRouter from "../../routes/slot-route";
import { createSlot, getConfigurations, getSlots } from "../../controllers/slot-controller";
import { sendAppError } from "../../services/error-service";
import { BadRequestError } from "../../models/errors/badrequest-error";
import { ConflictError } from "../../models/errors/conflict-error";
import { NotFoundError } from "../../models/errors/notfound-error";
import type { SlotConfigurationDTO, SlotDTO } from "../../models/dto/slot-dto";


vi.mock("../../controllers/slot-controller", () => ({
    getSlots: vi.fn(),
    getConfigurations: vi.fn(),
    createSlot: vi.fn(),
}));

// Stand-in for the role check: it answers 401/403 like the real one and records the roles each protected route asks for.
// It is not a vi.fn on purpose: the router calls requireRole only once, when it is loaded, and resetAllMocks would wipe it.
const auth = vi.hoisted(() => ({
    role: null as string | null, // role of the logged in user, null when nobody is logged in
    guards: [] as string[][],    // roles required by each protected route, in the order they are declared
}));

vi.mock("../../services/auth-service", () => ({
    requireRole: (...roles: string[]) => {
        auth.guards.push(roles);
        return (_req: express.Request, res: express.Response, next: express.NextFunction) => {
            if (auth.role === null) {
                return res.status(401).json({ code: 401, name: "UnauthorizedError", message: "Not authenticated" });
            }
            if (!roles.includes(auth.role)) {
                return res.status(403).json({ code: 403, name: "ForbiddenError", message: "Not allowed for this role" });
            }
            next();
        };
    },
}));

const URL = "/slots";
const CONFIGURATIONS_URL = `${URL}/configurations`;
const DAY = "2030-06-15";
const SLOTS: SlotDTO[] = [
    { date: DAY, start_time: "12:00", duration: 60, total_seats: 16, available_seats: 7 },
    { date: DAY, start_time: "19:30", duration: 90, total_seats: 16, available_seats: 12 },
];
const TABLES = [
    { tableNumber: 1, seats: 4 },
    { tableNumber: 2, seats: 6 },
];
const NEW_SLOT = { date: DAY, startTime: "12:00", endTime: "13:00", tables: TABLES };
const COPY_SLOT = { date: DAY, startTime: "13:00", endTime: "14:00", copyFrom: { date: "2030-06-14", startTime: "12:00" } };
const CONFIGURATION: SlotConfigurationDTO = { ...NEW_SLOT, totalSeats: 10 };
const CONFIGURATIONS: SlotConfigurationDTO[] = [
    CONFIGURATION,
    { date: DAY, startTime: "19:30", endTime: "21:00", tables: [{ tableNumber: 1, seats: 8 }], totalSeats: 8 },
];

// Minimal app: the router and the error format are the real ones
const app = express();
app.use(express.json());
app.use(URL, slotRouter);
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    sendAppError(err, res);
});

const actingAs = (role: string | null) => {
    auth.role = role;
};

beforeEach(() => {
    vi.resetAllMocks();
    actingAs(null);
    vi.mocked(getSlots).mockReturnValue(SLOTS);
    vi.mocked(getConfigurations).mockReturnValue(CONFIGURATIONS);
    vi.mocked(createSlot).mockReturnValue(CONFIGURATION);
});

describe("GET /slots — route", () => {
    describe("successful request", () => {
        it("is public: it answers 200 without any login", async () => {
            const res = await request(app).get(URL).query({ date: DAY });

            expect(res.status).toBe(200);
        });

        it("calls the controller once with the requested date", async () => {
            await request(app).get(URL).query({ date: DAY });

            expect(getSlots).toHaveBeenCalledTimes(1);
            expect(getSlots).toHaveBeenCalledWith({ date: DAY });
        });

        it("answers with what the controller returns", async () => {
            const res = await request(app).get(URL).query({ date: DAY });

            expect(res.body).toEqual(SLOTS);
        });

        it("answers [] when the controller finds no slots", async () => {
            vi.mocked(getSlots).mockReturnValue([]);

            const res = await request(app).get(URL).query({ date: DAY });

            expect(res.status).toBe(200);
            expect(res.body).toEqual([]);
        });

        it("passes only the date to the controller and ignores other parameters", async () => {
            await request(app).get(URL).query({ date: DAY, partySize: 4 });

            expect(getSlots).toHaveBeenCalledWith({ date: DAY });
        });
    });

    describe("validation", () => {
        it.each([
            { label: "a missing date", query: {} },
            { label: "a wrong format", query: { date: "15-06-2030" } },
            { label: "text", query: { date: "tomorrow" } },
            { label: "a date that does not exist", query: { date: "2030-02-30" } },
        ])("answers 400 and skips the controller for $label", async ({ query }) => {
            const res = await request(app).get(URL).query(query);

            expect(res.status).toBe(400);
            expect(res.body).toMatchObject({ code: 400, name: expect.any(String), message: expect.any(String) });
            expect(getSlots).not.toHaveBeenCalled();
        });
    });

    describe("controller errors", () => {
        it("maps an AppError to the error format", async () => {
            const error = new BadRequestError("Cannot read the slots");
            vi.mocked(getSlots).mockImplementation(() => {
                throw error;
            });

            const res = await request(app).get(URL).query({ date: DAY });

            expect(res.status).toBe(400);
            expect(res.body).toEqual({ code: 400, name: error.name, message: error.message });
        });

        it("answers 500 without leaking the message of an unexpected error", async () => {
            vi.spyOn(console, "error").mockImplementation(() => undefined);
            vi.mocked(getSlots).mockImplementation(() => {
                throw new Error("SQLITE_BUSY: secret details");
            });

            const res = await request(app).get(URL).query({ date: DAY });

            expect(res.status).toBe(500);
            expect(res.body.code).toBe(500);
            expect(JSON.stringify(res.body)).not.toContain("SQLITE_BUSY");
        });
    });
});

describe("slot-route — role guards", () => {
    it("protects the configurations and the creation of a slot with employee and warden", () => {
        expect(auth.guards).toEqual([
            ["employee", "warden"],
            ["employee", "warden"],
        ]);
    });
});

describe("GET /slots/configurations — route", () => {
    describe("access", () => {
        it("answers 401 and skips the controller when nobody is logged in", async () => {
            actingAs(null);

            const res = await request(app).get(CONFIGURATIONS_URL);

            expect(res.status).toBe(401);
            expect(getConfigurations).not.toHaveBeenCalled();
        });

        it("answers 403 and skips the controller for a hiker", async () => {
            actingAs("hiker");

            const res = await request(app).get(CONFIGURATIONS_URL);

            expect(res.status).toBe(403);
            expect(getConfigurations).not.toHaveBeenCalled();
        });

        it.each([{ role: "employee" }, { role: "warden" }])("answers 200 to a $role", async ({ role }) => {
            actingAs(role);

            const res = await request(app).get(CONFIGURATIONS_URL);

            expect(res.status).toBe(200);
        });

        it("checks the role before validating the query", async () => {
            actingAs("hiker");

            const res = await request(app).get(CONFIGURATIONS_URL).query({ limit: 0 });

            expect(res.status).toBe(403);
            expect(getConfigurations).not.toHaveBeenCalled();
        });
    });

    describe("successful request", () => {
        beforeEach(() => {
            actingAs("employee");
        });

        it("answers with what the controller returns", async () => {
            const res = await request(app).get(CONFIGURATIONS_URL);

            expect(res.status).toBe(200);
            expect(res.body).toEqual(CONFIGURATIONS);
        });

        it("answers [] when the controller finds no configurations", async () => {
            vi.mocked(getConfigurations).mockReturnValue([]);

            const res = await request(app).get(CONFIGURATIONS_URL);

            expect(res.status).toBe(200);
            expect(res.body).toEqual([]);
        });

        it("asks the controller for 20 configurations when no limit is given", async () => {
            await request(app).get(CONFIGURATIONS_URL);

            expect(getConfigurations).toHaveBeenCalledTimes(1);
            expect(getConfigurations).toHaveBeenCalledWith({ limit: 20 });
        });

        it("passes the date range and the limit to the controller, the limit as a number", async () => {
            await request(app).get(CONFIGURATIONS_URL).query({ from: "2030-06-01", to: "2030-06-30", limit: "5" });

            expect(getConfigurations).toHaveBeenCalledWith({ from: "2030-06-01", to: "2030-06-30", limit: 5 });
        });

        it("accepts a single bound of the date range", async () => {
            await request(app).get(CONFIGURATIONS_URL).query({ from: "2030-06-01" });

            expect(getConfigurations).toHaveBeenCalledWith({ from: "2030-06-01", limit: 20 });
        });

        it("accepts the same date as from and to", async () => {
            await request(app).get(CONFIGURATIONS_URL).query({ from: DAY, to: DAY });

            expect(getConfigurations).toHaveBeenCalledWith({ from: DAY, to: DAY, limit: 20 });
        });

        it("accepts the maximum limit of 100", async () => {
            const res = await request(app).get(CONFIGURATIONS_URL).query({ limit: 100 });

            expect(res.status).toBe(200);
            expect(getConfigurations).toHaveBeenCalledWith({ limit: 100 });
        });

        it("ignores unknown parameters", async () => {
            await request(app).get(CONFIGURATIONS_URL).query({ date: DAY, offset: 10 });

            expect(getConfigurations).toHaveBeenCalledWith({ limit: 20 });
        });
    });

    describe("validation", () => {
        beforeEach(() => {
            actingAs("employee");
        });

        it.each([
            { label: "from after to", query: { from: "2030-06-30", to: "2030-06-01" } },
            { label: "an invalid from", query: { from: "01-06-2030" } },
            { label: "a date that does not exist as to", query: { to: "2030-02-30" } },
            { label: "a limit of zero", query: { limit: 0 } },
            { label: "a negative limit", query: { limit: -1 } },
            { label: "a limit above 100", query: { limit: 101 } },
            { label: "a non numeric limit", query: { limit: "many" } },
            { label: "a non integer limit", query: { limit: 1.5 } },
        ])("answers 400 and skips the controller for $label", async ({ query }) => {
            const res = await request(app).get(CONFIGURATIONS_URL).query(query);

            expect(res.status).toBe(400);
            expect(res.body).toMatchObject({ code: 400, name: expect.any(String), message: expect.any(String) });
            expect(getConfigurations).not.toHaveBeenCalled();
        });
    });

    describe("controller errors", () => {
        beforeEach(() => {
            actingAs("employee");
        });

        it("maps an AppError to the error format", async () => {
            const error = new BadRequestError("Cannot read the configurations");
            vi.mocked(getConfigurations).mockImplementation(() => {
                throw error;
            });

            const res = await request(app).get(CONFIGURATIONS_URL);

            expect(res.status).toBe(400);
            expect(res.body).toEqual({ code: 400, name: error.name, message: error.message });
        });

        it("answers 500 without leaking the message of an unexpected error", async () => {
            vi.spyOn(console, "error").mockImplementation(() => undefined);
            vi.mocked(getConfigurations).mockImplementation(() => {
                throw new Error("SQLITE_BUSY: secret details");
            });

            const res = await request(app).get(CONFIGURATIONS_URL);

            expect(res.status).toBe(500);
            expect(res.body.code).toBe(500);
            expect(JSON.stringify(res.body)).not.toContain("SQLITE_BUSY");
        });
    });
});

describe("POST /slots — route", () => {
    describe("access", () => {
        it("answers 401 and skips the controller when nobody is logged in", async () => {
            actingAs(null);

            const res = await request(app).post(URL).send(NEW_SLOT);

            expect(res.status).toBe(401);
            expect(createSlot).not.toHaveBeenCalled();
        });

        it("answers 403 and skips the controller for a hiker", async () => {
            actingAs("hiker");

            const res = await request(app).post(URL).send(NEW_SLOT);

            expect(res.status).toBe(403);
            expect(createSlot).not.toHaveBeenCalled();
        });

        it.each([{ role: "employee" }, { role: "warden" }])("answers 201 to a $role", async ({ role }) => {
            actingAs(role);

            const res = await request(app).post(URL).send(NEW_SLOT);

            expect(res.status).toBe(201);
        });

        it("checks the role before validating the body", async () => {
            actingAs("hiker");

            const res = await request(app).post(URL).send({});

            expect(res.status).toBe(403);
            expect(createSlot).not.toHaveBeenCalled();
        });
    });

    describe("successful request", () => {
        beforeEach(() => {
            actingAs("employee");
        });

        it("answers 201 with the slot created by the controller", async () => {
            const res = await request(app).post(URL).send(NEW_SLOT);

            expect(res.status).toBe(201);
            expect(res.body).toEqual(CONFIGURATION);
        });

        it("calls the controller once with the validated body", async () => {
            await request(app).post(URL).send(NEW_SLOT);

            expect(createSlot).toHaveBeenCalledTimes(1);
            expect(createSlot).toHaveBeenCalledWith(NEW_SLOT);
        });

        it("passes the slot to copy from when no tables are given", async () => {
            await request(app).post(URL).send(COPY_SLOT);

            expect(createSlot).toHaveBeenCalledWith(COPY_SLOT);
        });

        it("does not pass unknown fields to the controller", async () => {
            await request(app).post(URL).send({ ...NEW_SLOT, role: "warden" });

            expect(createSlot).toHaveBeenCalledWith(NEW_SLOT);
        });
    });

    describe("validation", () => {
        beforeEach(() => {
            actingAs("employee");
        });

        it.each([
            { label: "an empty body", body: {} },
            { label: "a missing date", body: { ...NEW_SLOT, date: undefined } },
            { label: "a missing start time", body: { ...NEW_SLOT, startTime: undefined } },
            { label: "a missing end time", body: { ...NEW_SLOT, endTime: undefined } },
            { label: "a wrong date format", body: { ...NEW_SLOT, date: "15-06-2030" } },
            { label: "a date that does not exist", body: { ...NEW_SLOT, date: "2030-02-30" } },
            { label: "a start time without leading zero", body: { ...NEW_SLOT, startTime: "9:00" } },
            { label: "an hour out of range", body: { ...NEW_SLOT, startTime: "25:00" } },
            { label: "an end time equal to the start time", body: { ...NEW_SLOT, endTime: "12:00" } },
            { label: "an end time before the start time", body: { ...NEW_SLOT, endTime: "11:00" } },
            { label: "neither tables nor copyFrom", body: { date: DAY, startTime: "12:00", endTime: "13:00" } },
            { label: "both tables and copyFrom", body: { ...NEW_SLOT, copyFrom: COPY_SLOT.copyFrom } },
            { label: "an empty tables array", body: { ...NEW_SLOT, tables: [] } },
            {
                label: "a duplicated table number",
                body: { ...NEW_SLOT, tables: [TABLES[0], { tableNumber: 1, seats: 2 }] },
            },
            { label: "a table number of zero", body: { ...NEW_SLOT, tables: [{ tableNumber: 0, seats: 4 }] } },
            { label: "a table number that is not a number", body: { ...NEW_SLOT, tables: [{ tableNumber: "1", seats: 4 }] } },
            { label: "zero seats", body: { ...NEW_SLOT, tables: [{ tableNumber: 1, seats: 0 }] } },
            { label: "negative seats", body: { ...NEW_SLOT, tables: [{ tableNumber: 1, seats: -2 }] } },
            { label: "a non integer number of seats", body: { ...NEW_SLOT, tables: [{ tableNumber: 1, seats: 2.5 }] } },
            {
                label: "a copyFrom without start time",
                body: { ...COPY_SLOT, copyFrom: { date: "2030-06-14" } },
            },
            {
                label: "a copyFrom with a wrong date",
                body: { ...COPY_SLOT, copyFrom: { date: "14-06-2030", startTime: "12:00" } },
            },
        ])("answers 400 and skips the controller for $label", async ({ body }) => {
            const res = await request(app).post(URL).send(body);

            expect(res.status).toBe(400);
            expect(res.body).toMatchObject({ code: 400, name: expect.any(String), message: expect.any(String) });
            expect(createSlot).not.toHaveBeenCalled();
        });
    });

    describe("controller errors", () => {
        beforeEach(() => {
            actingAs("employee");
        });

        it("answers 409 when the controller reports an overlap", async () => {
            const error = new ConflictError("The slot overlaps an existing one");
            vi.mocked(createSlot).mockImplementation(() => {
                throw error;
            });

            const res = await request(app).post(URL).send(NEW_SLOT);

            expect(res.status).toBe(409);
            expect(res.body).toEqual({ code: 409, name: error.name, message: error.message });
        });

        it("answers 404 when the controller does not find the slot to copy from", async () => {
            const error = new NotFoundError("The slot to copy from was not found or has no tables");
            vi.mocked(createSlot).mockImplementation(() => {
                throw error;
            });

            const res = await request(app).post(URL).send(COPY_SLOT);

            expect(res.status).toBe(404);
            expect(res.body).toEqual({ code: 404, name: error.name, message: error.message });
        });

        it("answers 500 without leaking the message of an unexpected error", async () => {
            vi.spyOn(console, "error").mockImplementation(() => undefined);
            vi.mocked(createSlot).mockImplementation(() => {
                throw new Error("SQLITE_BUSY: secret details");
            });

            const res = await request(app).post(URL).send(NEW_SLOT);

            expect(res.status).toBe(500);
            expect(res.body.code).toBe(500);
            expect(JSON.stringify(res.body)).not.toContain("SQLITE_BUSY");
        });
    });
});