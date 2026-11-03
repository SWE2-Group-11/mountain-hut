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

/**
 * Data Transfer Object for a table of a slot and its configured seats.
 * Used in POST /slots and GET /slots/configurations
 */
export class SlotTableDTO {
    public tableNumber: number;
    public seats: number;

    constructor(tableNumber: number, seats: number) {
        this.tableNumber = tableNumber;
        this.seats = seats;
    }
}

/**
 * Data Transfer Object for a slot with its table and seat configuration.
 * The slot can be referenced through copyFrom (date + startTime) to reuse its tables.
 * Used in POST /slots and GET /slots/configurations
 */
export class SlotConfigurationDTO {
    public date: string;        // YYYY-MM-DD
    public startTime: string;   // HH:mm
    public endTime: string;     // HH:mm
    public tables: SlotTableDTO[];
    public totalSeats: number;

    constructor(date: string, startTime: string, endTime: string, tables: SlotTableDTO[], totalSeats: number) {
        this.date = date;
        this.startTime = startTime;
        this.endTime = endTime;
        this.tables = tables;
        this.totalSeats = totalSeats;
    }
}

/**
 * Validation schema for a time formatted as HH:mm.
 */
export const TimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/**
 * Validation schema for a table and its configured seats.
 */
const SlotTableSchema = z.object({
    tableNumber: z.number().int().positive(),
    seats: z.number().int().positive(),
});

/**
 * Validation schema for Slot creation payloads.
 * Used in POST /slots
 */
export const CreateSlotRequestSchema = z
    .object({
        date: DateSchema,
        startTime: TimeSchema,
        endTime: TimeSchema,
        tables: z
            .array(SlotTableSchema)
            .min(1)
            .refine(
                (tables) => new Set(tables.map((t) => t.tableNumber)).size === tables.length,
                "Each tableNumber can appear only once"
            )
            .optional(),
        copyFrom: z
            .object({
                date: DateSchema,
                startTime: TimeSchema,
            })
            .optional(),
    })
    .refine(({ startTime, endTime }) => endTime > startTime, {
        path: ["endTime"],
        message: "The end time must be after the start time",
    })
    .refine(({ tables, copyFrom }) => (tables === undefined) !== (copyFrom === undefined), {
        path: ["tables"],
        message: "Exactly one of tables and copyFrom is required",
    });

/**
 * Data Transfer Object for Slot creation payloads, inferred from the schema.
 */
export type CreateSlotRequestDTO = z.infer<typeof CreateSlotRequestSchema>;

/**
 * Validation schema for reusable configurations query parameters.
 * Used in GET /slots/configurations
 */
export const GetConfigurationsRequestSchema = z
    .object({
        from: DateSchema.optional(),
        to: DateSchema.optional(),
        limit: z.coerce.number().int().positive().max(100).default(20),
    })
    .refine(({ from, to }) => !from || !to || from <= to, {
        path: ["from"],
        message: "from must not be after to",
    });

/**
 * Data Transfer Object for saved configurations query parameters, inferred from the schema.
 */
export type GetConfigurationsRequestDTO = z.infer<typeof GetConfigurationsRequestSchema>;

/**
 * Validation schema for GetAvailability query parameters.
 * Used in GET /slots/availability
 */
export const GetAvailabilityRequestSchema = z.object({
    date: DateSchema,
    slot: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    partySize: z.string({ error: "partySize must be a positive integer" })
        .regex(/^[1-9]\d*$/, "partySize must be a positive integer")
        .transform(Number)
        .pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER, "partySize is too large")),
});

export type GetAvailabilityRequestDTO = z.infer<typeof GetAvailabilityRequestSchema>;

/**
 * Proposed seats for one table.
 */
export class AvailableTableDTO {
    public tableId: number;
    public assignedSeats: number;

    constructor(tableId: number, assignedSeats: number) {
        this.tableId = tableId;
        this.assignedSeats = assignedSeats;
    }
}

/**
 * A possible arrangement for the entire party.
 * An empty array means that the party cannot be accommodated.
 */
export class GetAvailabilityResponseDTO {
    public available: AvailableTableDTO[];

    constructor(available: AvailableTableDTO[]) {
        this.available = available;
    }
}
