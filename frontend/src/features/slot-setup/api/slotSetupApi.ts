import { apiClient } from '../../../api/client';
import type { CreatedSlot, CreateSlotPayload, SlotConfiguration } from '../types/slotSetup.types';
import { normaliseConfiguration } from '../utils/slotSetup.utils';

export async function fetchConfigurations(limit = 20): Promise<SlotConfiguration[]> {
  const data = await apiClient.get(`/slots/configurations?limit=${limit}`);
  if (!Array.isArray(data)) return [];
  return data
    .map(normaliseConfiguration)
    .filter((c): c is SlotConfiguration => c !== null);
}

export async function createSlot(payload: CreateSlotPayload): Promise<CreatedSlot> {
  const data = await apiClient.post('/slots', payload);
  const created = normaliseConfiguration(data);
  if (!created) throw new Error('Unexpected answer from the server.');
  return created;
}