import { z } from "zod";

/**
 * Checks that a YYYY-MM-DD string is a real calendar date (e.g. rejects 2026-02-30).
 */
const isRealDate = (value: string): boolean => {
    const [y, m, d] = value.split("-").map(Number);
    const parsed = new Date(y, m - 1, d);
    return parsed.getFullYear() === y && parsed.getMonth() === m - 1 && parsed.getDate() === d;
};

/**
 * Validation schema for a date formatted as YYYY-MM-DD.
 * Shared by the slot and reservation request schemas.
 */
export const DateSchema = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(isRealDate);

/**
 * Data Transfer Object for Slot response payloads.
 * Used in GET /slots
 */
export class SlotDTO {
    public date: string;        // YYYY-MM-DD
    public start_time: string;  // HH:MM
    public duration: number;
    public total_seats: number;
    public available_seats: number;

    constructor(date: string, start_time: string, duration: number, total_seats: number, available_seats: number) {
        this.date = date;
        this.start_time = start_time;
        this.duration = duration;
        this.total_seats = total_seats;
        this.available_seats = available_seats;
    }
}

/**
 * Validation schema for Slot query parameters.
 * Used in GET /slots
 */
export const GetSlotsRequestSchema = z.object({
    date: DateSchema,
});

/**
 * Data Transfer Object for Slot query parameters, inferred from the schema.
 */
export type GetSlotsRequestDTO = z.infer<typeof GetSlotsRequestSchema>;