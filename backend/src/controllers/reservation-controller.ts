import { getSlot } from "../dao/slot-dao";
import {
    deleteSeatings,
    getActiveBookingsByHiker,
    getBooking,
    getBookingAvailability,
    insertSeatings,
    saveBooking,
    hasBookingInSlot,
    getTablesAvailability,
} from "../dao/booking-dao";
import { replaceRequirements } from "../dao/dietary-requirement-dao";
import { inTransaction } from "../database/database";
import {
    CreateReservationRequestDTO,
    CreateReservationResponseDTO,
    UpdateReservationRequestDTO,
    UpdateReservationResponseDTO,
} from "../models/dto/reservation-dto";
import { BadRequestError } from "../models/errors/badrequest-error";
import { ConflictError } from "../models/errors/conflict-error";
import { ForbiddenError } from "../models/errors/forbidden-error";
import { NotFoundError } from "../models/errors/notfound-error";
import {
    bookingDataToCreateReservationResponseDTO,
    reservationToResponseDTO,
} from "../services/mapper-service";
import { isBookingOpen } from "../domain/booking-rules";
import type { Assignment } from "../domain/booking-rules";
import { BOOKING_CUTOFF_HOURS, HUT_TIMEZONE, CHANGE_BOOKING_CUTOFF_HOURS } from "../config/config";
import { notifyBookingCreated } from "../notifications/booking-confirmation";
import {DateTime} from "luxon";

/**
 * Creates a reservation for the authenticated hiker, seating the party
 * on as few tables as possible.
 * @param hiker_id The ID of the authenticated hiker.
 * @param request The request payload containing date, slot, party size and the
 *        optional dietary requirements of the party.
 * @returns The created booking with the tables assigned and the declared requirements.
 * Sends the booking confirmation email in the background once the booking is saved.
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
    if (hasBookingInSlot(hiker_id, slot.date, slot.start_time)) {
    throw new ConflictError(
        "You already have a booking for this date and time"
        ); 
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
 * Retrieves the authenticated hiker's active reservations.
 */
export const getReservations = (hiker_id: number): CreateReservationResponseDTO[] => {
    const now = DateTime.now().setZone(HUT_TIMEZONE).toFormat("yyyy-MM-dd HH:mm");

    return getActiveBookingsByHiker(hiker_id, now).map(reservationToResponseDTO);
};

/**
 * Updates a reservation belonging to the authenticated hiker.
 * The route must validate the request and reservation identifier.
 * @param hiker_id The ID of the authenticated hiker.
 * @param reservation_id The ID of the reservation to update.
 * @param request The request payload containing the new date, slot, party size and/or dietary requirements.
 * @returns The updated booking with the tables assigned and the declared requirements.
 * @throws NotFoundError if the reservation does not exist or the requested slot does not exist.
 * @throws ForbiddenError if the reservation belongs to another hiker.
 * @throws BadRequestError if the change is attempted after the change deadline or if the requested slot starts in less than BOOKING_CUTOFF_HOURS hours.
 * @throws ConflictError if the hiker already has a booking in the requested slot or if the requested capacity is no longer available.
 */
export const updateReservation = (
    hiker_id: number,
    reservation_id: number,
    request: UpdateReservationRequestDTO
): UpdateReservationResponseDTO => inTransaction(() => {
    const reservation = getBooking(reservation_id);

    if (!reservation) {
        throw new NotFoundError("Reservation not found");
    }

    if (reservation.booking.hiker_id !== hiker_id) {
        throw new ForbiddenError(
            "The reservation belongs to another user"
        );
    }

    const now = DateTime.now().setZone(HUT_TIMEZONE);

    const changeDeadline = DateTime.fromISO(
        `${reservation.date}T${reservation.start_time}`,
        { zone: HUT_TIMEZONE }
    ).minus({ hours: CHANGE_BOOKING_CUTOFF_HOURS });

    if (now.toMillis() > changeDeadline.toMillis()) {
        throw new BadRequestError(
            `Reservations can only be changed up to ${CHANGE_BOOKING_CUTOFF_HOURS} hours before the original slot starts`
        );
    }

    const date = request.date ?? reservation.date;
    const start_time = request.slot ?? reservation.start_time;
    const party_size = request.partySize ?? reservation.party_size;

    const slot = getSlot(date, start_time);

    if (!slot) {
        throw new NotFoundError("The requested slot does not exist");
    }

    if (!isBookingOpen(slot, now.toJSDate())) {
        throw new BadRequestError(
            `The requested slot must start at least ${BOOKING_CUTOFF_HOURS} hours from now`
        );
    }

    const slotChanged = date !== reservation.date || start_time !== reservation.start_time;

    if (slotChanged) {
        const bookings = getActiveBookingsByHiker(
            hiker_id,
            now.toFormat("yyyy-MM-dd HH:mm")
        );

        const alreadyBooked = bookings.some((other) =>
            other.booking.id !== reservation_id &&
            other.date === date &&
            other.start_time === start_time
        );

        if (alreadyBooked) {
            throw new ConflictError(
                "You already have a reservation in the requested slot"
            );
        }
    }

    let seatings = reservation.seatings;

    if (slotChanged || party_size !== reservation.party_size) {
        let assignment: Assignment[] | null = null;

        if (!slotChanged) {
            assignment = reservation.seatings.map((seating) => ({
                table_number: seating.table_number,
                assigned_seats: seating.assigned_seats,
            }));

            if (party_size > reservation.party_size) {
                const freeByTable = new Map(
                    getTablesAvailability(date, start_time).map((table) => [
                        table.table_number,
                        table.free_seats,
                    ])
                );

                let seatsToAdd = party_size - reservation.party_size;

                for (const table of assignment) {
                    const added = Math.min(
                        seatsToAdd,
                        freeByTable.get(table.table_number) ?? 0
                    );

                    table.assigned_seats += added;
                    seatsToAdd -= added;
                }

                if (seatsToAdd > 0) assignment = null;
            } else {
                let seatsToRemove = reservation.party_size - party_size;

                for (let i = assignment.length - 1; i >= 0; i--) {
                    const removed = Math.min(
                        seatsToRemove,
                        assignment[i].assigned_seats
                    );

                    assignment[i].assigned_seats -= removed;
                    seatsToRemove -= removed;
                }

                assignment = assignment.filter(
                    (table) => table.assigned_seats > 0
                );
            }
        }

        deleteSeatings(reservation_id);

        if (assignment === null) {
            assignment = getBookingAvailability(date, start_time, party_size);
        }

        if (!assignment || assignment.length === 0) {
            throw new ConflictError(
                "The requested capacity is no longer available"
            );
        }

        seatings = insertSeatings(
            reservation_id,
            date,
            start_time,
            assignment
        );
    }

    const requirements = request.requirements === undefined ? reservation.dietary_requirements: replaceRequirements(
            reservation_id,
            request.requirements.map((requirement) => ({
                allergy_flag: requirement.hasAllergies,
                description: requirement.details,
            }))
        );

    return reservationToResponseDTO({
        ...reservation,
        date,
        start_time,
        party_size,
        seatings,
        dietary_requirements: requirements,
    });
});