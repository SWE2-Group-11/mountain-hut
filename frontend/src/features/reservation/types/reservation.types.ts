export interface ReservationState {
  selectedDate: Date | null;
  selectedTime: string | null;
  partySize: number;
}

export type ReservationAction =
  | { type: 'SET_DATE'; payload: Date }
  | { type: 'SET_TIME'; payload: string }
  | { type: 'SET_PARTY_SIZE'; payload: number };