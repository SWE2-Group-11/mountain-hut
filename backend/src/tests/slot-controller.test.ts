import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAvailability, getSlots } from "../controllers/slot-controller";
import { getAvailableSlotsByDate, getSlot, type SlotAvailability } from "../dao/slot-dao";
import { getBookingAvailability, saveBooking, type Assignment } from "../dao/booking-dao";
import { GetAvailabilityResponseDTO, type GetAvailabilityRequestDTO } from "../models/dto/slot-dto";
import { Slot } from "../models/entities/slot";
import { NotFoundError } from "../models/errors/notfound-error";

// Isolate persistence; keep real booking rules and response mapping
vi.mock("../dao/slot-dao", () => ({ getAvailableSlotsByDate: vi.fn(), getSlot: vi.fn() }));
vi.mock("../dao/booking-dao", () => ({ saveBooking: vi.fn(), getBookingAvailability: vi.fn() }));

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
