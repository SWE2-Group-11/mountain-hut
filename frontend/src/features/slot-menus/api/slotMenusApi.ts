import { apiClient } from '../../../api/client';
import { normaliseConfiguration } from '../../slot-setup/utils/slotSetup.utils';
import type { DaySlot } from '../types/slotMenus.types';

const asMenu = (data: unknown): string | null => {
  const menu = (data as { menu?: unknown } | null)?.menu;
  return typeof menu === 'string' ? menu : null;
};

// The menu of one slot. GET /slots hides full slots and slots that are about to start, but
// the availability answer carries the menu of any existing slot, so the employee sees them all.
async function fetchSlotMenu(date: string, startTime: string): Promise<string | null> {
  const data = await apiClient.get(`/slots/availability?date=${date}&slot=${startTime}&partySize=1`);
  return asMenu(data);
}

/** Every slot of a day, earliest first, each with its menu. */
export async function fetchDaySlots(date: string): Promise<DaySlot[]> {
  const data = await apiClient.get(`/slots/configurations?from=${date}&to=${date}&limit=100`);
  const configurations = (Array.isArray(data) ? data : [])
    .map(normaliseConfiguration)
    .filter((c) => c !== null)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  return Promise.all(
    configurations.map(async (c) => ({
      date: c.date,
      startTime: c.startTime,
      endTime: c.endTime,
      totalSeats: c.totalSeats,
      menu: await fetchSlotMenu(c.date, c.startTime),
    })),
  );
}

/** The menus already written for other slots, most recently used first, each one once. */
export async function fetchReusableMenus(limit = 20): Promise<string[]> {
  const data = await apiClient.get(`/slots/menus?limit=${limit}`);
  return (Array.isArray(data) ? data : []).filter((m): m is string => typeof m === 'string');
}

/** Sets the menu of one slot only; null removes it. Answers with the menu now stored. */
export async function saveSlotMenu(date: string, startTime: string, menu: string | null): Promise<string | null> {
  const data = await apiClient.put('/slots/menu', { date, startTime, menu });
  return asMenu(data);
}