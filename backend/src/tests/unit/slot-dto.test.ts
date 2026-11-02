import { describe, expect, it } from "vitest";
import { CreateSlotRequestSchema, GetConfigurationsRequestSchema } from "../../models/dto/slot-dto";

// api.md: POST /slots request body
describe("CreateSlotRequestSchema", () => {
    const base = { date: "2026-12-01", startTime: "12:00", endTime: "14:00" };
    const tables = [{ tableNumber: 1, seats: 4 }, { tableNumber: 2, seats: 2 }];
    const copyFrom = { date: "2026-11-30", startTime: "12:00" };

    it("accepts a body with tables", () => {
        expect(CreateSlotRequestSchema.safeParse({ ...base, tables }).success).toBe(true);
    });

    it("accepts a body with copyFrom", () => {
        expect(CreateSlotRequestSchema.safeParse({ ...base, copyFrom }).success).toBe(true);
    });

    it("rejects both tables and copyFrom", () => {
        expect(CreateSlotRequestSchema.safeParse({ ...base, tables, copyFrom }).success).toBe(false);
    });

    it("rejects neither tables nor copyFrom", () => {
        expect(CreateSlotRequestSchema.safeParse(base).success).toBe(false);
    });

    it.each(["date", "startTime", "endTime"])("rejects a missing %s", (field) => {
        const body: Record<string, unknown> = { ...base, tables };
        delete body[field];
        expect(CreateSlotRequestSchema.safeParse(body).success).toBe(false);
    });

    it.each(["2026-13-01", "2026-02-30", "01-12-2026", "2026-12-1"])("rejects invalid date %s", (date) => {
        expect(CreateSlotRequestSchema.safeParse({ ...base, date, tables }).success).toBe(false);
    });

    it.each(["24:00", "12:60", "9:00", "12-00"])("rejects invalid time %s", (startTime) => {
        expect(CreateSlotRequestSchema.safeParse({ ...base, startTime, endTime: "23:59", tables }).success).toBe(false);
    });

    it("rejects endTime equal to startTime", () => {
        expect(CreateSlotRequestSchema.safeParse({ ...base, endTime: "12:00", tables }).success).toBe(false);
    });

    it("rejects endTime before startTime", () => {
        expect(CreateSlotRequestSchema.safeParse({ ...base, endTime: "11:00", tables }).success).toBe(false);
    });

    it("rejects an empty tables array", () => {
        expect(CreateSlotRequestSchema.safeParse({ ...base, tables: [] }).success).toBe(false);
    });

    it("rejects duplicate tableNumber", () => {
        const dup = [{ tableNumber: 1, seats: 4 }, { tableNumber: 1, seats: 2 }];
        expect(CreateSlotRequestSchema.safeParse({ ...base, tables: dup }).success).toBe(false);
    });

    it.each([
        [{ tableNumber: 0, seats: 4 }],
        [{ tableNumber: -1, seats: 4 }],
        [{ tableNumber: 1.5, seats: 4 }],
        [{ tableNumber: 1, seats: 0 }],
        [{ tableNumber: 1, seats: 2.5 }],
        [{ tableNumber: "1", seats: 4 }],
        [{ seats: 4 }],
        [{ tableNumber: 1 }],
    ])("rejects invalid table %o", (table) => {
        expect(CreateSlotRequestSchema.safeParse({ ...base, tables: [table] }).success).toBe(false);
    });

    it("rejects the old tableId field name", () => {
        expect(CreateSlotRequestSchema.safeParse({ ...base, tables: [{ tableId: 1, seats: 4 }] }).success).toBe(false);
    });

    it.each([
        { startTime: "12:00" },
        { date: "2026-11-30" },
        { date: "2026-02-30", startTime: "12:00" },
        { date: "2026-11-30", startTime: "25:00" },
    ])("rejects invalid copyFrom %o", (cf) => {
        expect(CreateSlotRequestSchema.safeParse({ ...base, copyFrom: cf }).success).toBe(false);
    });
});

// api.md: GET /slots/configurations query parameters
describe("GetConfigurationsRequestSchema", () => {
    it("defaults limit to 20 when nothing is given", () => {
        const result = GetConfigurationsRequestSchema.safeParse({});
        expect(result.success).toBe(true);
        expect(result.data).toEqual({ limit: 20 });
    });

    it("coerces limit from a query string", () => {
        expect(GetConfigurationsRequestSchema.parse({ limit: "5" }).limit).toBe(5);
    });

    it("accepts limit 100 and rejects 101", () => {
        expect(GetConfigurationsRequestSchema.safeParse({ limit: "100" }).success).toBe(true);
        expect(GetConfigurationsRequestSchema.safeParse({ limit: "101" }).success).toBe(false);
    });

    it.each(["0", "-1", "1.5", "abc"])("rejects invalid limit %s", (limit) => {
        expect(GetConfigurationsRequestSchema.safeParse({ limit }).success).toBe(false);
    });

    it("accepts from equal to to (inclusive range)", () => {
        expect(GetConfigurationsRequestSchema.safeParse({ from: "2026-12-01", to: "2026-12-01" }).success).toBe(true);
    });

    it("accepts only from or only to", () => {
        expect(GetConfigurationsRequestSchema.safeParse({ from: "2026-12-01" }).success).toBe(true);
        expect(GetConfigurationsRequestSchema.safeParse({ to: "2026-12-01" }).success).toBe(true);
    });

    it("rejects from after to", () => {
        expect(GetConfigurationsRequestSchema.safeParse({ from: "2026-12-02", to: "2026-12-01" }).success).toBe(false);
    });

    it.each([{ from: "2026-02-30" }, { to: "not-a-date" }])("rejects invalid date %o", (q) => {
        expect(GetConfigurationsRequestSchema.safeParse(q).success).toBe(false);
    });
});
