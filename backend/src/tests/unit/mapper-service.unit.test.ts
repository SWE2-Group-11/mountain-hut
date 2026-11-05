import { SlotTable } from "../../models/entities/slot_table";
import { describe, expect, it } from "vitest";
import { type Assignment } from "../../domain/booking-rules";
import { type SlotConfiguration, type SlotAvailability } from "../../dao/slot-dao";
import { AvailableTableDTO, GetAvailabilityResponseDTO, SlotConfigurationDTO, SlotTableDTO } from "../../models/dto/slot-dto";
import { Booking } from "../../models/entities/booking";
import { SeatedAt } from "../../models/entities/seated_at";
import { Slot } from "../../models/entities/slot";
import { AppError } from "../../models/errors/app-error";
import { BadRequestError } from "../../models/errors/badrequest-error";
import { ConflictError } from "../../models/errors/conflict-error";
import {
    slotConfigurationToDTO,
    appErrorToDTO,
    assignmentsToAvailabilityResponseDTO,
    bookingDataToCreateReservationResponseDTO,
    slotAvailabilityToSlotDTO,
} from "../../services/mapper-service";

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

    it("maps every proposed assignment to the public availability fields, in order", () => {
        // Why: the table split shown to the user must match the DAO's proposal
        const assignments: Assignment[] = [
            { table_number: 3, assigned_seats: 6 },
            { table_number: 1, assigned_seats: 2 },
        ];

        const response = assignmentsToAvailabilityResponseDTO(assignments);

        expect(response).toEqual({
            available: [
                { tableId: 3, assignedSeats: 6 },
                { tableId: 1, assignedSeats: 2 },
            ],
        });
    });

    it.each([
        { label: "null (the party cannot be seated)", assignments: null },
        { label: "an empty list", assignments: [] },
    ])("maps $label to an empty arrangement", ({ assignments }) => {
        // Why: the client always gets a list, never null
        expect(assignmentsToAvailabilityResponseDTO(assignments)).toEqual({ available: [] });
    });

    it("returns DTO instances without database field names", () => {
        // Why: the API returns DTOs, never DAO data
        const response = assignmentsToAvailabilityResponseDTO([
            { table_number: 1, assigned_seats: 4 },
        ]);

        expect(response).toBeInstanceOf(GetAvailabilityResponseDTO);
        expect(response.available[0]).toBeInstanceOf(AvailableTableDTO);
        expect(response.available[0]).not.toHaveProperty("table_number");
        expect(response.available[0]).not.toHaveProperty("assigned_seats");
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

const CAPACITY_DAY = "2030-06-15";
const CAPACITY_TABLES = [{ tableNumber: 3, seats: 4 }, { tableNumber: 7, seats: 6 }];

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

describe("slotConfigurationToDTO", () => {
    it("maps entities to DTOs, sums configured seats and hides persistence fields", () => {
        const response = slotConfigurationToDTO(capacityConfiguration());
        expect(response).toEqual({
            date: CAPACITY_DAY, startTime: "12:15", endTime: "14:00", tables: CAPACITY_TABLES, totalSeats: 10,
        });
        expect(response).toBeInstanceOf(SlotConfigurationDTO);
        for (const table of response.tables) {
            expect(table).toBeInstanceOf(SlotTableDTO);
            expect(Object.keys(table).sort()).toEqual(["seats", "tableNumber"]);
        }
        expect(Object.keys(response).sort()).toEqual(["date", "endTime", "startTime", "tables", "totalSeats"]);
    });

    it.each([
        { startTime: "00:00", duration: 1, endTime: "00:01" },
        { startTime: "09:50", duration: 75, endTime: "11:05" },
        { startTime: "23:00", duration: 59, endTime: "23:59" },
    ])("formats the end of $startTime + $duration minutes as $endTime", ({ startTime, duration, endTime }) => {
        expect(slotConfigurationToDTO(capacityConfiguration(CAPACITY_DAY, startTime, duration)).endTime).toBe(endTime);
    });

    it("preserves table order and does not mutate or share input table objects", () => {
        const input = capacityConfiguration(CAPACITY_DAY, "12:15", 105, [[9, 8], [2, 3]]);
        const snapshot = structuredClone(input);
        const response = slotConfigurationToDTO(input);
        expect(response.tables).toEqual([{ tableNumber: 9, seats: 8 }, { tableNumber: 2, seats: 3 }]);
        response.tables[0].seats = 99;
        expect(input).toEqual(snapshot);
    });

    it("maps an existing configuration without tables to zero configured seats", () => {
        expect(slotConfigurationToDTO(capacityConfiguration(CAPACITY_DAY, "12:00", 60, []))).toEqual({
            date: CAPACITY_DAY, startTime: "12:00", endTime: "13:00", tables: [], totalSeats: 0,
        });
    });
});
