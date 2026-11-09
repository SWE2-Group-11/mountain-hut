import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createReservation } from "../../controllers/reservation-controller";
import { getSlot } from "../../dao/slot-dao";
import { saveBooking, hasBookingInSlot } from "../../dao/booking-dao";
import { RequirementDTO, type CreateReservationRequestDTO } from "../../models/dto/reservation-dto";
import { Booking } from "../../models/entities/booking";
import { SeatedAt } from "../../models/entities/seated_at";
import { Slot } from "../../models/entities/slot";
import { BadRequestError } from "../../models/errors/badrequest-error";
import { ConflictError } from "../../models/errors/conflict-error";
import { notifyBookingCreated } from "../../notifications/booking-confirmation";
import { DietaryRequirement } from "../../models/entities/dietary_requirement";

// Isolate persistence; keep real booking rules and response mapping
vi.mock("../../dao/slot-dao", () => ({ getSlot: vi.fn() }));
vi.mock("../../dao/booking-dao", () => ({ hasBookingInSlot: vi.fn(), saveBooking: vi.fn() }));
vi.mock("../../notifications/booking-confirmation", () => ({ notifyBookingCreated: vi.fn() }));

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
    vi.mocked(notifyBookingCreated).mockResolvedValue(undefined);
    vi.mocked(getSlot).mockReturnValue(new Slot(DAY, START_TIME, 60));
    vi.mocked(hasBookingInSlot).mockReturnValue(false);
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
            seatings: seatings,
            dietary_requirements: [],
        });

        const response = createReservation(HIKER_ID, { ...VALID_REQUEST });

        expect(getSlot).toHaveBeenCalledTimes(1);
        expect(getSlot).toHaveBeenCalledWith(DAY, START_TIME);
        expect(saveBooking).toHaveBeenCalledTimes(1);
        expect(saveBooking).toHaveBeenCalledWith(
            HIKER_ID, DAY, START_TIME, VALID_REQUEST.partySize, []
        );
        expect(response).toEqual({
            id: BOOKING_ID,
            date: DAY,
            slot: START_TIME,
            partySize: 4,
            seatings: assignment.map(([table_number, assigned_seats]) => ({
                table_number, assigned_seats,
            })),
            requirements: [],
        });
        expect(response).not.toHaveProperty("hiker_id");
        expect(response.seatings[0]).not.toHaveProperty("booking_id");
        expect(notifyBookingCreated).toHaveBeenCalledExactlyOnceWith(BOOKING_ID);
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
            dietary_requirements: [],
        });

        expect(createReservation(HIKER_ID, VALID_REQUEST).id).toBe(BOOKING_ID);
        expect(saveBooking).toHaveBeenCalledTimes(1);
        expect(notifyBookingCreated).toHaveBeenCalledExactlyOnceWith(BOOKING_ID);
    });

    it("rejects a second booking of the same hiker in the slot without saving", () => {
        vi.mocked(hasBookingInSlot).mockReturnValue(true);

        expect(() => createReservation(HIKER_ID, VALID_REQUEST))
            .toThrow(ConflictError);
        expect(hasBookingInSlot).toHaveBeenCalledWith(HIKER_ID, DAY, START_TIME);
        expect(saveBooking).not.toHaveBeenCalled();
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

    it("notifies only after saveBooking has returned successfully", () => {
    let saved = false;

    vi.mocked(saveBooking).mockImplementation(() => {
        saved = true;
        return {
            booking: new Booking(BOOKING_ID, HIKER_ID),
            seatings: [makeSeating(1, 4)],
            dietary_requirements: []
        };
    });

    vi.mocked(notifyBookingCreated).mockImplementation(() => {
        expect(saved).toBe(true);
        return Promise.resolve();
    });

    createReservation(HIKER_ID, VALID_REQUEST);

    expect(notifyBookingCreated).toHaveBeenCalledExactlyOnceWith(BOOKING_ID);
    });


    it("returns the reservation without waiting for the notification promise", async () => {
        vi.mocked(saveBooking).mockReturnValue({
            booking: new Booking(BOOKING_ID, HIKER_ID),
            seatings: [makeSeating(1, 4)],
            dietary_requirements: []
        });

        let finishNotification!: () => void;

        const notification = new Promise<void>((resolve) => {
            finishNotification = resolve;
        });

        vi.mocked(notifyBookingCreated).mockReturnValue(notification);

        const response = createReservation(HIKER_ID, VALID_REQUEST);

        expect(response).toMatchObject({
            id: BOOKING_ID,
            partySize: 4,
        });

        expect(notifyBookingCreated).toHaveBeenCalledExactlyOnceWith(BOOKING_ID);

        finishNotification();
        await notification;
    });


        it("forwards multiple dietary requirements to the saveBooking DAO call", () => {
        const requestWithRequirements = {
            ...VALID_REQUEST,
            requirements: [
                { hasAllergies: true, details: "1 vegan, peanut allergy" },
                { hasAllergies: true, details: "1 shellfish allergy" },
                { hasAllergies: false, details: "2 vegetarians" }
            ]
        };

        vi.mocked(saveBooking).mockReturnValue({
            booking: new Booking(BOOKING_ID, HIKER_ID),
            seatings: [makeSeating(1, 4)],
            dietary_requirements: [
                new DietaryRequirement(1, BOOKING_ID, true, "1 vegan, peanut allergy"),
                new DietaryRequirement(2, BOOKING_ID, true, "1 shellfish allergy"),
                new DietaryRequirement(3, BOOKING_ID, false, "2 vegetarians")
            ]
        });

        createReservation(HIKER_ID, requestWithRequirements);

        expect(saveBooking).toHaveBeenCalledWith(
            HIKER_ID,
            DAY,
            START_TIME,
            requestWithRequirements.partySize,
            [
                { allergy_flag: true, description: "1 vegan, peanut allergy" },
                { allergy_flag: true, description: "1 shellfish allergy" },
                { allergy_flag: false, description: "2 vegetarians" }
            ]
        );
    });

    it("includes mapped requirements in the response DTO when returned by saveBooking", () => {
        const requestWithRequirements = {
            ...VALID_REQUEST,
            requirements: [{ hasAllergies: true, details: "Peanuts" }]
        };

        vi.mocked(saveBooking).mockReturnValue({
            booking: new Booking(BOOKING_ID, HIKER_ID),
            seatings: [makeSeating(1, 4)],
            dietary_requirements: [
                new DietaryRequirement(1, BOOKING_ID, true, "Peanuts")
            ]
        });

        const response = createReservation(HIKER_ID, requestWithRequirements);

        expect(response.requirements).toEqual([
            new RequirementDTO(true, "Peanuts")
        ]);
        expect(response.requirements[0]).toBeInstanceOf(RequirementDTO);
    });

        it("handles zero dietary requirements by forwarding an empty array to the DAO", () => {
        const requestWithoutRequirements = {
            ...VALID_REQUEST,
            requirements: []
        };

        vi.mocked(saveBooking).mockReturnValue({
            booking: new Booking(BOOKING_ID, HIKER_ID),
            seatings: [makeSeating(1, 4)],
            dietary_requirements: []
        });

        const response = createReservation(HIKER_ID, requestWithoutRequirements);

        expect(saveBooking).toHaveBeenCalledWith(
            HIKER_ID,
            DAY,
            START_TIME,
            requestWithoutRequirements.partySize,
            []
        );
        expect(response.requirements).toEqual([]);
    });

});



