import { ErrorDTO } from '../models/dto/error-dto';
import { AccountResponseDTO } from '../models/dto/account-dto';
import { AvailableTableDTO, GetAvailabilityResponseDTO, SlotConfigurationDTO, SlotDTO, SlotTableDTO } from '../models/dto/slot-dto';
import { CreateReservationResponseDTO, RequirementDTO, SeatingDTO } from '../models/dto/reservation-dto';
import { SlotAvailability, SlotConfiguration } from '../dao/slot-dao';
import { Account } from '../models/entities/account';
import { Booking } from '../models/entities/booking';
import { DietaryRequirement } from '../models/entities/dietary_requirement';
import { SeatedAt } from '../models/entities/seated_at';
import { Slot } from '../models/entities/slot';
import { AppError } from '../models/errors/app-error';
import type { Assignment } from '../dao/booking-dao';
import { minutesToTime, timeToMinutes } from './date-service';

/**
 * Maps an operational AppError or a generic internal error into an ErrorDTO instance.
 */
export const appErrorToDTO = (error: unknown): ErrorDTO => {
    let errorDTO: ErrorDTO;

    if (error instanceof AppError) {
        errorDTO = new ErrorDTO(
            error.statusCode,
            error.name,
            error.message
        );
    } else {
        // Fallback for unhandled internal server errors (500)
        errorDTO = new ErrorDTO(
            500,
            "InternalServerError",
            "An unexpected error occurred"
        );
    }

    return errorDTO;
};

/**
 * Maps an Account entity into a client-ready AccountResponseDTO instance (no password data).
 */
export const accountEntityToResponseDTO = (account: Account): AccountResponseDTO => {
    return new AccountResponseDTO(account.id, account.email, account.role);
};

/**
 * Maps a slot with its availability into a client-ready SlotDTO instance.
 */
export const slotAvailabilityToSlotDTO = ({ slot, total_seats, available_seats }: SlotAvailability): SlotDTO => {
    return new SlotDTO(slot.date, slot.start_time, slot.duration, total_seats, available_seats);
};

/**
 * Maps a slot with its tables into a client-ready SlotConfigurationDTO instance.
 */
export const slotConfigurationToDTO = ({ slot, tables }: SlotConfiguration): SlotConfigurationDTO => {
    const tableDTOs = tables.map((t) => new SlotTableDTO(t.table_number, t.seats));
    const totalSeats = tables.reduce((sum, t) => sum + t.seats, 0);
    const endTime = minutesToTime(timeToMinutes(slot.start_time) + slot.duration);
    return new SlotConfigurationDTO(slot.date, slot.start_time, endTime, tableDTOs, totalSeats);
};

/**
 * Maps a newly created Booking, its seatings and its dietary requirements into a client-ready CreateReservationResponseDTO instance.
 */
export const bookingDataToCreateReservationResponseDTO = (
    booking: Booking,
    seatings: SeatedAt[],
    requirements: DietaryRequirement[],
    date: string,
    start_time: string
): CreateReservationResponseDTO => {
    const partySize = seatings.reduce((sum, s) => sum + s.assigned_seats, 0);
    const seatingDTOs = seatings.map((s) => new SeatingDTO(s.table_number, s.assigned_seats));
    const requirementDTOs = requirements.map((r) => new RequirementDTO(r.allergy_flag, r.description));
    return new CreateReservationResponseDTO(booking.id, date, start_time, partySize, seatingDTOs, requirementDTOs);
};

/**
 * Converts a proposed assignment into the public availability response.
 */
export const assignmentsToAvailabilityResponseDTO = (
    assignments: Assignment[] | null
): GetAvailabilityResponseDTO => {
    const available = (assignments ?? []).map(
        (assignment) => new AvailableTableDTO(
            assignment.table_number,
            assignment.assigned_seats
        )
    );

    return new GetAvailabilityResponseDTO(available);
};