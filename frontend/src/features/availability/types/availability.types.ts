// GET /slots/availability?date=YYYY-MM-DD&slot=HH:mm&partySize=N
export interface AvailableTable {
  tableId: number; // the table number
  assignedSeats: number;
}

export interface AvailabilityResponse {
  available: AvailableTable[]; // [] when the party cannot be accommodated
}

// What the page shows after a check
export type AvailabilityResult =
  | { status: 'available'; tables: AvailableTable[] }
  | { status: 'unavailable' };