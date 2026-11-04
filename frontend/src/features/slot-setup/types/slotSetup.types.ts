export interface TableSetup {
  tableNumber: number;
  seats: number;
}

// An existing slot and its tables, from GET /slots/configurations. It has no id.
export interface SlotConfiguration {
  date: string;
  startTime: string;
  endTime: string;
  tables: TableSetup[];
  totalSeats: number;
}

// Exactly one of the two is sent to POST /slots
export type ConfigurationChoice =
  | { copyFrom: { date: string; startTime: string } }
  | { tables: TableSetup[] };

export type CreateSlotPayload = {
  date: string;
  startTime: string;
  endTime: string;
} & ConfigurationChoice;

// POST /slots answers with the same shape as a configuration
export type CreatedSlot = SlotConfiguration;

export interface TableRow {
  key: number;
  tableNumber: string;
  seats: string;
}

export type SetupMode = 'previous' | 'new';