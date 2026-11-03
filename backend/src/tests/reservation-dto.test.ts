import { describe, expect, it } from "vitest";
import {
    CreateReservationRequestSchema,
    type CreateReservationRequestDTO,
} from "../models/dto/reservation-dto";

const VALID_REQUEST: CreateReservationRequestDTO = {
    date: "2030-06-15",
    slot: "12:00",
    partySize: 4,
};

describe("POST /reservations — CreateReservationRequestSchema", () => {
    it("accepts the mandatory fields", () => {
        const result = CreateReservationRequestSchema.safeParse(VALID_REQUEST);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data).toEqual(VALID_REQUEST);
        }
    });

    it.each(["date", "slot", "partySize"])(
        "rejects a missing mandatory field: %s",
        (field) => {
            const body: Record<string, unknown> = { ...VALID_REQUEST };
            delete body[field];
            expect(CreateReservationRequestSchema.safeParse(body).success)
                .toBe(false);
        },
    );

    it.each(["00:00", "09:30", "12:00", "23:59"])(
        "accepts the HH:mm time %s",
        (slot) => {
            expect(CreateReservationRequestSchema.safeParse({
                ...VALID_REQUEST, slot,
            }).success).toBe(true);
        },
    );

    it.each(["24:00", "12:60", "-1:00", "9:30", "12:00:00", "12:00x", ""])(
        "rejects an invalid or non-padded time: %s",
        (slot) => {
            expect(CreateReservationRequestSchema.safeParse({
                ...VALID_REQUEST, slot,
            }).success).toBe(false);
        },
    );

    it("rejects a numeric slot identifier: this DTO expects a time string", () => {
        expect(CreateReservationRequestSchema.safeParse({
            ...VALID_REQUEST, slot: 12,
        }).success).toBe(false);
    });

    it("rejects an impossible date in the reservation body", () => {
        expect(CreateReservationRequestSchema.safeParse({
            ...VALID_REQUEST, date: "2030-02-30",
        }).success).toBe(false);
    });

    it.each([1, 4, 20])("accepts positive integer partySize=%s", (partySize) => {
        expect(CreateReservationRequestSchema.safeParse({
            ...VALID_REQUEST, partySize,
        }).success).toBe(true);
    });

    it.each([0, -1, 1.5, NaN, Infinity, "4", true, null])(
        "rejects a non-positive, fractional or non-numeric partySize: %s",
        (partySize) => {
            expect(CreateReservationRequestSchema.safeParse({
                ...VALID_REQUEST, partySize,
            }).success).toBe(false);
        },
    );

    it.each([null, undefined, [], "not an object"])(
        "rejects an invalid body: %s",
        (body) => {
            expect(CreateReservationRequestSchema.safeParse(body).success)
                .toBe(false);
        },
    );
});
