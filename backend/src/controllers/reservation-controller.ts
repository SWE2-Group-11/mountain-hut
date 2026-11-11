import { getSlot } from "../dao/slot-dao";
// TODO: Change the import path to use the new DAO once it is implemented
import { saveBooking, hasBookingInSlot, getBooking, deleteBooking } from "../dao/booking-dao";
import { CreateReservationRequestDTO, CreateReservationResponseDTO } from "../models/dto/reservation-dto";
import { inTransaction } from "../database/database";
import { NotFoundError } from "../models/errors/notfound-error";
import { BadRequestError } from "../models/errors/badrequest-error";
import { ConflictError } from "../models/errors/conflict-error";
import { ForbiddenError } from "../models/errors/forbidden-error";
import { bookingDataToCreateReservationResponseDTO } from "../services/mapper-service";
import { isBookingOpen } from "../domain/booking-rules";
import { BOOKING_CUTOFF_HOURS } from "../config/config";
import { notifyBookingCreated } from "../notifications/booking-confirmation";

/**
 * Creates a reservation for the authenticated hiker, seating the party
 * on as few tables as possible.
 * @param hiker_id The ID of the authenticated hiker.
 * @param request The request payload containing date, slot, party size and the
 *        optional dietary requirements of the party.
 * @returns The created booking with the tables assigned and the declared requirements.
 * Sends the booking confirmation email in the background once the booking is saved.
 * @throws BadRequestError if the slot does not exist or starts in less than BOOKING_CUTOFF_HOURS hours.
 * @throws ConflictError if the requested capacity is no longer available.
 * @throws ConflictError if the hiker already has a booking in the slot
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

    if (hasBookingInSlot(hiker_id, slot.date, slot.start_time)) {
        throw new ConflictError("You already have a booking for this date and time");
    }
  
    const requirements = (request.requirements ?? []).map((r) => ({
        allergy_flag: r.hasAllergies,
        description: r.details,
    }));
    const result = saveBooking(hiker_id, slot.date, slot.start_time, request.partySize, requirements);
    if (!result) {
        throw new ConflictError("The requested capacity is no longer available");
    }

    notifyBookingCreated(result.booking.id);

    return bookingDataToCreateReservationResponseDTO(
        result.booking, result.seatings, result.dietary_requirements, slot.date, slot.start_time
    );
};


/**
 * Cancels a reservation for the authenticated hiker.
 * @param hiker_id The ID of the authenticated hiker.
 * @param reservation_id The ID of the reservation to cancel.
 * @throws NotFoundError if the reservation does not exist.
 * @throws ForbiddenError if the reservation does not belong to the authenticated hiker.
 * @throws ConflictError if the reservation could not be cancelled.
 */
export const cancelReservation = (hiker_id: number, reservation_id: number): void => inTransaction(() => {
    const reservation = getBooking(reservation_id);
    if (!reservation) {
        throw new NotFoundError("The reservation does not exist");
    }
    if(reservation.booking.hiker_id !== hiker_id) {
        throw new ForbiddenError("This reservation does not belong to the authenticated hiker");
    }
    // TODO: integrate with the correct DAO once it is implemented
    const deleted =deleteBooking(reservation_id);

    if(!deleted) {
        throw new ConflictError("The reservation could not be cancelled");
    }
});