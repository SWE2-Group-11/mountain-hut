import { ErrorDTO } from '../models/dto/error-dto';
import { SlotDTO } from '../models/dto/slot-dto';
import { CreateReservationResponseDTO, SeatingDTO } from '../models/dto/reservation-dto';
import { SlotAvailability } from '../dao/slot-dao';
import { Booking } from '../models/entities/booking';
import { SeatedAt } from '../models/entities/seated_at';
import { AppError } from '../models/errors/app-error';

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
 * Maps a slot with its availability into a client-ready SlotDTO instance.
 */
export const slotAvailabilityToSlotDTO = ({ slot, total_seats, available_seats }: SlotAvailability): SlotDTO => {
    return new SlotDTO(slot.date, slot.start_time, slot.duration, total_seats, available_seats);
};

/**
 * Maps a newly created Booking and its seatings into a client-ready CreateReservationResponseDTO instance.
 */
export const bookingDataToCreateReservationResponseDTO = (
    booking: Booking,
    seatings: SeatedAt[],
    date: string,
    start_time: string
): CreateReservationResponseDTO => {
    const partySize = seatings.reduce((sum, s) => sum + s.assigned_seats, 0);
    const seatingDTOs = seatings.map((s) => new SeatingDTO(s.table_number, s.assigned_seats));
    return new CreateReservationResponseDTO(booking.id, date, start_time, partySize, seatingDTOs);
};