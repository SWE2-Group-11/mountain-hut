import { getSlot } from "../dao/slot-dao";
import {
    deleteSeatings,
    getActiveBookingsByHiker,
    getBooking,
    getBookingAvailability,
    insertSeatings,
    saveBooking,
    hasBookingInSlot, 
    deleteBooking,
} from "../dao/booking-dao";
import { replaceRequirements } from "../dao/dietary-requirement-dao";
import { inTransaction } from "../database/database";
import {
    CreateReservationRequestDTO,
    CreateReservationResponseDTO,
    ReservationWithMenuResponseDTO,
    UpdateReservationRequestDTO,
    UpdateReservationResponseDTO,
} from "../models/dto/reservation-dto";
import { NotFoundError } from "../models/errors/notfound-error";
import { BadRequestError } from "../models/errors/badrequest-error";
import { ConflictError } from "../models/errors/conflict-error";
import { ForbiddenError } from "../models/errors/forbidden-error";
import {
    bookingDataToCreateReservationResponseDTO,
    requirementDTOsToInputs,
    reservationToResponseDTO,
} from "../services/mapper-service";
import { isBookingOpen, isChangeOpen } from "../domain/booking-rules";
import { BOOKING_CUTOFF_HOURS, HUT_TIMEZONE, CHANGE_BOOKING_CUTOFF_HOURS } from "../config/config";
import { notifyBookingCreated } from "../notifications/booking-confirmation";

import { randomBytes } from "node:crypto";
import { DateTime } from "luxon";
import type {
    CreateStaffReservationRequestDTO,
    CreateStaffReservationResponseDTO,
    SearchStaffHikersRequestDTO,
    StaffHikerDTO,
} from "../models/dto/reservation-dto";
import {
    searchHikersFilter,
    getHikerById,
} from "../dao/hiker-dao";
import { createHikerAccount } from "../dao/account-dao";
import type { TemporaryHikerInput } from "../dao/booking-dao";
import { notifyBookingChanged } from "../notifications/booking-change";

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
): ReservationWithMenuResponseDTO => {
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
  
    const requirements = requirementDTOsToInputs(request.requirements);

    const result = saveBooking(hiker_id, slot.date, slot.start_time, request.partySize, requirements);
    if (!result) {
        throw new ConflictError("The requested capacity is no longer available");
    }

    void notifyBookingCreated(result.booking.id);

    const reservation = bookingDataToCreateReservationResponseDTO(
        result.booking,
        result.seatings,
        result.dietary_requirements,
        slot.date,
        slot.start_time,
    );
    return {...reservation, menu: slot.menu};
};

/**
 * Retrieves the authenticated hiker's active reservations.
 * @returns A list of the hiker's active reservations.
 */
export const getReservations = (hiker_id: number): ReservationWithMenuResponseDTO[] => {
    const now = DateTime.now().setZone(HUT_TIMEZONE).toFormat("yyyy-MM-dd HH:mm");

    return getActiveBookingsByHiker(hiker_id, now).map((reservation) => ({
        ...reservationToResponseDTO(reservation),
        menu: getSlot(reservation.date, reservation.start_time)?.menu ?? null,
    }));
};

/** The route validates the query and authorizes employee/warden first. 
 * @returns A list of hikers matching the search criteria, with their booking ID if they have a reservation in the requested slot.
*/

export const searchStaffHikers = (
    request: SearchStaffHikersRequestDTO
): StaffHikerDTO[] => searchHikersFilter(request).map((hiker) => ({
    id: hiker.id,
    bookingId: hiker.booking_id,
    fullname: hiker.full_name,
    mobile_number: hiker.mobile_number,
    email: hiker.email,
    hasAccount: hiker.id !== null,
}));

/**
 * Creates a reservation for an existing, temporary or newly registered hiker.
 * Account creation and booking use the same database transaction.
 * @returns The created booking with the tables assigned and the declared requirements.
 * If a new account is created, the initial password is returned to be delivered to the hiker.
 * @throws NotFoundError if the requested slot does not exist or the hiker ID does not exist.
 * @throws BadRequestError if the change is attempted after the slot has started.
 * @throws ConflictError if the hiker already has a booking in the requested slot, if the requested capacity is no longer available, or if an account with the provided email already exists.
 */
export const createStaffReservation = (
    request: CreateStaffReservationRequestDTO
): CreateStaffReservationResponseDTO => inTransaction(() => {
    const slot = getSlot(request.date, request.slot);
    if (!slot) {
        throw new NotFoundError("The requested slot does not exist");
    }

    const start = DateTime.fromISO(`${slot.date}T${slot.start_time}`, {
        zone: HUT_TIMEZONE,
    });
    const now = DateTime.now().setZone(HUT_TIMEZONE);

    // Staff can book until the slot starts, without the hiker's cutoff.
    if (now.toMillis() > start.toMillis()) {
        throw new BadRequestError("Staff reservations cannot be made after the slot has started");
    }

    const customer = request.hiker;
    let hiker: number | TemporaryHikerInput;
    let initialPassword: string | undefined;

    switch (customer.mode) {
        case "existing": {
            const profile = getHikerById(customer.hikerId);
            if (!profile || profile.id === null) {
                throw new NotFoundError("Hiker not found");
            }

            hiker = profile.id;
            break;
        }

        case "temporary": {
            hiker = {
                full_name: customer.fullname,
                mobile_number: customer.mobile_number ?? null,
            };
            break;
        }

        case "registered": {
            initialPassword = randomBytes(18).toString("base64url");

            const account = createHikerAccount({
                full_name: customer.fullname,
                mobile_number: customer.mobile_number,
                email: customer.email,
                password: initialPassword,
                notes: customer.notes ?? null,
                emergency_contact: customer.emergency_contact ?? null,
                must_change_password: true,
            });

            if (!account) {
                throw new ConflictError("An account with this email already exists");
            }

            hiker = account.id;
            break;
        }
    }

    // Temporary hikers have no account id.
    if (typeof hiker === "number" && hasBookingInSlot(hiker, slot.date, slot.start_time)) {
        throw new ConflictError("The hiker already has a booking for this slot");
    }

    const requirements = requirementDTOsToInputs(request.requirements);

    const result = saveBooking(
        hiker,
        slot.date,
        slot.start_time,
        request.partySize,
        requirements
    );

    if (!result) {
        // Throwing also rolls back a newly created account.
        throw new ConflictError( "The requested capacity is no longer available");
    }

    return {
        ...bookingDataToCreateReservationResponseDTO(
            result.booking,
            result.seatings,
            result.dietary_requirements,
            slot.date,
            slot.start_time
        ),
        hikerId: result.booking.hiker_id,
        ...(initialPassword === undefined ? {} : { initialPassword }),
    };
});

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
): UpdateReservationResponseDTO => {
    const response = inTransaction(() => {
        const reservation = getBooking(reservation_id);
        if (!reservation) {
            throw new NotFoundError("Reservation not found");
        }
        if (reservation.booking.hiker_id !== hiker_id) {
            throw new ForbiddenError("The reservation belongs to another user");
        }
        if (!isChangeOpen(reservation.date, reservation.start_time)) {
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
        if (!isBookingOpen(slot)) {
            throw new BadRequestError(
                `The requested slot must start at least ${BOOKING_CUTOFF_HOURS} hours from now`
            );
        }

        const slotChanged = date !== reservation.date || start_time !== reservation.start_time;

        // All the seatings of a booking are in one slot, so in a different slot
        // any booking found belongs to another reservation.
        if (slotChanged && hasBookingInSlot(hiker_id, date, start_time)) {
            throw new ConflictError("You already have a reservation in the requested slot");
        }

        // MH-06 clarification: a new slot or party size is treated as a new booking.
        // The seats are released first, or they would count as taken; if the tables cannot
        // be assigned again, the throw rolls back the release and the booking stays as it was.
        let seatings = reservation.seatings;
        if (slotChanged || party_size !== reservation.party_size) {
            deleteSeatings(reservation_id);
            const assignment = getBookingAvailability(date, start_time, party_size);
            if (!assignment || assignment.length === 0) {
                throw new ConflictError("The requested capacity is no longer available");
            }
            seatings = insertSeatings(reservation_id, date, start_time, assignment);
        }

        const dietary_requirements = request.requirements === undefined
            ? reservation.dietary_requirements
            : replaceRequirements(reservation_id, requirementDTOsToInputs(request.requirements));

        const updatedReservation = reservationToResponseDTO({
            ...reservation,
            date,
            start_time,
            party_size,
            seatings,
            dietary_requirements,
        });

        return {...updatedReservation, menu: slot.menu};
    });

    // Only after the commit: a refused or rolled back change must not be notified
    void notifyBookingChanged(reservation_id);
    return response;
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
    if (reservation.booking.hiker_id !== hiker_id) {
        throw new ForbiddenError("This reservation does not belong to the authenticated hiker");
    }

    const deleted = deleteBooking(reservation_id);

    if (!deleted) {
        throw new ConflictError("The reservation could not be cancelled");
    }
});
