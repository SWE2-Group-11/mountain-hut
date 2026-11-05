import { z } from "zod";
import { DateSchema, TimeSchema } from "./slot-dto";

/**
 * Data Transfer Object for the seats assigned at a table.
 * Used in POST /reservations
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
 * Data Transfer Object for the dietary requirements of a subset of the party.
 * Used in POST /reservations
 */
export class RequirementDTO {
    public hasAllergies: boolean;
    public details: string;

    constructor(hasAllergies: boolean, details: string) {
        this.hasAllergies = hasAllergies;
        this.details = details;
    }
}

/**
 * Data Transfer Object for Reservation response payloads.
 * Used in POST /reservations
 */
export class CreateReservationResponseDTO {
    public id: number;
    public date: string;         // YYYY-MM-DD
    public slot: string;         // HH:MM
    public partySize: number;
    public seatings: SeatingDTO[];
    public requirements: RequirementDTO[];

    constructor(
        id: number,
        date: string,
        slot: string,
        partySize: number,
        seatings: SeatingDTO[],
        requirements: RequirementDTO[]
    ) {
        this.id = id;
        this.date = date;
        this.slot = slot;
        this.partySize = partySize;
        this.seatings = seatings;
        this.requirements = requirements;
    }
}

/**
 * Validation schema for the dietary requirements of a subset of the party.
 * Both fields are mandatory; the details must have at least one non-space character.
 */
const RequirementSchema = z.object({
    hasAllergies: z.boolean(),
    details: z.string().trim().min(1),
});

/**
 * Validation schema for Reservation request payloads.
 * Used in POST /reservations
 */
export const CreateReservationRequestSchema = z.object({
    date: DateSchema,
    slot: TimeSchema,
    partySize: z.number().int().positive(),
    requirements: z.array(RequirementSchema).optional(),
});

/**
 * Data Transfer Object for Reservation request payloads, inferred from the schema.
 */
export type CreateReservationRequestDTO = z.infer<typeof CreateReservationRequestSchema>;

/**
 * Partial update schema for Reservation request payloads.
 * Used in PATCH /reservations/:id
 */
export const UpdateReservationRequestSchema = CreateReservationRequestSchema.partial().refine(
    (request) => Object.values(request).some((value) => value !== undefined),
    {message: "At least one field must be provided for update."}
);

export type UpdateReservationRequestDTO = z.infer<typeof UpdateReservationRequestSchema>;

export type UpdateReservationResponseDTO = CreateReservationResponseDTO;