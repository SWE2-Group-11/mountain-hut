import { ErrorDTO } from '../models/dto/error-dto';
import { AccountResponseDTO } from '../models/dto/account-dto';
import { SlotConfigurationDTO, SlotDTO, SlotTableDTO } from '../models/dto/slot-dto';
import { CreateReservationResponseDTO, SeatingDTO } from '../models/dto/reservation-dto';
import { SlotAvailability, SlotConfiguration } from '../dao/slot-dao';
import { Account } from '../models/entities/account';
import { Booking } from '../models/entities/booking';
import { SeatedAt } from '../models/entities/seated_at';
import { Slot } from '../models/entities/slot';
import { AppError } from '../models/errors/app-error';
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
 * Derives the numeric configuration identifier of a slot from its primary key,
 * as YYYYMMDDHHmm: the schema has no configuration table, every slot is a saved configuration.
 */
export const slotToConfigurationId = (slot: Slot): number =>
    Number(`${slot.date}${slot.start_time}`.replace(/\D/g, ""));

/**
 * Recovers the primary key of a slot from its configuration identifier.
 * @returns The slot key, or null if the identifier is not formatted as YYYYMMDDHHmm.
 */
export const configurationIdToSlotKey = (configurationId: number): { date: string; start_time: string } | null => {
    const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(String(configurationId));
    if (!match) return null;
    const [, year, month, day, hours, minutes] = match;
    return { date: `${year}-${month}-${day}`, start_time: `${hours}:${minutes}` };
};

/**
 * Maps a slot with its tables into a client-ready SlotConfigurationDTO instance.
 */
export const slotConfigurationToDTO = ({ slot, tables }: SlotConfiguration): SlotConfigurationDTO => {
    const tableDTOs = tables.map((t) => new SlotTableDTO(t.table_number, t.seats));
    const totalSeats = tables.reduce((sum, t) => sum + t.seats, 0);
    const endTime = minutesToTime(timeToMinutes(slot.start_time) + slot.duration);
    return new SlotConfigurationDTO(slotToConfigurationId(slot), slot.date, slot.start_time, endTime, tableDTOs, totalSeats);
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