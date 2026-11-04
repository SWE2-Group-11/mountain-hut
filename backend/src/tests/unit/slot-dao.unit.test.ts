import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "../../database/database";
import {
    getSlot,
    getAvailableSlotsByDate,
    getSlotTables,
    getSavedConfigurations,
    saveSlot,
    SlotAvailability,
    SlotConfiguration,
} from "../../dao/slot-dao";
import { Slot } from "../../models/entities/slot";
import { SlotTable } from "../../models/entities/slot_table";

/*
UNIT tests for slot-dao.
The database is mocked: we check the parameters passed to the query and how rows are mapped.
The SQL itself is covered by the integration tests.
*/

vi.mock("../../database/database", () => ({ db: { prepare: vi.fn(), transaction: vi.fn() } }));

const statement = { get: vi.fn(), all: vi.fn(), run: vi.fn() };

beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(db.prepare).mockReturnValue(statement as any);
    vi.mocked(db.transaction).mockImplementation(((fn: () => unknown) => fn) as any);
});

describe("getSlot (unit)", () => {
    it("returns the slot built from the row", () => {
        statement.get.mockReturnValue({ date: "2026-11-02", start_time: "19:00", duration: 90 });

        const slot = getSlot("2026-11-02", "19:00");

        expect(slot).toBeInstanceOf(Slot);
        expect(slot).toEqual(new Slot("2026-11-02", "19:00", 90));
    });

    it("looks the slot up by date and start time", () => {
        statement.get.mockReturnValue({ date: "2026-11-02", start_time: "19:00", duration: 90 });

        getSlot("2026-11-02", "19:00");

        expect(statement.get).toHaveBeenCalledWith("2026-11-02", "19:00");
    });

    it("returns null when the slot does not exist", () => {
        statement.get.mockReturnValue(undefined);

        expect(getSlot("2026-11-02", "07:00")).toBeNull();
    });

    it("lets a database failure through instead of swallowing it", () => {
        const boom = new Error("database is locked");
        statement.get.mockImplementation(() => {
            throw boom;
        });

        expect(() => getSlot("2026-11-02", "19:00")).toThrow(boom);
    });
});

describe("getAvailableSlotsByDate (unit)", () => {
    const rows = [
        { date: "2026-11-02", start_time: "19:00", duration: 90, total_seats: 20, available_seats: 12 },
        { date: "2026-11-02", start_time: "20:30", duration: 90, total_seats: 20, available_seats: 20 },
    ];

    it("maps each row to { slot, total_seats, available_seats }, keeping the order", () => {
        statement.all.mockReturnValue(rows);

        const expected: SlotAvailability[] = [
            { slot: new Slot("2026-11-02", "19:00", 90), total_seats: 20, available_seats: 12 },
            { slot: new Slot("2026-11-02", "20:30", 90), total_seats: 20, available_seats: 20 },
        ];

        expect(getAvailableSlotsByDate("2026-11-02")).toEqual(expected);
    });

    it("returns Slot entities", () => {
        statement.all.mockReturnValue(rows);

        for (const s of getAvailableSlotsByDate("2026-11-02")) {
            expect(s.slot).toBeInstanceOf(Slot);
        }
    });

    it("queries only the requested day", () => {
        statement.all.mockReturnValue([]);

        getAvailableSlotsByDate("2026-11-02");

        expect(statement.all).toHaveBeenCalledWith("2026-11-02");
    });

    it("returns an empty list when no slot is available", () => {
        statement.all.mockReturnValue([]);

        expect(getAvailableSlotsByDate("2026-11-02")).toEqual([]);
    });

    it("lets a database failure through instead of swallowing it", () => {
        const boom = new Error("database is locked");
        statement.all.mockImplementation(() => {
            throw boom;
        });

        expect(() => getAvailableSlotsByDate("2026-11-02")).toThrow(boom);
    });
});

describe("getSlotTables (unit)", () => {
    const rows = [
        { slot_date: "2026-11-02", slot_start_time: "19:00", table_number: 1, seats: 4 },
        { slot_date: "2026-11-02", slot_start_time: "19:00", table_number: 2, seats: 6 },
    ];

    it("maps each row to a SlotTable, keeping the order", () => {
        statement.all.mockReturnValue(rows);

        expect(getSlotTables("2026-11-02", "19:00")).toStrictEqual([
            new SlotTable("2026-11-02", "19:00", 1, 4),
            new SlotTable("2026-11-02", "19:00", 2, 6),
        ]);
    });

    it("looks the tables up by date and start time", () => {
        statement.all.mockReturnValue([]);

        getSlotTables("2026-11-02", "19:00");

        expect(statement.all).toHaveBeenCalledWith("2026-11-02", "19:00");
    });

    it("returns an empty list when the slot has no tables", () => {
        statement.all.mockReturnValue([]);

        expect(getSlotTables("2026-11-02", "19:00")).toEqual([]);
    });

    it("lets a database failure through instead of swallowing it", () => {
        const boom = new Error("database is locked");
        statement.all.mockImplementation(() => {
            throw boom;
        });

        expect(() => getSlotTables("2026-11-02", "19:00")).toThrow(boom);
    });
});

describe("getSavedConfigurations (unit)", () => {
    const slotRows = [
        { date: "2026-11-03", start_time: "19:00", duration: 90 },
        { date: "2026-11-02", start_time: "12:00", duration: 60 },
    ];
    const tablesOfFirst = [{ slot_date: "2026-11-03", slot_start_time: "19:00", table_number: 1, seats: 4 }];
    const tablesOfSecond = [
        { slot_date: "2026-11-02", slot_start_time: "12:00", table_number: 1, seats: 2 },
        { slot_date: "2026-11-02", slot_start_time: "12:00", table_number: 2, seats: 8 },
    ];

    it("returns each slot with its own tables, keeping the order", () => {
        // 1st all() = slots, then one all() per slot = its tables
        statement.all
            .mockReturnValueOnce(slotRows)
            .mockReturnValueOnce(tablesOfFirst)
            .mockReturnValueOnce(tablesOfSecond);

        const expected: SlotConfiguration[] = [
            {
                slot: new Slot("2026-11-03", "19:00", 90),
                tables: [new SlotTable("2026-11-03", "19:00", 1, 4)],
            },
            {
                slot: new Slot("2026-11-02", "12:00", 60),
                tables: [
                    new SlotTable("2026-11-02", "12:00", 1, 2),
                    new SlotTable("2026-11-02", "12:00", 2, 8),
                ],
            },
        ];

        expect(getSavedConfigurations(null, null, 10)).toEqual(expected);
    });

    it("passes the date filters and the limit as named parameters", () => {
        statement.all.mockReturnValue([]);

        getSavedConfigurations("2026-11-01", "2026-11-30", 5);

        expect(statement.all).toHaveBeenCalledWith({ from: "2026-11-01", to: "2026-11-30", limit: 5 });
    });

    it("passes null for the filters that are not given", () => {
        statement.all.mockReturnValue([]);

        getSavedConfigurations(null, null, 10);

        expect(statement.all).toHaveBeenCalledWith({ from: null, to: null, limit: 10 });
    });

    it("reads the tables of each slot by its key", () => {
        statement.all.mockReturnValueOnce(slotRows).mockReturnValue([]);

        getSavedConfigurations(null, null, 10);

        expect(statement.all).toHaveBeenNthCalledWith(2, "2026-11-03", "19:00");
        expect(statement.all).toHaveBeenNthCalledWith(3, "2026-11-02", "12:00");
    });

    it("returns an empty list and reads no tables when there is no slot", () => {
        statement.all.mockReturnValue([]);

        expect(getSavedConfigurations(null, null, 10)).toEqual([]);
        expect(statement.all).toHaveBeenCalledTimes(1);
    });

    it("lets a database failure through instead of swallowing it", () => {
        const boom = new Error("database is locked");
        statement.all.mockImplementation(() => {
            throw boom;
        });

        expect(() => getSavedConfigurations(null, null, 10)).toThrow(boom);
    });
});

describe("saveSlot (unit)", () => {
    const tables = [
        { table_number: 1, seats: 4 },
        { table_number: 2, seats: 6 },
    ];

    it("runs inside a transaction", () => {
        statement.get.mockReturnValue(undefined);

        saveSlot("2026-11-02", "19:30", 90, tables);

        expect(db.transaction).toHaveBeenCalledTimes(1);
    });

    it("checks the overlap using the new interval in minutes from midnight", () => {
        statement.get.mockReturnValue(undefined);

        saveSlot("2026-11-02", "19:30", 90, tables);

        // 19:30 -> 1170, + 90 min -> 1260; the query takes (date, new_end, new_start)
        expect(statement.get).toHaveBeenCalledWith("2026-11-02", 1260, 1170);
    });

    it("returns null and inserts nothing when the slot overlaps another one", () => {
        statement.get.mockReturnValue({ found: 1 });

        expect(saveSlot("2026-11-02", "19:30", 90, tables)).toBeNull();
        expect(statement.run).not.toHaveBeenCalled();
    });

    it("inserts the slot first, then one row per table", () => {
        statement.get.mockReturnValue(undefined);

        saveSlot("2026-11-02", "19:30", 90, tables);

        expect(statement.run).toHaveBeenCalledTimes(3);
        expect(statement.run).toHaveBeenNthCalledWith(1, "2026-11-02", "19:30", 90);
        expect(statement.run).toHaveBeenNthCalledWith(2, "2026-11-02", "19:30", 1, 4);
        expect(statement.run).toHaveBeenNthCalledWith(3, "2026-11-02", "19:30", 2, 6);
    });

    it("returns the created slot with its tables as entities", () => {
        statement.get.mockReturnValue(undefined);

        const result = saveSlot("2026-11-02", "19:30", 90, tables);

        expect(result).toStrictEqual({
            slot: new Slot("2026-11-02", "19:30", 90),
            tables: [
                new SlotTable("2026-11-02", "19:30", 1, 4),
                new SlotTable("2026-11-02", "19:30", 2, 6),
            ],
        });
    });

    it("lets a database failure through instead of swallowing it", () => {
        statement.get.mockReturnValue(undefined);
        const boom = new Error("UNIQUE constraint failed");
        statement.run
            .mockImplementationOnce(() => undefined) // slot inserted
            .mockImplementationOnce(() => {
                throw boom; // first table fails
            });

        expect(() => saveSlot("2026-11-02", "19:30", 90, tables)).toThrow(boom);
    });
});