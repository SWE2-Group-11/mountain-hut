import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createReservation } from "../controllers/reservation-controller";
import { getSlot } from "../dao/slot-dao";
import { saveBooking } from "../dao/booking-dao";
import { type CreateReservationRequestDTO } from "../models/dto/reservation-dto";
import { Booking } from "../models/entities/booking";
import { SeatedAt } from "../models/entities/seated_at";
import { Slot } from "../models/entities/slot";
import { BadRequestError } from "../models/errors/badrequest-error";
import { ConflictError } from "../models/errors/conflict-error";

// Isolate persistence; keep real booking rules and response mapping
vi.mock("../dao/slot-dao", () => ({ getSlot: vi.fn() }));
vi.mock("../dao/booking-dao", () => ({ saveBooking: vi.fn() }));

const DAY = "2030-06-15";
const START_TIME = "12:00";
const HIKER_ID = 7;
const BOOKING_ID = 42;
const VALID_REQUEST: CreateReservationRequestDTO = {
    date: DAY, slot: START_TIME, partySize: 4,
};

function makeSeating(tableNumber: number, assignedSeats: number): SeatedAt {
    return new SeatedAt(
        BOOKING_ID, DAY, START_TIME, tableNumber, assignedSeats,
    );
}

beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-06-15T07:00:00Z"));
    vi.mocked(getSlot).mockReturnValue(new Slot(DAY, START_TIME, 60));
    vi.mocked(saveBooking).mockReturnValue(null);
});

afterEach(() => vi.useRealTimers());

describe("POST /reservations — createReservation controller", () => {
    it.each([
        { label: "one table", assignment: [[1, 4]] },
        { label: "multiple tables", assignment: [[1, 3], [2, 1]] },
    ])("returns the created reservation with $label", ({ assignment }) => {
        const seatings = assignment.map(([table, seats]) =>
            makeSeating(table, seats));
        vi.mocked(saveBooking).mockReturnValue({
            booking: new Booking(BOOKING_ID, HIKER_ID),
            seatings,
        });

        const response = createReservation(HIKER_ID, { ...VALID_REQUEST });

        expect(getSlot).toHaveBeenCalledTimes(1);
        expect(getSlot).toHaveBeenCalledWith(DAY, START_TIME);
        expect(saveBooking).toHaveBeenCalledTimes(1);
        expect(saveBooking).toHaveBeenCalledWith(
            HIKER_ID, DAY, START_TIME, VALID_REQUEST.partySize,
        );
        expect(response).toEqual({
            id: BOOKING_ID,
            date: DAY,
            slot: START_TIME,
            partySize: 4,
            seatings: assignment.map(([table_number, assigned_seats]) => ({
                table_number, assigned_seats,
            })),
        });
        expect(response).not.toHaveProperty("hiker_id");
        expect(response.seatings[0]).not.toHaveProperty("booking_id");
    });

    it("rejects an unknown date/time with BadRequestError and does not save", () => {
        vi.mocked(getSlot).mockReturnValue(null);

        expect(() => createReservation(HIKER_ID, VALID_REQUEST))
            .toThrow(BadRequestError);
        expect(saveBooking).not.toHaveBeenCalled();
    });

    it("rejects a future slot after the cutoff without saving", () => {
        vi.setSystemTime(new Date("2030-06-15T08:00:00.001Z"));

        expect(() => createReservation(HIKER_ID, VALID_REQUEST))
            .toThrow(BadRequestError);
        expect(saveBooking).not.toHaveBeenCalled();
    });

    it("rejects a past slot without saving", () => {
        vi.setSystemTime(new Date("2030-06-15T13:00:00Z"));

        expect(() => createReservation(HIKER_ID, VALID_REQUEST))
            .toThrow(BadRequestError);
        expect(saveBooking).not.toHaveBeenCalled();
    });

    it("still saves exactly at the booking cutoff", () => {
        vi.setSystemTime(new Date("2030-06-15T08:00:00Z"));
        vi.mocked(saveBooking).mockReturnValue({
            booking: new Booking(BOOKING_ID, HIKER_ID),
            seatings: [makeSeating(1, 4)],
        });

        expect(createReservation(HIKER_ID, VALID_REQUEST).id).toBe(BOOKING_ID);
        expect(saveBooking).toHaveBeenCalledTimes(1);
    });

    it("throws ConflictError if capacity has become unavailable", () => {
        vi.mocked(saveBooking).mockReturnValue(null);

        expect(() => createReservation(HIKER_ID, VALID_REQUEST))
            .toThrow(ConflictError);
        expect(saveBooking).toHaveBeenCalledTimes(1);
    });

    it("propagates a slot lookup failure instead of treating it as no capacity", () => {
        const failure = new Error("simulated slot lookup failure");
        vi.mocked(getSlot).mockImplementation(() => { throw failure; });

        expect(() => createReservation(HIKER_ID, VALID_REQUEST)).toThrow(failure);
        expect(saveBooking).not.toHaveBeenCalled();
    });

    it("propagates a save failure for the global 500 handler", () => {
        const failure = new Error("simulated booking write failure");
        vi.mocked(saveBooking).mockImplementation(() => { throw failure; });

        expect(() => createReservation(HIKER_ID, VALID_REQUEST)).toThrow(failure);
    });
});
