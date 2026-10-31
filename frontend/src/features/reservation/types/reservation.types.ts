export interface ReservationState {
  selectedDate: Date | null;
  selectedTime: string | null; // "HH:MM", taken from a slot returned by the API
  partySize: number;
}

// GET /slots?date=YYYY-MM-DD
export interface Slot {
  date: string;
  start_time: string;
  duration: number;
  total_seats: number;
  available_seats: number;
}

// POST /reservations response
export interface Seating {
  table_number: number;
  assigned_seats: number;
}

export interface Reservation {
  id: number;
  date: string;
  slot: string;
  partySize: number;
  seatings: Seating[];
}