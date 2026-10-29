import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "../database/database";
import { getSlot, getAvailableSlotsByDate, SlotAvailability } from "../dao/slot-dao";
import { Slot } from "../models/entities/slot";

/*
UNIT tests for slot-dao.
The database is mocked: we check the parameters passed to the query and how rows are mapped.
The SQL itself is covered by the integration tests.
*/

vi.mock("../database/database", () => ({ db: { prepare: vi.fn() } }));

const statement = { get: vi.fn(), all: vi.fn() };

beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(db.prepare).mockReturnValue(statement as any);
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