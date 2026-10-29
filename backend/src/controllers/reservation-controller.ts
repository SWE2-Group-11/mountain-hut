import { getSlot } from "../dao/slot-dao";
import { saveBooking } from "../dao/booking-dao";
import { CreateReservationRequestDTO, CreateReservationResponseDTO } from "../models/dto/reservation-dto";
import { BadRequestError } from "../models/errors/badrequest-error";
import { ConflictError } from "../models/errors/conflict-error";
import { bookingDataToCreateReservationResponseDTO } from "../services/mapper-service";
import { isBookingOpen } from "../services/booking-rules";
import { BOOKING_CUTOFF_HOURS } from "../config/config";

/**
 * Creates a reservation for the authenticated hiker, seating the party
 * on as few tables as possible.
 * @param hiker_id The ID of the authenticated hiker.
 * @param request The request payload containing date, slot and party size.
 * @returns The created booking with the tables assigned.
 * @throws BadRequestError if the slot does not exist or starts in less than
 *         BOOKING_CUTOFF_HOURS hours.
 * @throws ConflictError if the requested capacity is no longer available.
 */
export const createReservation = (
    hiker_id: number,
    request: CreateReservationRequestDTO
): CreateReservationResponseDTO => {
    const slot = getSlot(request.date, request.slot);
    if (!slot) {
        throw new BadRequestError("The selected date and time are not available");
    }
    if (!isBookingOpen(slot)) {
        throw new BadRequestError(
            `Reservations are allowed up to ${BOOKING_CUTOFF_HOURS} hours before the slot starts`
        );
    }

    const result = saveBooking(hiker_id, slot.date, slot.start_time, request.partySize);
    if (!result) {
        throw new ConflictError("The requested capacity is no longer available");
    }

    return bookingDataToCreateReservationResponseDTO(result.booking, result.seatings, slot.date, slot.start_time);
};