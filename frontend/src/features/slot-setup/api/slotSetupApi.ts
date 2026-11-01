import { apiClient } from '../../../api/client';
import type { CreatedSlot, CreateSlotPayload, SlotConfiguration } from '../types/slotSetup.types';
import { normaliseConfiguration, sumSeats } from '../utils/slotSetup.utils';

// GET /slots/configurations - saved table setups that can be reused
export async function fetchConfigurations(limit = 20): Promise<SlotConfiguration[]> {
  const data = await apiClient.get(`/slots/configurations?limit=${limit}`);
  if (!Array.isArray(data)) return [];
  return data
    .map(normaliseConfiguration)
    .filter((c): c is SlotConfiguration => c !== null);
}

// POST /slots - create one slot with a new or a saved configuration
export async function createSlot(
  payload: CreateSlotPayload,
  fallbackTables: CreatedSlot['tables'],
): Promise<CreatedSlot> {
  const data = await apiClient.post('/slots', payload);
  const id = typeof data?.id === 'number' ? data.id : null;
  const created = normaliseConfiguration(data?.configuration ?? data);
  const tables = created?.tables ?? fallbackTables;
  return {
    id,
    date: payload.date,
    startTime: payload.startTime,
    endTime: payload.endTime,
    tables,
    totalSeats: created?.totalSeats ?? sumSeats(tables),
  };
}
