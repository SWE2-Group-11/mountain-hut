import { getSlot } from "../dao/slot-dao";
import { saveBooking, hasBookingInSlot } from "../dao/booking-dao";
import { CreateReservationRequestDTO, CreateReservationResponseDTO } from "../models/dto/reservation-dto";
import { BadRequestError } from "../models/errors/badrequest-error";
import { ConflictError } from "../models/errors/conflict-error";
import { bookingDataToCreateReservationResponseDTO } from "../services/mapper-service";
import { isBookingOpen } from "../domain/booking-rules";
import { BOOKING_CUTOFF_HOURS } from "../config/config";
import { notifyBookingCreated } from "../notifications/booking-confirmation";

import { randomBytes } from "node:crypto";
import { DateTime } from "luxon";
import { inTransaction } from "../database/database";
import { HUT_TIMEZONE } from "../config/config";
import { NotFoundError } from "../models/errors/notfound-error";
import type {
    CreateStaffReservationRequestDTO,
    CreateStaffReservationResponseDTO,
    SearchStaffHikersRequestDTO,
    StaffHikerDTO,
} from "../models/dto/reservation-dto";

// TODO(MH-107): integrate functions to look for hikers and create temporary hikers, and to create a hiker account for a registered hiker.
import {
    searchHikers,
    getHikerById,
    createTemporaryHiker,
} from "../dao/hiker-dao";

// TODO(MH-107): integrate registration function
import { createHikerAccount } from "../dao/account-dao";

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

/** The route validates the query and authorizes employee/warden first. */
export const searchStaffHikers = (
    request: SearchStaffHikersRequestDTO
): StaffHikerDTO[] => {
    // TODO(MH-107): adapt function to the new hiker DAO, including temporary hikers. Retains the current search by name or email.
    return searchHikers(request).map((hiker) => ({
        id: hiker.id,
        fullname: hiker.full_name,
        mobile_number: hiker.mobile_number,
        email: hiker.email,
        hasAccount: hiker.account_id !== null,
    }));
};

/**
 * Creates a reservation for an existing, temporary or newly registered hiker.
 *
 * TODO(MH-107): all future DAO operations must be synchronous and use the
 * same SQLite connection as inTransaction, so an error rolls back the new
 * profile/account together with the booking.
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

    // Staff can book until the slot starts: do not apply the hiker's 2-hour cutoff.
    if (now.toMillis() > start.toMillis()) {
        throw new BadRequestError(
            "Staff reservations cannot be made after the slot has started"
        );
    }

    let hikerId: number;
    let initialPassword: string | undefined;
    const customer = request.hiker;

    switch (customer.mode) {
        case "existing": {
            // TODO(MH-107): align the lookup and returned id with the new hiker DAO.
            const hiker = getHikerById(customer.hikerId);
            if (!hiker) {
                throw new NotFoundError("Hiker not found");
            }
            hikerId = hiker.id;
            break;
        }

        case "temporary": {
            // TODO(MH-107): create only a hiker profile, without a login account.
            const hiker = createTemporaryHiker({
                full_name: customer.fullname,
                mobile_number: customer.mobile_number ?? null,
            });
            hikerId = hiker.id;
            break;
        }

        case "registered": {
            initialPassword = randomBytes(18).toString("base64url");

            // TODO(MH-107): align this call with the registration DAO.
            // Persist the change-password flag; authentication must enforce it
            // and the regular account must support email password recovery.
            const hiker = createHikerAccount({
                full_name: customer.fullname,
                mobile_number: customer.mobile_number,
                email: customer.email,
                password: initialPassword,
                notes: customer.notes ?? null,
                emergency_contact: customer.emergency_contact ?? null,
                must_change_password: true,
            });
            if (!hiker) {
                throw new ConflictError("An account with this email already exists");
            }
            // TODO(MH-107): use the profile id if the DAO returns an account wrapper.
            hikerId = hiker.id;
            break;
        }
    }

    // TODO(MH-107): adapt the existing function to the new hiker identity,
    // including temporary profiles. Retains the current one-booking-per-slot rule.
    if (hasBookingInSlot(hikerId, slot.date, slot.start_time)) {
        throw new ConflictError("The hiker already has a booking for this slot");
    }

    const requirements = (request.requirements ?? []).map((requirement) => ({
        allergy_flag: requirement.hasAllergies,
        description: requirement.details,
    }));

    // TODO(MH-107): adapt saveBooking to the new profile/booking model.
    // It must also accept temporary hikers, recheck capacity and save all data
    // atomically. Return null when capacity is insufficient; no 2-hour cutoff.
    const result = saveBooking(
        hikerId,
        slot.date,
        slot.start_time,
        request.partySize,
        requirements
    );
    if (!result) {
        throw new ConflictError("The requested capacity is no longer available");
    }

    // TODO(MH-107): verify the mapper against the future booking entity.
    // The current mapper only needs booking.id, seatings and requirements.
    const reservation = bookingDataToCreateReservationResponseDTO(
        result.booking,
        result.seatings,
        result.dietary_requirements,
        slot.date,
        slot.start_time
    );

    return {
        ...reservation,
        hikerId,
        ...(initialPassword === undefined ? {} : { initialPassword }),
    };
});
