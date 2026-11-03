import { type CreateSlotRequestDTO } from "../../models/dto/slot-dto";
import { BadRequestError } from "../../models/errors/badrequest-error";
import { SlotTable } from "../../models/entities/slot_table";
import { ConflictError } from "../../models/errors/conflict-error";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSlot, getConfigurations, getAvailability, getSlots } from "../../controllers/slot-controller";
import { getAvailableSlotsByDate, getSavedConfigurations, getSlot, getSlotTables, saveSlot, type SlotAvailability, type SlotConfiguration } from "../../dao/slot-dao";
import { getBookingAvailability, saveBooking, type Assignment } from "../../dao/booking-dao";
import { GetAvailabilityResponseDTO, type GetAvailabilityRequestDTO } from "../../models/dto/slot-dto";
import { Slot } from "../../models/entities/slot";
import { NotFoundError } from "../../models/errors/notfound-error";

// Isolate persistence; keep real booking rules and response mapping
vi.mock("../../dao/slot-dao", () => ({
    getAvailableSlotsByDate: vi.fn(), getSavedConfigurations: vi.fn(),
    getSlot: vi.fn(), getSlotTables: vi.fn(), saveSlot: vi.fn(),
}));
vi.mock("../../dao/booking-dao", () => ({ saveBooking: vi.fn(), getBookingAvailability: vi.fn() }));

const DAY = "2030-06-15";
const START_TIME = "12:00";

function makeAvailability(
    startTime: string,
    totalSeats = 10,
    availableSeats = 6,
): SlotAvailability {
    return {
        slot: new Slot(DAY, startTime, 60),
        total_seats: totalSeats,
        available_seats: availableSeats,
    };
}

beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-06-15T07:00:00Z"));
    vi.mocked(getAvailableSlotsByDate).mockReturnValue([]);
});

afterEach(() => vi.useRealTimers());

describe("GET /slots — getSlots controller", () => {
    it("returns [] when the DAO finds no available slots", () => {
        expect(getSlots({ date: DAY })).toEqual([]);
        expect(getAvailableSlotsByDate).toHaveBeenCalledTimes(1);
        expect(getAvailableSlotsByDate).toHaveBeenCalledWith(DAY);
    });

    it("returns [] when every returned slot is past its booking cutoff", () => {
        vi.mocked(getAvailableSlotsByDate).mockReturnValue([
            makeAvailability("09:00"),
            makeAvailability("10:00"),
        ]);

        expect(getSlots({ date: DAY })).toEqual([]);
    });

    it("filters closed windows and maps the remaining slots to DTOs", () => {
        vi.mocked(getAvailableSlotsByDate).mockReturnValue([
            makeAvailability("10:00", 10, 5),
            makeAvailability("12:00", 12, 4),
            makeAvailability("14:00", 20, 7),
        ]);

        expect(getSlots({ date: DAY })).toEqual([
            {
                date: DAY, start_time: "12:00", duration: 60,
                total_seats: 12, available_seats: 4,
            },
            {
                date: DAY, start_time: "14:00", duration: 60,
                total_seats: 20, available_seats: 7,
            },
        ]);
    });

    it("includes the exact cutoff, then excludes the slot after one millisecond", () => {
        vi.mocked(getAvailableSlotsByDate).mockReturnValue([
            makeAvailability(START_TIME),
        ]);

        vi.setSystemTime(new Date("2030-06-15T08:00:00Z"));
        expect(getSlots({ date: DAY })).toHaveLength(1);

        vi.setSystemTime(new Date("2030-06-15T08:00:00.001Z"));
        expect(getSlots({ date: DAY })).toEqual([]);
    });

    it("does not create bookings while listing slots", () => {
        vi.mocked(getAvailableSlotsByDate).mockReturnValue([
            makeAvailability(START_TIME),
        ]);

        getSlots({ date: DAY });

        expect(saveBooking).not.toHaveBeenCalled();
    });

    it("propagates DAO failures for the global 500 handler", () => {
        const failure = new Error("simulated slot query failure");
        vi.mocked(getAvailableSlotsByDate).mockImplementation(() => {
            throw failure;
        });

        expect(() => getSlots({ date: DAY })).toThrow(failure);
    });
});

describe("GET /slots/availability — getAvailability controller", () => {
    const REQUEST: GetAvailabilityRequestDTO = {
        date: DAY, slot: START_TIME, partySize: 4,
    };

    function makeAssignment(tableNumber: number, assignedSeats: number): Assignment {
        return { table_number: tableNumber, assigned_seats: assignedSeats };
    }

    beforeEach(() => {
        // By default the slot exists and is open (12:00 Rome = 10:00Z, cutoff 08:00Z)
        vi.mocked(getSlot).mockReturnValue(new Slot(DAY, START_TIME, 60));
        vi.mocked(getBookingAvailability).mockReturnValue(null);
    });

    it.each([
        { label: "one table", assignment: [[1, 4]] },
        { label: "multiple tables", assignment: [[3, 2], [1, 2]] },
    ])("returns the proposed split with $label", ({ assignment }) => {
        // Why: the user must see which tables and how many seats each, in the DAO's order
        vi.mocked(getBookingAvailability).mockReturnValue(
            assignment.map(([table, seats]) => makeAssignment(table, seats)),
        );

        const response = getAvailability({ ...REQUEST });

        expect(response).toEqual({
            available: assignment.map(([tableId, assignedSeats]) => ({
                tableId, assignedSeats,
            })),
        });
    });

    it("looks up the requested slot, then asks the DAO with its date, time and the party size", () => {
        // Why: a wrong argument here would check a different slot or party than the one requested
        vi.mocked(getBookingAvailability).mockReturnValue([makeAssignment(1, 4)]);

        getAvailability(REQUEST);

        expect(getSlot).toHaveBeenCalledTimes(1);
        expect(getSlot).toHaveBeenCalledWith(DAY, START_TIME);
        expect(getBookingAvailability).toHaveBeenCalledTimes(1);
        expect(getBookingAvailability).toHaveBeenCalledWith(DAY, START_TIME, REQUEST.partySize);
    });

    it("rejects an unknown date/time with NotFoundError and does not check seats", () => {
        // Why: "slot does not exist" (404) must not be confused with "not enough seats"
        vi.mocked(getSlot).mockReturnValue(null);

        expect(() => getAvailability(REQUEST)).toThrow(NotFoundError);
        expect(() => getAvailability(REQUEST)).toThrow("Slot not found");
        expect(getBookingAvailability).not.toHaveBeenCalled();
    });

    it("returns an empty arrangement, not an error, when the party cannot be seated", () => {
        // Why: a full slot is a normal answer (200 with available: []), not a failure
        vi.mocked(getBookingAvailability).mockReturnValue(null);

        const response = getAvailability(REQUEST);

        expect(response).toEqual({ available: [] });
        expect(getBookingAvailability).toHaveBeenCalledTimes(1);
    });

    it("returns an empty arrangement without checking seats after the booking cutoff", () => {
        // Why: a slot that can no longer be booked must not look available
        vi.setSystemTime(new Date("2030-06-15T08:00:00.001Z"));

        const response = getAvailability(REQUEST);

        expect(response).toEqual({ available: [] });
        expect(getBookingAvailability).not.toHaveBeenCalled();
    });

    it("still checks seats exactly at the booking cutoff", () => {
        // Why: the cutoff is inclusive, same as getSlots and createReservation
        vi.setSystemTime(new Date("2030-06-15T08:00:00Z"));
        vi.mocked(getBookingAvailability).mockReturnValue([makeAssignment(1, 4)]);

        const response = getAvailability(REQUEST);

        expect(response.available).toHaveLength(1);
        expect(getBookingAvailability).toHaveBeenCalledTimes(1);
    });

    it("returns an empty arrangement for a slot that has already started", () => {
        // Why: past slots are closed too, so the DAO is not asked
        vi.setSystemTime(new Date("2030-06-15T13:00:00Z"));

        const response = getAvailability(REQUEST);

        expect(response).toEqual({ available: [] });
        expect(getBookingAvailability).not.toHaveBeenCalled();
    });

    it("does not create bookings while checking availability", () => {
        // Why: checking is read-only; only POST /reservations may book
        vi.mocked(getBookingAvailability).mockReturnValue([makeAssignment(1, 4)]);

        getAvailability(REQUEST);

        expect(saveBooking).not.toHaveBeenCalled();
    });

    it("returns a DTO without database field names", () => {
        // Why: the API returns DTOs, never DAO data (architecture rule)
        vi.mocked(getBookingAvailability).mockReturnValue([makeAssignment(1, 4)]);

        const response = getAvailability(REQUEST);

        expect(response).toBeInstanceOf(GetAvailabilityResponseDTO);
        expect(response.available[0]).not.toHaveProperty("table_number");
        expect(response.available[0]).not.toHaveProperty("assigned_seats");
    });

    it("propagates a slot lookup failure instead of treating it as no capacity", () => {
        // Why: a DB error must reach the global 500 handler, not become "not available"
        const failure = new Error("simulated slot lookup failure");
        vi.mocked(getSlot).mockImplementation(() => { throw failure; });

        expect(() => getAvailability(REQUEST)).toThrow(failure);
        expect(getBookingAvailability).not.toHaveBeenCalled();
    });

    it("propagates an availability query failure for the global 500 handler", () => {
        // Why: same as above, for the seat query
        const failure = new Error("simulated availability query failure");
        vi.mocked(getBookingAvailability).mockImplementation(() => { throw failure; });

        expect(() => getAvailability(REQUEST)).toThrow(failure);
    });
});

const slotWithTables = (date: string, start: string, duration: number, tables: [number, number][]) => ({
    slot: new Slot(date, start, duration),
    tables: tables.map(([n, s]) => new SlotTable(date, start, n, s)),
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

const CAPACITY_DAY = "2030-06-15";
const CAPACITY_SOURCE = { date: "2030-06-14", startTime: "19:00" };
const CAPACITY_TABLES = [{ tableNumber: 3, seats: 4 }, { tableNumber: 7, seats: 6 }];
const CAPACITY_REQUEST = {
    date: CAPACITY_DAY, startTime: "12:15", endTime: "14:00", tables: CAPACITY_TABLES,
} satisfies CreateSlotRequestDTO;

function capacityConfiguration(
    date = CAPACITY_DAY,
    startTime = "12:15",
    duration = 105,
    tables: [number, number][] = [[3, 4], [7, 6]],
): SlotConfiguration {
    return {
        slot: new Slot(date, startTime, duration),
        tables: tables.map(([number, seats]) => new SlotTable(date, startTime, number, seats)),
    };
}

describe("createSlot and getConfigurations — boundary and error cases", () => {
    const copiedRequest = { date: CAPACITY_DAY, startTime: "12:15", endTime: "14:00", copyFrom: CAPACITY_SOURCE };

    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(getSavedConfigurations).mockReturnValue([]);
        vi.mocked(getSlot).mockReturnValue(new Slot(CAPACITY_SOURCE.date, CAPACITY_SOURCE.startTime, 90));
        vi.mocked(getSlotTables).mockReturnValue(capacityConfiguration(CAPACITY_SOURCE.date, CAPACITY_SOURCE.startTime).tables);
        vi.mocked(saveSlot).mockReturnValue(capacityConfiguration());
    });

    it.each([
        { query: { from: "2030-06-01", limit: 5 }, args: ["2030-06-01", null, 5] },
        { query: { to: "2030-06-30", limit: 100 }, args: [null, "2030-06-30", 100] },
    ])("passes a one-sided filter to the DAO: $query", ({ query, args }) => {
        expect(getConfigurations(query)).toEqual([]);
        expect(getSavedConfigurations).toHaveBeenCalledExactlyOnceWith(...args);
        expect(saveSlot).not.toHaveBeenCalled();
    });

    it("propagates configuration lookup failures instead of reporting an empty list", () => {
        const failure = new Error("configuration lookup failed");
        vi.mocked(getSavedConfigurations).mockImplementation(() => { throw failure; });
        expect(() => getConfigurations({ limit: 20 })).toThrow(failure);
    });

    it.each([
        { startTime: "00:00", endTime: "00:01", duration: 1 },
        { startTime: "09:50", endTime: "11:05", duration: 75 },
        { startTime: "23:00", endTime: "23:59", duration: 59 },
    ])("converts $startTime–$endTime into $duration minutes", ({ startTime, endTime, duration }) => {
        createSlot({ ...CAPACITY_REQUEST, startTime, endTime });
        expect(saveSlot).toHaveBeenCalledWith(CAPACITY_DAY, startTime, duration, expect.any(Array));
    });

    it("does not mutate explicit tables or read a copy source", () => {
        const request = structuredClone(CAPACITY_REQUEST);
        createSlot(request);
        expect(request).toEqual(CAPACITY_REQUEST);
        expect(getSlot).not.toHaveBeenCalled();
        expect(getSlotTables).not.toHaveBeenCalled();
    });

    it("does not mutate the source tables when copying a configuration", () => {
        const source = capacityConfiguration(CAPACITY_SOURCE.date, CAPACITY_SOURCE.startTime, 90, [[9, 8], [2, 3]]);
        const snapshot = structuredClone(source);
        vi.mocked(getSlotTables).mockReturnValue(source.tables);
        createSlot(copiedRequest);
        expect(source).toEqual(snapshot);
    });

    it("rejects a copy source without tables with BadRequestError and does not save", () => {
        vi.mocked(getSlotTables).mockReturnValue([]);
        expect(() => createSlot(copiedRequest)).toThrow(BadRequestError);
        expect(saveSlot).not.toHaveBeenCalled();
    });

    it("also raises ConflictError for an overlapping slot created from copied tables", () => {
        vi.mocked(saveSlot).mockReturnValue(null);
        expect(() => createSlot(copiedRequest)).toThrow(ConflictError);
        expect(saveSlot).toHaveBeenCalledTimes(1);
    });

    it.each(["slot lookup", "table lookup", "save"] as const)("propagates a %s failure without continuing", (stage) => {
        const failure = new Error(`${stage} failed`);
        const fail = () => { throw failure; };
        if (stage === "slot lookup") vi.mocked(getSlot).mockImplementation(fail);
        if (stage === "table lookup") vi.mocked(getSlotTables).mockImplementation(fail);
        if (stage === "save") vi.mocked(saveSlot).mockImplementation(fail);
        expect(() => createSlot(copiedRequest)).toThrow(failure);
        if (stage !== "save") expect(saveSlot).not.toHaveBeenCalled();
        if (stage === "slot lookup") expect(getSlotTables).not.toHaveBeenCalled();
    });

    it("propagates a save failure for newly supplied tables too", () => {
        const failure = new Error("save failed");
        vi.mocked(saveSlot).mockImplementation(() => { throw failure; });
        expect(() => createSlot(CAPACITY_REQUEST)).toThrow(failure);
    });
});
