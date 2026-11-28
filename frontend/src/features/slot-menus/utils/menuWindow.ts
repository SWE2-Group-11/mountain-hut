import { hutNowMinutes, wallClockMinutes } from '../../my-bookings/utils/changeWindow';
import type { DaySlot } from '../types/slotMenus.types';

/**
 * A menu can be defined, changed or removed until its slot starts; after that it stays as it was.
 * The hut works in its own time zone, whatever the time zone of the employee's computer.
 * This only tells the employee in advance: the server makes the final decision.
 */
export const slotHasStarted = (slot: Pick<DaySlot, 'date' | 'startTime'>, now: Date = new Date()): boolean =>
  hutNowMinutes(now) >= wallClockMinutes(slot.date, slot.startTime);