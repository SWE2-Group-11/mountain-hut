import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SeatedAt } from "../../models/entities/seated_at";
import { Slot } from "../../models/entities/slot";
import { BadRequestError } from "../../models/errors/badrequest-error";
import { ConflictError } from "../../models/errors/conflict-error";
import { notifyBookingCreated } from "../../notifications/booking-confirmation";
import { DietaryRequirement } from "../../models/entities/dietary_requirement";
import { createReservation, updateReservation } from "../../controllers/reservation-controller";
import { getSlot } from "../../dao/slot-dao";
import {
    saveBooking, hasBookingInSlot, getBooking, getActiveBookingsByHiker, getBookingAvailability,
    getTablesAvailability, deleteSeatings, insertSeatings, type Reservation,
} from "../../dao/booking-dao";
import { replaceRequirements } from "../../dao/dietary-requirement-dao";
import { inTransaction } from "../../database/database";
import { RequirementDTO, type CreateReservationRequestDTO, type UpdateReservationRequestDTO } from "../../models/dto/reservation-dto";
import { NotFoundError } from "../../models/errors/notfound-error";
import { ForbiddenError } from "../../models/errors/forbidden-error";
import { Booking } from "../../models/entities/booking";

// Isolate persistence; keep real booking rules and response mapping
vi.mock("../../dao/slot-dao", () => ({ getSlot: vi.fn() }));
vi.mock("../../dao/booking-dao", () => ({
    hasBookingInSlot: vi.fn(), saveBooking: vi.fn(), getBooking: vi.fn(),
    getActiveBookingsByHiker: vi.fn(), getBookingAvailability: vi.fn(), getTablesAvailability: vi.fn(),
    deleteSeatings: vi.fn(), insertSeatings: vi.fn(),
}));
vi.mock("../../dao/dietary-requirement-dao", () => ({ replaceRequirements: vi.fn() }));
vi.mock("../../database/database", () => ({ inTransaction: vi.fn() }));
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
    vi.mocked(inTransaction).mockImplementation(((callback: () => unknown) => callback()) as any);
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
                dietary_requirements: [],
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


describe("PATCH /reservations/:id — updateReservation controller (MH-06)", () => {
    const RES_ID = BOOKING_ID;
    const NEW_DATE = "2030-06-16";
    const NEW_START = "19:30";

    const table = (table_number: number, seats: number, free_seats: number) => ({ table_number, seats, free_seats });
    const seatsOf = (...pairs: [number, number][]) => pairs.map(([table_number, assigned_seats]) => ({ table_number, assigned_seats }));

    const makeReservation = (
        seats: [number, number][] = [[1, 4]],
        requirements: DietaryRequirement[] = [],
        hikerId = HIKER_ID,
    ): Reservation => ({
        booking: new Booking(RES_ID, hikerId),
        date: DAY,
        start_time: START_TIME,
        party_size: seats.reduce((sum, [, n]) => sum + n, 0),
        seatings: seats.map(([t, n]) => makeSeating(t, n)),
        dietary_requirements: requirements,
    });

    const update = (request: UpdateReservationRequestDTO) => updateReservation(HIKER_ID, RES_ID, request);

    beforeEach(() => {
        // The reservation (15 Jun 12:00 Rome) can be changed until 13 Jun 10:00Z
        vi.setSystemTime(new Date("2030-06-10T07:00:00Z"));
        vi.mocked(getBooking).mockReturnValue(makeReservation());
        vi.mocked(getActiveBookingsByHiker).mockReturnValue([]);
        vi.mocked(getTablesAvailability).mockReturnValue([]);
        vi.mocked(replaceRequirements).mockReturnValue([]);
        vi.mocked(getSlot).mockImplementation((date, start) => new Slot(date, start, 60));
        vi.mocked(insertSeatings).mockImplementation(((id: number, date: string, start: string, assignment: { table_number: number; assigned_seats: number }[]) =>
            assignment.map((a) => new SeatedAt(id, date, start, a.table_number, a.assigned_seats))) as any);
    });

    describe("preconditions", () => {
        it("runs everything inside a transaction", () => {
            vi.mocked(inTransaction).mockReturnValue(null as any);

            update({ partySize: 2 });

            expect(inTransaction).toHaveBeenCalledTimes(1);
            expect(getBooking).not.toHaveBeenCalled();
        });

        it("throws NotFoundError when the reservation does not exist", () => {
            vi.mocked(getBooking).mockReturnValue(null);

            expect(() => update({ partySize: 2 })).toThrow(NotFoundError);
            expect(deleteSeatings).not.toHaveBeenCalled();
        });

        it("throws ForbiddenError when the reservation belongs to another hiker", () => {
            vi.mocked(getBooking).mockReturnValue(makeReservation([[1, 4]], [], 99));

            expect(() => update({ partySize: 2 })).toThrow(ForbiddenError);
            expect(deleteSeatings).not.toHaveBeenCalled();
            expect(replaceRequirements).not.toHaveBeenCalled();
        });

        it("accepts a change exactly 48 hours before the original slot", () => {
            vi.setSystemTime(new Date("2030-06-13T10:00:00Z"));

            expect(() => update({ requirements: [] })).not.toThrow();
        });

        it("rejects a change one millisecond after the 48 hour deadline without writing", () => {
            vi.setSystemTime(new Date("2030-06-13T10:00:00.001Z"));

            expect(() => update({ partySize: 2, requirements: [] })).toThrow(BadRequestError);
            expect(deleteSeatings).not.toHaveBeenCalled();
            expect(replaceRequirements).not.toHaveBeenCalled();
        });

        it("keeps the original time when only the date is given", () => {
            vi.mocked(getBookingAvailability).mockReturnValue(seatsOf([1, 4]));

            update({ date: NEW_DATE });

            expect(getSlot).toHaveBeenCalledWith(NEW_DATE, START_TIME);
        });

        it("throws NotFoundError when the requested slot does not exist, without writing", () => {
            vi.mocked(getSlot).mockReturnValue(null);

            expect(() => update({ date: NEW_DATE })).toThrow(NotFoundError);
            expect(deleteSeatings).not.toHaveBeenCalled();
        });

        it("rejects a requested slot that starts in less than the booking cutoff", () => {
            // 10 Jun 09:30 Rome = 07:30Z, now is 07:00Z: only 30 minutes left
            expect(() => update({ date: "2030-06-10", slot: "09:30" })).toThrow(BadRequestError);
            expect(deleteSeatings).not.toHaveBeenCalled();
        });

        it("rejects a move to a slot where the hiker already has another booking", () => {
            vi.mocked(getActiveBookingsByHiker).mockReturnValue([
                { ...makeReservation(), booking: new Booking(99, HIKER_ID), date: NEW_DATE, start_time: NEW_START },
            ]);

            expect(() => update({ date: NEW_DATE, slot: NEW_START })).toThrow(ConflictError);
            expect(deleteSeatings).not.toHaveBeenCalled();
        });

        it("does not look for other bookings when the slot is unchanged", () => {
            update({ partySize: 2 });

            expect(getActiveBookingsByHiker).not.toHaveBeenCalled();
        });
    });

    describe("party size, same slot", () => {
        it("does not touch the seats when nothing about the seating changes", () => {
            const response = update({ partySize: 4, requirements: [] });

            expect(deleteSeatings).not.toHaveBeenCalled();
            expect(insertSeatings).not.toHaveBeenCalled();
            expect(response.seatings).toEqual(seatsOf([1, 4]));
        });

        it.each([
            { label: "from the last table", from: [[1, 3], [2, 2]], to: 3, expected: [[1, 3]] },
            { label: "across tables", from: [[1, 3], [2, 2]], to: 1, expected: [[1, 1]] },
        ] as { label: string; from: [number, number][]; to: number; expected: [number, number][] }[])(
            "decreasing releases the seats $label and never asks for a new arrangement",
            ({ from, to, expected }) => {
                vi.mocked(getBooking).mockReturnValue(makeReservation(from));

                const response = update({ partySize: to });

                expect(deleteSeatings).toHaveBeenCalledExactlyOnceWith(RES_ID);
                expect(insertSeatings).toHaveBeenCalledExactlyOnceWith(RES_ID, DAY, START_TIME, seatsOf(...expected));
                expect(getBookingAvailability).not.toHaveBeenCalled();
                expect(response.partySize).toBe(to);
                expect(response.seatings).toEqual(seatsOf(...expected));
            },
        );

        it.each([
            { label: "one table", from: [[1, 2]], free: [table(1, 4, 2)], to: 4, expected: [[1, 4]] },
            { label: "several tables", from: [[1, 2], [2, 2]], free: [table(1, 4, 1), table(2, 4, 2)], to: 7, expected: [[1, 3], [2, 4]] },
        ] as { label: string; from: [number, number][]; free: ReturnType<typeof table>[]; to: number; expected: [number, number][] }[])(
            "increasing keeps the assigned tables when the extra people fit on $label",
            ({ from, free, to, expected }) => {
                vi.mocked(getBooking).mockReturnValue(makeReservation(from));
                vi.mocked(getTablesAvailability).mockReturnValue(free);

                const response = update({ partySize: to });

                expect(getTablesAvailability).toHaveBeenCalledWith(DAY, START_TIME);
                expect(getBookingAvailability).not.toHaveBeenCalled();
                expect(insertSeatings).toHaveBeenCalledWith(RES_ID, DAY, START_TIME, seatsOf(...expected));
                expect(response.partySize).toBe(to);
            },
        );

        // Clarification: no longer fits at the assigned tables -> new booking with the MH-01 rules
        it("increasing beyond the assigned tables releases the seats and assigns the tables again", () => {
            vi.mocked(getBooking).mockReturnValue(makeReservation([[1, 2]]));
            vi.mocked(getTablesAvailability).mockReturnValue([table(1, 4, 1)]); // only 1 of the 2 extra seats fits
            vi.mocked(getBookingAvailability).mockReturnValue(seatsOf([3, 4]));

            const response = update({ partySize: 4 });

            expect(getBookingAvailability).toHaveBeenCalledExactlyOnceWith(DAY, START_TIME, 4);
            // The old seats must be released before asking, or they would count as taken
            expect(vi.mocked(deleteSeatings).mock.invocationCallOrder[0])
                .toBeLessThan(vi.mocked(getBookingAvailability).mock.invocationCallOrder[0]);
            expect(insertSeatings).toHaveBeenCalledExactlyOnceWith(RES_ID, DAY, START_TIME, seatsOf([3, 4]));
            expect(response.seatings).toEqual(seatsOf([3, 4]));
        });

        it.each([
            { label: "null", availability: null },
            { label: "an empty arrangement", availability: [] },
        ])("refuses the increase with ConflictError when there are not enough seats ($label)", ({ availability }) => {
            vi.mocked(getBooking).mockReturnValue(makeReservation([[1, 2]]));
            vi.mocked(getTablesAvailability).mockReturnValue([table(1, 4, 0)]);
            vi.mocked(getBookingAvailability).mockReturnValue(availability);

            expect(() => update({ partySize: 9 })).toThrow(ConflictError);
            // The throw happens inside the transaction: the released seats are rolled back
            expect(inTransaction).toHaveBeenCalledTimes(1);
            expect(insertSeatings).not.toHaveBeenCalled();
            expect(replaceRequirements).not.toHaveBeenCalled();
        });
    });

    describe("date and time", () => {
        it("moves the booking: releases the seats and assigns the new slot with the same party size", () => {
            vi.mocked(getBookingAvailability).mockReturnValue(seatsOf([2, 4]));

            const response = update({ date: NEW_DATE, slot: NEW_START });

            expect(getSlot).toHaveBeenCalledWith(NEW_DATE, NEW_START);
            expect(deleteSeatings).toHaveBeenCalledExactlyOnceWith(RES_ID);
            expect(getBookingAvailability).toHaveBeenCalledExactlyOnceWith(NEW_DATE, NEW_START, 4);
            expect(insertSeatings).toHaveBeenCalledExactlyOnceWith(RES_ID, NEW_DATE, NEW_START, seatsOf([2, 4]));
            expect(response).toEqual({
                id: RES_ID, date: NEW_DATE, slot: NEW_START, partySize: 4,
                seatings: seatsOf([2, 4]), requirements: [],
            });
        });

        it("uses the new party size when slot and party size change together", () => {
            vi.mocked(getBookingAvailability).mockReturnValue(seatsOf([3, 6]));

            const response = update({ date: NEW_DATE, slot: NEW_START, partySize: 6 });

            expect(getBookingAvailability).toHaveBeenCalledWith(NEW_DATE, NEW_START, 6);
            expect(response.partySize).toBe(6);
        });

        it("never reuses the old tables for a different slot", () => {
            vi.mocked(getBookingAvailability).mockReturnValue(seatsOf([3, 6]));

            update({ date: NEW_DATE, partySize: 6 });

            expect(getTablesAvailability).not.toHaveBeenCalled();
        });

        it("refuses the move with ConflictError when the new slot has not enough seats", () => {
            vi.mocked(getBookingAvailability).mockReturnValue(null);

            expect(() => update({ date: NEW_DATE, slot: NEW_START })).toThrow(ConflictError);
            expect(insertSeatings).not.toHaveBeenCalled();
        });
    });

    describe("dietary requirements", () => {
        it("replaces the requirements without touching the seats", () => {
            vi.mocked(replaceRequirements).mockReturnValue([new DietaryRequirement(5, RES_ID, true, "Peanuts")]);

            const response = update({ requirements: [{ hasAllergies: true, details: "Peanuts" }] });

            expect(replaceRequirements).toHaveBeenCalledExactlyOnceWith(RES_ID, [{ allergy_flag: true, description: "Peanuts" }]);
            expect(deleteSeatings).not.toHaveBeenCalled();
            expect(response.requirements).toEqual([new RequirementDTO(true, "Peanuts")]);
            expect(response.requirements[0]).toBeInstanceOf(RequirementDTO);
        });

        it("removes all the requirements when an empty list is given", () => {
            vi.mocked(getBooking).mockReturnValue(makeReservation([[1, 4]], [new DietaryRequirement(1, RES_ID, false, "2 vegetarians")]));

            const response = update({ requirements: [] });

            expect(replaceRequirements).toHaveBeenCalledExactlyOnceWith(RES_ID, []);
            expect(response.requirements).toEqual([]);
        });

        it("keeps the existing requirements when the field is omitted", () => {
            vi.mocked(getBooking).mockReturnValue(makeReservation([[1, 4]], [new DietaryRequirement(1, RES_ID, true, "1 shellfish allergy")]));

            const response = update({ partySize: 2 });

            expect(replaceRequirements).not.toHaveBeenCalled();
            expect(response.requirements).toEqual([{ hasAllergies: true, details: "1 shellfish allergy" }]);
        });

        it("does not save the new requirements when the capacity is refused", () => {
            vi.mocked(getBookingAvailability).mockReturnValue(null);

            expect(() => update({ date: NEW_DATE, requirements: [{ hasAllergies: false, details: "1 vegan" }] }))
                .toThrow(ConflictError);
            expect(replaceRequirements).not.toHaveBeenCalled();
        });
    });
});
