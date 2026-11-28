import { ErrorDTO } from '../models/dto/error-dto';
import { AccountResponseDTO } from '../models/dto/account-dto';
import { AvailableTableDTO, GetAvailabilityResponseDTO, SlotConfigurationDTO, SlotDTO, SlotTableDTO, SlotOccupancyDTO } from '../models/dto/slot-dto';
import { CreateReservationResponseDTO, RequirementDTO, SeatingDTO } from '../models/dto/reservation-dto';
import type { PopularHikeResponseDTO, RegisterHikeResponseDTO } from '../models/dto/hike-dto';
import type { Hike } from '../models/entities/hike';
import type { PopularHike } from '../models/entities/popular_hike';
import { SlotAvailability, SlotConfiguration, SlotOccupancy } from '../dao/slot-dao';
import { Account } from '../models/entities/account';
import { Booking } from '../models/entities/booking';
import { DietaryRequirement } from '../models/entities/dietary_requirement';
import { SeatedAt } from '../models/entities/seated_at';
import { AppError } from '../models/errors/app-error';
import type { Assignment } from '../domain/booking-rules';
import type { Reservation } from '../dao/booking-dao';
import { minutesToTime, timeToMinutes } from './date-service';
import type { RequirementInput } from '../dao/dietary-requirement-dao';

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
    return new AccountResponseDTO(account.id, account.email, account.role, account.must_change_password);
};

/**
 * Maps a slot with its availability into a client-ready SlotDTO instance.
 */
export const slotAvailabilityToSlotDTO = ({ slot, total_seats, available_seats }: SlotAvailability): SlotDTO => {
    return new SlotDTO(slot.date, slot.start_time, slot.duration, total_seats, available_seats, slot.menu);
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
    assignments: Assignment[] | null,
    menu: string | null
): GetAvailabilityResponseDTO => {
    const available = (assignments ?? []).map(
        (assignment) => new AvailableTableDTO(
            assignment.table_number,
            assignment.assigned_seats
        )
    );

    return new GetAvailabilityResponseDTO(available, menu);
};

/**
 * Maps a complete reservation returned by the DAO to its response DTO.
 */
export const reservationToResponseDTO = (
    reservation: Reservation
): CreateReservationResponseDTO =>
    bookingDataToCreateReservationResponseDTO(
        reservation.booking,
        reservation.seatings,
        reservation.dietary_requirements,
        reservation.date,
        reservation.start_time
    );

/**
 * Maps the dietary requirements of a request to the shape the DAO persists.
 * @param requirements The requirements of the request.
 * @returns The requirements to save, in the same order.
 */
export const requirementDTOsToInputs = (requirements: RequirementDTO[] = []): RequirementInput[] =>
    requirements.map((r) => ({ allergy_flag: r.hasAllergies, description: r.details }));

/**
 * Maps a Hike entity to a RegisterHikeResponseDTO.
 * @param hike The Hike entity to map.
 * @returns The corresponding RegisterHikeResponseDTO.
 */
export const hikeToResponseDTO = (hike: Hike): RegisterHikeResponseDTO => ({
    id: hike.id,
    destination: hike.destination,
    route: hike.route,
    passagePoints: hike.passage_points,
    plannedDepartureAt: hike.planned_departure_at,
    expectedReturnAt: hike.expected_return_at,
    completedAt: hike.completed_at,
});

/**
 * Maps a PopularHike entity to a PopularHikeResponseDTO.
 * @param hike The PopularHike entity to map.
 * @returns The corresponding PopularHikeResponseDTO.
 */
export const popularHikeToResponseDTO = (hike: PopularHike): PopularHikeResponseDTO => ({
    id: hike.id,
    destination: hike.destination,
    route: hike.route,
    passagePoints: hike.passage_points,
});
/**
 * Maps a slot's occupancy data to a client-ready SlotOccupancyDTO instance.
 * @param occupancy The occupancy of a slot with its total, available and booked seats.
 * @returns The mapped SlotOccupancyDTO instance.
 */
export const slotOccupanyToDTO = (occupancy: SlotOccupancy): SlotOccupancyDTO => ({
    ...slotAvailabilityToSlotDTO(occupancy),
    bookedSeats: occupancy.booked_seats
});