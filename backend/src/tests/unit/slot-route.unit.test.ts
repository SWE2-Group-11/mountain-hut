import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import slotRouter from "../../routes/slot-route";
import { getSlots } from "../../controllers/slot-controller";
import { sendAppError } from "../../services/error-service";
import { BadRequestError } from "../../models/errors/badrequest-error";
import type { SlotDTO } from "../../models/dto/slot-dto";


vi.mock("../../controllers/slot-controller", () => ({
    getSlots: vi.fn(),
    getConfigurations: vi.fn(),
    createSlot: vi.fn(),
}));

const URL = "/slots";
const DAY = "2030-06-15";
const SLOTS: SlotDTO[] = [
    { date: DAY, start_time: "12:00", duration: 60, total_seats: 16, available_seats: 7 },
    { date: DAY, start_time: "19:30", duration: 90, total_seats: 16, available_seats: 12 },
];

// Minimal app: the router and the error format are the real ones
const app = express();
app.use(URL, slotRouter);
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    sendAppError(err, res);
});

beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getSlots).mockReturnValue(SLOTS);
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
