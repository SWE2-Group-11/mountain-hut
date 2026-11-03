import { getAvailableSlotsByDate, getSavedConfigurations, getSlot, getSlotTables, saveSlot, TableInput } from "../dao/slot-dao";
import { getBookingAvailability } from "../dao/booking-dao";
import {
    CreateSlotRequestDTO,
    GetAvailabilityRequestDTO,
    GetAvailabilityResponseDTO,
    GetConfigurationsRequestDTO,
    GetSlotsRequestDTO,
    SlotConfigurationDTO,
    SlotDTO,
} from "../models/dto/slot-dto";
import { BadRequestError } from "../models/errors/badrequest-error";
import { ConflictError } from "../models/errors/conflict-error";
import { NotFoundError } from "../models/errors/notfound-error";
import { assignmentsToAvailabilityResponseDTO, slotAvailabilityToSlotDTO, slotConfigurationToDTO } from "../services/mapper-service";
import { isBookingOpen } from "../services/booking-rules";
import { timeToMinutes } from "../services/date-service";

/**
 * Retrieves the slots of a day that can still be booked, with their availability.
 * @param request The request payload containing the date (YYYY-MM-DD).
 * @returns The bookable slots, or [] if none is available.
 */
export const getSlots = (request: GetSlotsRequestDTO): SlotDTO[] =>
    getAvailableSlotsByDate(request.date)
        .filter(({ slot }) => isBookingOpen(slot))
        .map(slotAvailabilityToSlotDTO);

/**
 * Retrieves the table configurations of existing slots, so that they can be reused through copyFrom.
 * @param request The request payload containing the optional date range and the limit.
 * @returns The configurations, most recent first, or [] if no slot exists.
 */
export const getConfigurations = (request: GetConfigurationsRequestDTO): SlotConfigurationDTO[] =>
    getSavedConfigurations(request.from ?? null, request.to ?? null, request.limit)
        .map(slotConfigurationToDTO);

/**
 * Retrieves the tables of an existing slot, to be copied into a new one.
 * @param date The day of the source slot (YYYY-MM-DD).
 * @param startTime The start time of the source slot (HH:mm).
 * @returns The tables of the source slot, never empty.
 * @throws NotFoundError if the source slot does not exist.
 * @throws BadRequestError if the source slot has no tables to copy.
 */
const getCopiedTables = (date: string, startTime: string): TableInput[] => {
    if (!getSlot(date, startTime)) {
        throw new NotFoundError("The slot referenced by copyFrom does not exist");
    }
    const tables = getSlotTables(date, startTime);
    if (tables.length === 0) {
        throw new BadRequestError("The slot referenced by copyFrom has no tables to copy");
    }
    return tables.map(({ table_number, seats }) => ({ table_number, seats }));
};

/**
 * Creates a slot with either new tables or the tables copied from an existing slot.
 * @param request The request payload containing the date, the time interval and the tables or copyFrom.
 * @returns The created slot with its tables.
 * @throws NotFoundError if the slot referenced by copyFrom does not exist.
 * @throws BadRequestError if the slot referenced by copyFrom has no tables to copy.
 * @throws ConflictError if the slot overlaps an existing slot of the same day.
 */
export const createSlot = (request: CreateSlotRequestDTO): SlotConfigurationDTO => {
    const { date, startTime, endTime, tables, copyFrom } = request;

    // The request schema guarantees that exactly one of the two is provided
    const slotTables = tables
        ? tables.map(({ tableNumber, seats }) => ({ table_number: tableNumber, seats }))
        : getCopiedTables(copyFrom!.date, copyFrom!.startTime);

    const duration = timeToMinutes(endTime) - timeToMinutes(startTime);
    const created = saveSlot(date, startTime, duration, slotTables);
    if (!created) {
        throw new ConflictError("The slot overlaps an existing slot of the same day");
    }

    return slotConfigurationToDTO(created);
};

/**
 * Checks availability and proposes a table arrangement.
 * @param request The request payload containing date, slot and party size.
 * @returns An object containing the proposed arrangement in available, or available: [] if the party cannot be accommodated
 * @throws NotFoundError if the slot does not exist.
 */
export const getAvailability = (
    request: GetAvailabilityRequestDTO
): GetAvailabilityResponseDTO => {
    const slot = getSlot(request.date, request.slot);

    if (!slot) {
        throw new NotFoundError("Slot not found");
    }

    if (!isBookingOpen(slot)) {
        return assignmentsToAvailabilityResponseDTO(null);
    }

    const assignments = getBookingAvailability(
        slot.date,
        slot.start_time,
        request.partySize
    );

    return assignmentsToAvailabilityResponseDTO(assignments);
};
