import { beforeEach, describe, expect, it, vi } from "vitest";
import express, { NextFunction, Request, Response } from "express";
import request from "supertest";

vi.mock("../../controllers/slot-controller", () => ({
    getSlots: vi.fn(),
    getConfigurations: vi.fn(),
    createSlot: vi.fn(),
}));

import { createSlot, getConfigurations } from "../../controllers/slot-controller";
import slotRouter from "../../routes/slot-route";
import { ConflictError } from "../../models/errors/conflict-error";
import { NotFoundError } from "../../models/errors/notfound-error";
import { SlotConfigurationDTO, SlotTableDTO } from "../../models/dto/slot-dto";

/**
 * Builds an app mounting only the slot router, with a fake session for the given role
 * (undefined = not authenticated).
 */
const buildApp = (role?: string) => {
    const app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
        (req as any).isAuthenticated = () => role !== undefined;
        if (role) (req as any).user = { id: 1, username: "test", role };
        next();
    });
    app.use("/slots", slotRouter);
    return app;
};

const created = new SlotConfigurationDTO("2026-12-01", "12:00", "14:00", [new SlotTableDTO(1, 4)], 4);
const validBody = { date: "2026-12-01", startTime: "12:00", endTime: "14:00", tables: [{ tableNumber: 1, seats: 4 }] };

beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /slots/configurations", () => {
    it.each(["employee", "warden"])("returns 200 with the configurations for %s", async (role) => {
        vi.mocked(getConfigurations).mockReturnValue([created]);
        const res = await request(buildApp(role)).get("/slots/configurations");
        expect(res.status).toBe(200);
        expect(res.body).toEqual([
            { date: "2026-12-01", startTime: "12:00", endTime: "14:00", tables: [{ tableNumber: 1, seats: 4 }], totalSeats: 4 },
        ]);
    });

    it("returns [] when no slot exists", async () => {
        vi.mocked(getConfigurations).mockReturnValue([]);
        const res = await request(buildApp("employee")).get("/slots/configurations");
        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });

    it("passes parsed query parameters with limit defaulting to 20", async () => {
        vi.mocked(getConfigurations).mockReturnValue([]);
        await request(buildApp("employee")).get("/slots/configurations");
        expect(getConfigurations).toHaveBeenCalledWith({ limit: 20 });

        await request(buildApp("employee")).get("/slots/configurations?from=2026-12-01&to=2026-12-31&limit=5");
        expect(getConfigurations).toHaveBeenLastCalledWith({ from: "2026-12-01", to: "2026-12-31", limit: 5 });
    });

    it.each([
        "from=2026-12-02&to=2026-12-01",
        "from=2026-02-30",
        "to=abc",
        "limit=0",
        "limit=101",
        "limit=abc",
    ])("returns 400 for ?%s", async (qs) => {
        const res = await request(buildApp("employee")).get(`/slots/configurations?${qs}`);
        expect(res.status).toBe(400);
        expect(res.body.code).toBe(400);
        expect(getConfigurations).not.toHaveBeenCalled();
    });

    it("returns 401 when not authenticated", async () => {
        const res = await request(buildApp()).get("/slots/configurations");
        expect(res.status).toBe(401);
        expect(getConfigurations).not.toHaveBeenCalled();
    });

    it("returns 403 for a user role", async () => {
        const res = await request(buildApp("user")).get("/slots/configurations");
        expect(res.status).toBe(403);
        expect(getConfigurations).not.toHaveBeenCalled();
    });

    it("returns 500 on unexpected errors", async () => {
        vi.mocked(getConfigurations).mockImplementation(() => { throw new Error("boom"); });
        const res = await request(buildApp("employee")).get("/slots/configurations");
        expect(res.status).toBe(500);
    });
});

describe("POST /slots", () => {
    it.each(["employee", "warden"])("returns 201 with the created slot for %s", async (role) => {
        vi.mocked(createSlot).mockReturnValue(created);
        const res = await request(buildApp(role)).post("/slots").send(validBody);
        expect(res.status).toBe(201);
        expect(res.body).toEqual({
            date: "2026-12-01", startTime: "12:00", endTime: "14:00", tables: [{ tableNumber: 1, seats: 4 }], totalSeats: 4,
        });
        expect(createSlot).toHaveBeenCalledWith(validBody);
    });

    it("accepts copyFrom instead of tables", async () => {
        vi.mocked(createSlot).mockReturnValue(created);
        const body = { date: "2026-12-01", startTime: "12:00", endTime: "14:00", copyFrom: { date: "2026-11-30", startTime: "19:00" } };
        const res = await request(buildApp("warden")).post("/slots").send(body);
        expect(res.status).toBe(201);
        expect(createSlot).toHaveBeenCalledWith(body);
    });

    it.each([
        ["missing date", { ...validBody, date: undefined }],
        ["endTime not after startTime", { ...validBody, endTime: "12:00" }],
        ["duplicate tableNumber", { ...validBody, tables: [{ tableNumber: 1, seats: 4 }, { tableNumber: 1, seats: 2 }] }],
        ["both tables and copyFrom", { ...validBody, copyFrom: { date: "2026-11-30", startTime: "19:00" } }],
        ["neither tables nor copyFrom", { date: "2026-12-01", startTime: "12:00", endTime: "14:00" }],
        ["non-positive seats", { ...validBody, tables: [{ tableNumber: 1, seats: 0 }] }],
    ])("returns 400 for %s", async (_label, body) => {
        const res = await request(buildApp("employee")).post("/slots").send(body);
        expect(res.status).toBe(400);
        expect(res.body.code).toBe(400);
        expect(createSlot).not.toHaveBeenCalled();
    });

    it("returns 401 when not authenticated", async () => {
        const res = await request(buildApp()).post("/slots").send(validBody);
        expect(res.status).toBe(401);
        expect(createSlot).not.toHaveBeenCalled();
    });

    it("returns 403 for a user role", async () => {
        const res = await request(buildApp("user")).post("/slots").send(validBody);
        expect(res.status).toBe(403);
        expect(createSlot).not.toHaveBeenCalled();
    });

    it("returns 404 when the copyFrom slot does not exist", async () => {
        vi.mocked(createSlot).mockImplementation(() => { throw new NotFoundError("missing"); });
        const body = { date: "2026-12-01", startTime: "12:00", endTime: "14:00", copyFrom: { date: "2026-11-30", startTime: "19:00" } };
        const res = await request(buildApp("employee")).post("/slots").send(body);
        expect(res.status).toBe(404);
    });

    it("returns 409 when the slot overlaps", async () => {
        vi.mocked(createSlot).mockImplementation(() => { throw new ConflictError("overlap"); });
        const res = await request(buildApp("employee")).post("/slots").send(validBody);
        expect(res.status).toBe(409);
    });

    it("returns 500 on unexpected errors", async () => {
        vi.mocked(createSlot).mockImplementation(() => { throw new Error("boom"); });
        const res = await request(buildApp("employee")).post("/slots").send(validBody);
        expect(res.status).toBe(500);
    });
});
