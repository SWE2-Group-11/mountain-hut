import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSlots } from "../controllers/slot-controller";
import { getAvailableSlotsByDate, type SlotAvailability } from "../dao/slot-dao";
import { saveBooking } from "../dao/booking-dao";
import { Slot } from "../models/entities/slot";

vi.mock("../dao/slot-dao", () => ({ getAvailableSlotsByDate: vi.fn() }));
vi.mock("../dao/booking-dao", () => ({ saveBooking: vi.fn() }));

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
