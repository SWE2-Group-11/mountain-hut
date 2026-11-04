import { z } from "zod";
import { DateSchema } from "./slot-dto";

/**
 * Data Transfer Object for the seats assigned at a table.
 * Used in POST /reservation
 */
export class SeatingDTO {
    public table_number: number;
    public assigned_seats: number;

    constructor(table_number: number, assigned_seats: number) {
        this.table_number = table_number;
        this.assigned_seats = assigned_seats;
    }
}

/**
 * Data Transfer Object for Reservation response payloads.
 * Used in POST /reservation
 */
export class CreateReservationResponseDTO {
    public id: number;
    public date: string;         // YYYY-MM-DD
    public slot: string;         // HH:MM
    public partySize: number;
    public seatings: SeatingDTO[];

    constructor(id: number, date: string, slot: string, partySize: number, seatings: SeatingDTO[]) {
        this.id = id;
        this.date = date;
        this.slot = slot;
        this.partySize = partySize;
        this.seatings = seatings;
    }
}

/**
 * Validation schema for Reservation request payloads.
 * Used in POST /reservation
 */
export const CreateReservationRequestSchema = z.object({
    date: DateSchema,
    slot: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    partySize: z.number().int().positive(),
});

/**
 * Data Transfer Object for Reservation request payloads, inferred from the schema.
 */
export type CreateReservationRequestDTO = z.infer<typeof CreateReservationRequestSchema>;