import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStaffReservation, searchStaffHikers } from "../../controllers/reservation-controller";
import { getSlot } from "../../dao/slot-dao";
import { hasBookingInSlot, saveBooking } from "../../dao/booking-dao";
import { getHikerById, searchHikersFilter, type HikerProfile } from "../../dao/hiker-dao";
import { createHikerAccount } from "../../dao/account-dao";
import { inTransaction } from "../../database/database";
import { notifyBookingCreated } from "../../notifications/booking-confirmation";
import { RequirementDTO, type CreateStaffReservationRequestDTO } from "../../models/dto/reservation-dto";
import { Booking } from "../../models/entities/booking";
import { SeatedAt } from "../../models/entities/seated_at";
import { Slot } from "../../models/entities/slot";
import { Hiker } from "../../models/entities/account";
import { DietaryRequirement } from "../../models/entities/dietary_requirement";
import { BadRequestError } from "../../models/errors/badrequest-error";
import { ConflictError } from "../../models/errors/conflict-error";
import { NotFoundError } from "../../models/errors/notfound-error";

/*
UNIT tests for the controllers of MH-07 "Reserve for a hiker" (an employee books a table for a hiker).
Covered: createStaffReservation (existing, temporary and registered hiker) and searchStaffHikers.
*/

vi.mock("../../dao/slot-dao", () => ({ getSlot: vi.fn() }));
vi.mock("../../dao/booking-dao", () => ({ hasBookingInSlot: vi.fn(), saveBooking: vi.fn() }));
vi.mock("../../dao/hiker-dao", () => ({ getHikerById: vi.fn(), searchHikersFilter: vi.fn() }));
vi.mock("../../dao/account-dao", () => ({ createHikerAccount: vi.fn() }));
vi.mock("../../dao/dietary-requirement-dao", () => ({ replaceRequirements: vi.fn() }));
vi.mock("../../database/database", () => ({ inTransaction: vi.fn() }));
vi.mock("../../notifications/booking-confirmation", () => ({ notifyBookingCreated: vi.fn() }));

const DAY = "2030-06-15";
const START_TIME = "12:00";          // 10:00Z in the hut timezone (Europe/Rome, CEST)
const SLOT_START_UTC = "2030-06-15T10:00:00Z";
const BOOKING_ID = 42;
const HIKER_ID = 7;
const NEW_ACCOUNT_ID = 11;

const BASE = { date: DAY, slot: START_TIME, partySize: 4 };

const EXISTING: CreateStaffReservationRequestDTO = { ...BASE, hiker: { mode: "existing", hikerId: HIKER_ID } };
const TEMPORARY: CreateStaffReservationRequestDTO = {
    ...BASE, hiker: { mode: "temporary", fullname: "Paolo Verdi", mobile_number: "+39 340 111 2233" },
};
const REGISTERED: CreateStaffReservationRequestDTO = {
    ...BASE,
    hiker: {
        mode: "registered",
        fullname: "Anna Neri",
        mobile_number: "+39 333 444 5555",
        email: "anna.neri@mountainhut.test",
        notes: "Arrives late",
        emergency_contact: "Luca Neri +39 333 000 0000",
    },
};

const profile = (id: number | null, booking_id: number | null = null): HikerProfile => ({
    id, booking_id, full_name: "Mario Rossi", mobile_number: "+39 300 123 4567", email: id === null ? null : "mario@mountainhut.test",
});

const saved = (hiker_id: number | null, requirements: DietaryRequirement[] = []) => ({
    booking: new Booking(BOOKING_ID, hiker_id),
    seatings: [new SeatedAt(BOOKING_ID, DAY, START_TIME, 1, 4)],
    dietary_requirements: requirements,
});

beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    // 30 minutes before the slot: inside the hiker cutoff, still open for staff
    vi.setSystemTime(new Date("2030-06-15T09:30:00Z"));
    vi.mocked(inTransaction).mockImplementation((callback) => callback());
    vi.mocked(getSlot).mockReturnValue(new Slot(DAY, START_TIME, 60));
    vi.mocked(hasBookingInSlot).mockReturnValue(false);
    vi.mocked(getHikerById).mockReturnValue(profile(HIKER_ID));
    vi.mocked(createHikerAccount).mockReturnValue(new Hiker(
        NEW_ACCOUNT_ID, "anna.neri@mountainhut.test", "salt", "hash", true,
        "Anna Neri", "+39 333 444 5555", "Arrives late", "Luca Neri +39 333 000 0000",
    ));
    vi.mocked(saveBooking).mockImplementation((hiker) => saved(typeof hiker === "number" ? hiker : null));
});

afterEach(() => vi.useRealTimers());

describe("POST /reservations (staff) — createStaffReservation controller", () => {
    describe("common rules", () => {
        it("runs everything inside a single transaction", () => {
            vi.mocked(inTransaction).mockReturnValue(null);

            createStaffReservation(REGISTERED);

            expect(inTransaction).toHaveBeenCalledTimes(1);
            expect(getSlot).not.toHaveBeenCalled();
            expect(createHikerAccount).not.toHaveBeenCalled();
        });

        it("throws NotFoundError when the slot does not exist, without writing", () => {
            vi.mocked(getSlot).mockReturnValue(null);

            expect(() => createStaffReservation(REGISTERED)).toThrow(NotFoundError);
            expect(getSlot).toHaveBeenCalledWith(DAY, START_TIME);
            expect(createHikerAccount).not.toHaveBeenCalled();
            expect(saveBooking).not.toHaveBeenCalled();
        });

        it("ignores the hiker 2-hour cutoff: books a slot starting in 30 minutes", () => {
            expect(createStaffReservation(EXISTING).id).toBe(BOOKING_ID);
            expect(saveBooking).toHaveBeenCalledTimes(1);
        });

        it("still books exactly when the slot starts", () => {
            vi.setSystemTime(new Date(SLOT_START_UTC));

            expect(createStaffReservation(EXISTING).id).toBe(BOOKING_ID);
        });

        it.each([
            { label: "one millisecond after the start", now: "2030-06-15T10:00:00.001Z" },
            { label: "on a past day", now: "2030-06-16T08:00:00Z" },
        ])("rejects a slot that has already started ($label) without writing", ({ now }) => {
            vi.setSystemTime(new Date(now));

            expect(() => createStaffReservation(REGISTERED)).toThrow(BadRequestError);
            expect(createHikerAccount).not.toHaveBeenCalled();
            expect(saveBooking).not.toHaveBeenCalled();
        });

        it("forwards the dietary requirements to the DAO and returns them mapped", () => {
            vi.mocked(saveBooking).mockReturnValue(saved(HIKER_ID, [
                new DietaryRequirement(1, BOOKING_ID, true, "1 peanut allergy"),
                new DietaryRequirement(2, BOOKING_ID, false, "2 vegetarians"),
            ]));

            const response = createStaffReservation({
                ...EXISTING,
                requirements: [
                    { hasAllergies: true, details: "1 peanut allergy" },
                    { hasAllergies: false, details: "2 vegetarians" },
                ],
            });

            expect(saveBooking).toHaveBeenCalledExactlyOnceWith(HIKER_ID, DAY, START_TIME, 4, [
                { allergy_flag: true, description: "1 peanut allergy" },
                { allergy_flag: false, description: "2 vegetarians" },
            ]);
            expect(response.requirements).toEqual([
                new RequirementDTO(true, "1 peanut allergy"),
                new RequirementDTO(false, "2 vegetarians"),
            ]);
            expect(response.requirements[0]).toBeInstanceOf(RequirementDTO);
        });

        it("forwards an empty requirement list when none are declared", () => {
            createStaffReservation(EXISTING);

            expect(saveBooking).toHaveBeenCalledWith(HIKER_ID, DAY, START_TIME, 4, []);
        });

        it("never sends the confirmation email", () => {
            createStaffReservation(EXISTING);
            createStaffReservation(TEMPORARY);
            createStaffReservation(REGISTERED);

            expect(notifyBookingCreated).not.toHaveBeenCalled();
        });

        it("propagates an unexpected DAO failure for the global 500 handler", () => {
            const failure = new Error("simulated booking write failure");
            vi.mocked(saveBooking).mockImplementation(() => { throw failure; });

            expect(() => createStaffReservation(EXISTING)).toThrow(failure);
        });
    });

    describe("existing hiker", () => {
        it("books for the hiker account and returns its id without a password", () => {
            const response = createStaffReservation(EXISTING);

            expect(getHikerById).toHaveBeenCalledExactlyOnceWith(HIKER_ID);
            expect(hasBookingInSlot).toHaveBeenCalledExactlyOnceWith(HIKER_ID, DAY, START_TIME);
            expect(createHikerAccount).not.toHaveBeenCalled();
            expect(response).toEqual({
                id: BOOKING_ID,
                date: DAY,
                slot: START_TIME,
                partySize: 4,
                seatings: [{ table_number: 1, assigned_seats: 4 }],
                requirements: [],
                hikerId: HIKER_ID,
            });
            expect(response).not.toHaveProperty("initialPassword");
        });

        it.each([
            { label: "does not exist", found: null },
            { label: "is a temporary hiker without account", found: profile(null, 3) },
        ])("throws NotFoundError when the hiker $label, without saving", ({ found }) => {
            vi.mocked(getHikerById).mockReturnValue(found);

            expect(() => createStaffReservation(EXISTING)).toThrow(NotFoundError);
            expect(saveBooking).not.toHaveBeenCalled();
        });

        it("throws ConflictError when the hiker already has a booking in the slot, without saving", () => {
            vi.mocked(hasBookingInSlot).mockReturnValue(true);

            expect(() => createStaffReservation(EXISTING)).toThrow(ConflictError);
            expect(saveBooking).not.toHaveBeenCalled();
        });

        it("throws ConflictError when the capacity is no longer available", () => {
            vi.mocked(saveBooking).mockReturnValue(null);

            expect(() => createStaffReservation(EXISTING)).toThrow(ConflictError);
            expect(saveBooking).toHaveBeenCalledTimes(1);
        });
    });

    describe("temporary hiker", () => {
        it("saves the hiker data with the booking and returns a null hikerId", () => {
            const response = createStaffReservation(TEMPORARY);

            expect(saveBooking).toHaveBeenCalledExactlyOnceWith(
                { full_name: "Paolo Verdi", mobile_number: "+39 340 111 2233" }, DAY, START_TIME, 4, [],
            );
            expect(response.hikerId).toBeNull();
            expect(response).not.toHaveProperty("initialPassword");
        });

        it("stores a null mobile number when it is omitted", () => {
            createStaffReservation({ ...BASE, hiker: { mode: "temporary", fullname: "Paolo Verdi" } });

            expect(saveBooking).toHaveBeenCalledWith(
                { full_name: "Paolo Verdi", mobile_number: null }, DAY, START_TIME, 4, [],
            );
        });

        it("skips the duplicate-booking check: a temporary hiker has no account", () => {
            createStaffReservation(TEMPORARY);

            expect(hasBookingInSlot).not.toHaveBeenCalled();
            expect(getHikerById).not.toHaveBeenCalled();
            expect(createHikerAccount).not.toHaveBeenCalled();
        });

        it("throws ConflictError when the capacity is no longer available", () => {
            vi.mocked(saveBooking).mockReturnValue(null);

            expect(() => createStaffReservation(TEMPORARY)).toThrow(ConflictError);
        });
    });

    describe("registered hiker", () => {
        it("creates an account that must change the generated password, and books for it", () => {
            const response = createStaffReservation(REGISTERED);

            const input = vi.mocked(createHikerAccount).mock.calls[0][0];
            expect(createHikerAccount).toHaveBeenCalledTimes(1);
            expect(input).toEqual({
                full_name: "Anna Neri",
                mobile_number: "+39 333 444 5555",
                email: "anna.neri@mountainhut.test",
                password: expect.any(String),
                notes: "Arrives late",
                emergency_contact: "Luca Neri +39 333 000 0000",
                must_change_password: true,
            });
            expect(hasBookingInSlot).toHaveBeenCalledWith(NEW_ACCOUNT_ID, DAY, START_TIME);
            expect(saveBooking).toHaveBeenCalledWith(NEW_ACCOUNT_ID, DAY, START_TIME, 4, []);
            expect(response.hikerId).toBe(NEW_ACCOUNT_ID);
            // The password stored is the one delivered to the staff
            expect(response.initialPassword).toBe(input.password);
        });

        it("generates a non-trivial URL-safe initial password", () => {
            const { initialPassword } = createStaffReservation(REGISTERED);

            expect(initialPassword).toMatch(/^[A-Za-z0-9_-]{24}$/);
        });

        it("generates a different password for every account", () => {
            const first = createStaffReservation(REGISTERED).initialPassword;
            const second = createStaffReservation(REGISTERED).initialPassword;

            expect(first).not.toBe(second);
        });

        it("stores null notes and emergency contact when they are omitted", () => {
            const { notes: _n, emergency_contact: _e, ...hiker } = REGISTERED.hiker as Extract<
                CreateStaffReservationRequestDTO["hiker"], { mode: "registered" }
            >;

            createStaffReservation({ ...BASE, hiker });

            expect(createHikerAccount).toHaveBeenCalledWith(expect.objectContaining({
                notes: null, emergency_contact: null,
            }));
        });

        it("throws ConflictError when the email is already registered, without saving", () => {
            vi.mocked(createHikerAccount).mockReturnValue(null);

            expect(() => createStaffReservation(REGISTERED)).toThrow(ConflictError);
            expect(saveBooking).not.toHaveBeenCalled();
        });

        it("throws ConflictError on missing capacity after the account was created (rolled back by the transaction)", () => {
            vi.mocked(saveBooking).mockReturnValue(null);

            expect(() => createStaffReservation(REGISTERED)).toThrow(ConflictError);
            expect(createHikerAccount).toHaveBeenCalledTimes(1);
            expect(inTransaction).toHaveBeenCalledTimes(1);
        });
    });
});

describe("GET /accounts/hikers (staff) — searchStaffHikers controller", () => {
    it("forwards the criteria to the DAO", () => {
        vi.mocked(searchHikersFilter).mockReturnValue([]);

        expect(searchStaffHikers({ name: "ross", phone: "300" })).toEqual([]);
        expect(searchHikersFilter).toHaveBeenCalledExactlyOnceWith({ name: "ross", phone: "300" });
    });

    it("maps registered and temporary hikers to the response DTO", () => {
        vi.mocked(searchHikersFilter).mockReturnValue([
            profile(HIKER_ID),
            { id: null, booking_id: 3, full_name: "Paolo Verdi", mobile_number: null, email: null },
        ]);

        expect(searchStaffHikers({ name: "o" })).toEqual([
            {
                id: HIKER_ID, bookingId: null, fullname: "Mario Rossi",
                mobile_number: "+39 300 123 4567", email: "mario@mountainhut.test", hasAccount: true,
            },
            {
                id: null, bookingId: 3, fullname: "Paolo Verdi",
                mobile_number: null, email: null, hasAccount: false,
            },
        ]);
    });
});
