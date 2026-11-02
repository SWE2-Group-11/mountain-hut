import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../dao/slot-dao", () => ({
    getAvailableSlotsByDate: vi.fn(),
    getSavedConfigurations: vi.fn(),
    getSlot: vi.fn(),
    getSlotTables: vi.fn(),
    saveSlot: vi.fn(),
}));

import { getSavedConfigurations, getSlot, getSlotTables, saveSlot } from "../../dao/slot-dao";
import { createSlot, getConfigurations } from "../../controllers/slot-controller";
import { Slot } from "../../models/entities/slot";
import { SlotTable } from "../../models/entities/slot_table";
import { ConflictError } from "../../models/errors/conflict-error";
import { NotFoundError } from "../../models/errors/notfound-error";

const slotWithTables = (date: string, start: string, duration: number, tables: [number, number][]) => ({
    slot: new Slot(date, start, duration),
    tables: tables.map(([n, s]) => new SlotTable(date, start, n, s)),
});

beforeEach(() => {
    vi.resetAllMocks();
});

describe("getConfigurations", () => {
    it("passes from, to and limit to the DAO", () => {
        vi.mocked(getSavedConfigurations).mockReturnValue([]);
        getConfigurations({ from: "2026-12-01", to: "2026-12-31", limit: 5 });
        expect(getSavedConfigurations).toHaveBeenCalledWith("2026-12-01", "2026-12-31", 5);
    });

    it("passes null for missing from and to", () => {
        vi.mocked(getSavedConfigurations).mockReturnValue([]);
        getConfigurations({ limit: 20 });
        expect(getSavedConfigurations).toHaveBeenCalledWith(null, null, 20);
    });

    it("returns [] when no slot exists", () => {
        vi.mocked(getSavedConfigurations).mockReturnValue([]);
        expect(getConfigurations({ limit: 20 })).toEqual([]);
    });

    it("maps each configuration to date, startTime, endTime, tables and totalSeats, keeping DAO order", () => {
        vi.mocked(getSavedConfigurations).mockReturnValue([
            slotWithTables("2026-12-02", "19:00", 150, [[1, 4], [2, 2]]),
            slotWithTables("2026-12-01", "12:00", 60, [[3, 6]]),
        ]);
        const result = getConfigurations({ limit: 20 });
        expect(JSON.parse(JSON.stringify(result))).toEqual([
            {
                date: "2026-12-02",
                startTime: "19:00",
                endTime: "21:30",
                tables: [{ tableNumber: 1, seats: 4 }, { tableNumber: 2, seats: 2 }],
                totalSeats: 6,
            },
            {
                date: "2026-12-01",
                startTime: "12:00",
                endTime: "13:00",
                tables: [{ tableNumber: 3, seats: 6 }],
                totalSeats: 6,
            },
        ]);
    });
});

describe("createSlot", () => {
    const base = { date: "2026-12-01", startTime: "12:00", endTime: "14:00" };

    it("creates a slot with the given tables and returns the created slot", () => {
        vi.mocked(saveSlot).mockReturnValue(slotWithTables("2026-12-01", "12:00", 120, [[1, 4], [2, 2]]));

        const result = createSlot({ ...base, tables: [{ tableNumber: 1, seats: 4 }, { tableNumber: 2, seats: 2 }] });

        expect(saveSlot).toHaveBeenCalledWith("2026-12-01", "12:00", 120, [
            { table_number: 1, seats: 4 },
            { table_number: 2, seats: 2 },
        ]);
        expect(getSlot).not.toHaveBeenCalled();
        expect(JSON.parse(JSON.stringify(result))).toEqual({
            date: "2026-12-01",
            startTime: "12:00",
            endTime: "14:00",
            tables: [{ tableNumber: 1, seats: 4 }, { tableNumber: 2, seats: 2 }],
            totalSeats: 6,
        });
    });

    it("copies the tables of the slot referenced by copyFrom", () => {
        vi.mocked(getSlot).mockReturnValue(new Slot("2026-11-30", "19:00", 90));
        vi.mocked(getSlotTables).mockReturnValue([
            new SlotTable("2026-11-30", "19:00", 5, 8),
            new SlotTable("2026-11-30", "19:00", 6, 3),
        ]);
        vi.mocked(saveSlot).mockReturnValue(slotWithTables("2026-12-01", "12:00", 120, [[5, 8], [6, 3]]));

        const result = createSlot({ ...base, copyFrom: { date: "2026-11-30", startTime: "19:00" } });

        expect(getSlot).toHaveBeenCalledWith("2026-11-30", "19:00");
        expect(getSlotTables).toHaveBeenCalledWith("2026-11-30", "19:00");
        expect(saveSlot).toHaveBeenCalledWith("2026-12-01", "12:00", 120, [
            { table_number: 5, seats: 8 },
            { table_number: 6, seats: 3 },
        ]);
        expect(result.totalSeats).toBe(11);
    });

    it("throws NotFoundError (404) when the copyFrom slot does not exist", () => {
        vi.mocked(getSlot).mockReturnValue(null);

        expect(() => createSlot({ ...base, copyFrom: { date: "2026-11-30", startTime: "19:00" } }))
            .toThrow(NotFoundError);
        expect(saveSlot).not.toHaveBeenCalled();
    });

    it("throws ConflictError (409) when the slot overlaps an existing one", () => {
        vi.mocked(saveSlot).mockReturnValue(null);

        expect(() => createSlot({ ...base, tables: [{ tableNumber: 1, seats: 4 }] }))
            .toThrow(ConflictError);
    });
});
