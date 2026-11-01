import { getAvailableSlotsByDate, getSavedConfigurations, getSlotTables, saveSlot, TableInput } from "../dao/slot-dao";
import {
    CreateSlotRequestDTO,
    GetConfigurationsRequestDTO,
    GetSlotsRequestDTO,
    SlotConfigurationDTO,
    SlotDTO,
} from "../models/dto/slot-dto";
import { ConflictError } from "../models/errors/conflict-error";
import { NotFoundError } from "../models/errors/notfound-error";
import {
    configurationIdToSlotKey,
    slotAvailabilityToSlotDTO,
    slotConfigurationToDTO,
} from "../services/mapper-service";
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
 * Retrieves the saved configurations that can be reused for a new slot.
 * @param request The request payload containing the optional date range and the limit.
 * @returns The configurations, most recent first, or [] if none exists.
 */
export const getConfigurations = (request: GetConfigurationsRequestDTO): SlotConfigurationDTO[] =>
    getSavedConfigurations(request.from ?? null, request.to ?? null, request.limit)
        .map(slotConfigurationToDTO);

/**
 * Retrieves the tables of a saved configuration.
 * @param configurationId The identifier of the configuration.
 * @returns The tables of the configuration.
 * @throws NotFoundError if the configuration does not exist.
 */
const getConfigurationTables = (configurationId: number): TableInput[] => {
    const key = configurationIdToSlotKey(configurationId);
    const tables = key ? getSlotTables(key.date, key.start_time) : [];
    if (tables.length === 0) {
        throw new NotFoundError("The selected configuration does not exist");
    }
    return tables.map(({ table_number, seats }) => ({ table_number, seats }));
};

/**
 * Creates a slot with either a new table configuration or a saved one.
 * @param request The request payload containing the date, the time interval and the configuration.
 * @returns The created slot with its tables.
 * @throws NotFoundError if the referenced configuration does not exist.
 * @throws ConflictError if the slot overlaps an existing slot of the same day.
 */
export const createSlot = (request: CreateSlotRequestDTO): SlotConfigurationDTO => {
    const { date, startTime, endTime, configuration, configurationId } = request;

    // The request schema guarantees that exactly one of the two is provided
    const tables = configuration
        ? configuration.tables.map(({ tableId, seats }) => ({ table_number: tableId, seats }))
        : getConfigurationTables(configurationId!);

    const duration = timeToMinutes(endTime) - timeToMinutes(startTime);
    const created = saveSlot(date, startTime, duration, tables);
    if (!created) {
        throw new ConflictError("The slot overlaps an existing slot of the same day");
    }

    return slotConfigurationToDTO(created);
};
