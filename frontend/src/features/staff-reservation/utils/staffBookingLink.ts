// The staff version of the link that "Check availability" hands over to the booking page:
//   /staff/reserve?date=2026-11-20&slot=12:00&partySize=3
// The page reads it with the same parseBookingPrefill as the hiker's booking page.
export function buildStaffReservationLink(choice: { date: string; slot: string; partySize: number }): string {
  const params = new URLSearchParams({
    date: choice.date,
    slot: choice.slot,
    partySize: String(choice.partySize),
  });
  return `/staff/reserve?${params.toString()}`;
}