import { describe, expect, it } from "vitest";
import { type SlotAvailability } from "../dao/slot-dao";
import { Booking } from "../models/entities/booking";
import { SeatedAt } from "../models/entities/seated_at";
import { Slot } from "../models/entities/slot";
import { AppError } from "../models/errors/app-error";
import { BadRequestError } from "../models/errors/badrequest-error";
import { ConflictError } from "../models/errors/conflict-error";
import {
    appErrorToDTO,
    bookingDataToCreateReservationResponseDTO,
    slotAvailabilityToSlotDTO,
} from "../services/mapper-service";

const DAY = "2030-06-15";
const START_TIME = "12:00";
const HIKER_ID = 7;
const BOOKING_ID = 42;

function makeSeating(tableNumber: number, assignedSeats: number): SeatedAt {
    return new SeatedAt(
        BOOKING_ID, DAY, START_TIME, tableNumber, assignedSeats,
    );
}

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

describe("response mappers", () => {
    it("maps a slot with availability to the public response fields", () => {
        expect(slotAvailabilityToSlotDTO(
            makeAvailability("12:00", 12, 5),
        )).toEqual({
            date: DAY,
            start_time: "12:00",
            duration: 60,
            total_seats: 12,
            available_seats: 5,
        });
    });

    it("calculates partySize from every seating and omits database foreign keys", () => {
        expect(bookingDataToCreateReservationResponseDTO(
            new Booking(BOOKING_ID, HIKER_ID),
            [makeSeating(1, 3), makeSeating(2, 2)],
            DAY,
            START_TIME,
        )).toEqual({
            id: BOOKING_ID,
            date: DAY,
            slot: START_TIME,
            partySize: 5,
            seatings: [
                { table_number: 1, assigned_seats: 3 },
                { table_number: 2, assigned_seats: 2 },
            ],
        });
    });
});

describe("ErrorDTO mapping — HTTP status values, not HTTP integration", () => {
    it.each([
        { error: new BadRequestError("Invalid request"), code: 400, name: "BadRequestError" },
        { error: new ConflictError("Capacity unavailable"), code: 409, name: "ConflictError" },
    ])("preserves the operational $code error", ({ error, code, name }) => {
        expect(error).toBeInstanceOf(AppError);
        expect(appErrorToDTO(error)).toEqual({
            code, name, message: error.message,
        });
    });

    it.each([
        new Error("private SQL details"),
        "an unexpected thrown string",
        null,
        undefined,
    ])("returns a generic 500 without exposing unexpected details: %s", (error) => {
        expect(appErrorToDTO(error)).toEqual({
            code: 500,
            name: "InternalServerError",
            message: "An unexpected error occurred",
        });
    });
});
