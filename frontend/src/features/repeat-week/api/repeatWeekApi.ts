import { apiClient } from '../../../api/client';
import { formatLocalDate, normaliseConfiguration } from '../../slot-setup/utils/slotSetup.utils';
import type { SlotConfiguration } from '../../slot-setup/types/slotSetup.types';
import { addDays, parseDate } from '../utils/weeks';

export interface RepeatWeekResult {
  sourceWeekStart: string;
  targetWeekStarts: string[];
  slotsPerWeek: number;
}

// POST /slots/copy-week: copies the slots, tables and seats of one week into later weeks
export async function copyWeek(sourceWeekStart: string, targetWeekStarts: string[]): Promise<RepeatWeekResult> {
  const data: unknown = await apiClient.post('/slots/copy-week', { sourceWeekStart, targetWeekStarts });
  const r = (data ?? {}) as Record<string, unknown>;
  if (
    typeof r.sourceWeekStart !== 'string' ||
    !Array.isArray(r.targetWeekStarts) ||
    typeof r.slotsPerWeek !== 'number'
  ) {
    throw new Error('Unexpected answer from the server.');
  }
  return {
    sourceWeekStart: r.sourceWeekStart,
    targetWeekStarts: r.targetWeekStarts.filter((w): w is string => typeof w === 'string'),
    slotsPerWeek: r.slotsPerWeek,
  };
}

// GET /slots/configurations: the slots (with their tables and seats) of one week, in time order
export async function fetchWeekSlots(weekStart: string): Promise<SlotConfiguration[]> {
  const to = formatLocalDate(addDays(parseDate(weekStart), 6));
  const data: unknown = await apiClient.get(`/slots/configurations?from=${weekStart}&to=${to}&limit=100`);
  if (!Array.isArray(data)) return [];
  return data
    .map(normaliseConfiguration)
    .filter((c): c is SlotConfiguration => c !== null)
    .sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));
}