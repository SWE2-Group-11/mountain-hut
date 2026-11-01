export interface TableSetup {
  tableId: number;
  seats: number;
}

// A saved set of tables and seats returned by GET /slots/configurations
export interface SlotConfiguration {
  id: number;
  date: string | null;
  tables: TableSetup[];
  totalSeats: number;
}

// Exactly one of the two is sent to POST /slots
export type ConfigurationChoice =
  | { configurationId: number }
  | { configuration: { tables: TableSetup[] } };

export type CreateSlotPayload = {
  date: string;
  startTime: string;
  endTime: string;
} & ConfigurationChoice;

export interface CreatedSlot {
  id: number | null;
  date: string;
  startTime: string;
  endTime: string;
  tables: TableSetup[];
  totalSeats: number;
}

// Table row as typed in the form (strings, so the field can be empty while editing)
export interface TableRow {
  key: number;
  tableId: string;
  seats: string;
}

export type SetupMode = 'previous' | 'new';
