import { getAvailableSlotsByDate, getSlot } from "../dao/slot-dao";
import { GetSlotsRequestDTO, SlotDTO , GetAvailabilityRequestDTO, GetAvailabilityResponseDTO} from "../models/dto/slot-dto";
import { slotAvailabilityToSlotDTO, assignmentsToAvailabilityResponseDTO } from "../services/mapper-service";
import { isBookingOpen } from "../services/booking-rules";
import {getBookingAvailability} from "../dao/booking-dao";
import {NotFoundError} from "../models/errors/notfound-error";

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