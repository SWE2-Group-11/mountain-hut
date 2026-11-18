
import type { Reservation } from '../../reservation/types/reservation.types';

// A hiker found by GET /accounts
export interface HikerMatch {
  id: number | null; // account id; null for a hiker without an account (a "quick guest")
  bookingId: number | null;
  fullname: string;
  mobile_number: string | null;
  email: string | null;
  hasAccount: boolean;
}

// How the employee says who the reservation is for (the `mode` of the API)
export type HikerMode = 'existing' | 'temporary' | 'registered';

export interface QuickGuestFields {
  fullname: string;
  mobile: string;
}

export interface AccountFields {
  fullname: string;
  mobile: string;
  email: string;
  notes: string;
  emergencyContact: string;
}

export interface HikerForm {
  mode: HikerMode;
  selected: HikerMatch | null; // the hiker picked from the search ("existing")
  quick: QuickGuestFields; // name + optional phone ("temporary")
  account: AccountFields; // full details ("registered")
}

// The answer to POST /reservations made by staff
export interface StaffReservation extends Reservation {
  hikerId: number | null;
  initialPassword?: string; // only when a hiker account was created
}

// Who the reservation was made for, kept to show it on the confirmation
export interface ReservedFor {
  mode: HikerMode;
  name: string;
  detail: string | null; // phone or email, whatever was given
}