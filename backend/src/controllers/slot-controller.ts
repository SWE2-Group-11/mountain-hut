import { getAvailableSlotsByDate } from "../dao/slot-dao";
import { GetSlotsRequestDTO, SlotDTO } from "../models/dto/slot-dto";
import { slotAvailabilityToSlotDTO } from "../services/mapper-service";
import { isBookingOpen } from "../services/booking-rules";

/**
 * Retrieves the slots of a day that can still be booked, with their availability.
 * @param request The request payload containing the date (YYYY-MM-DD).
 * @returns The bookable slots, or [] if none is available.
 */
export const getSlots = (request: GetSlotsRequestDTO): SlotDTO[] =>
    getAvailableSlotsByDate(request.date)
        .filter(({ slot }) => isBookingOpen(slot))
        .map(slotAvailabilityToSlotDTO);