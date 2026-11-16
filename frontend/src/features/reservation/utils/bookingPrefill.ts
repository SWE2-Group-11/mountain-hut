// What the availability check hands over to the booking page, as URL parameters:
//   /book-table?date=2026-11-20&slot=12:00&partySize=3

export interface BookingPrefill {
  date: Date; // local midnight of the chosen day
  dateKey: string; // the same day as "YYYY-MM-DD"
  slot: string | null; // "HH:MM"
  partySize: number | null;
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const NUMBER_PATTERN = /^\d{1,3}$/;

export function buildBookingLink(choice: { date: string; slot: string; partySize: number }): string {
  const params = new URLSearchParams({
    date: choice.date,
    slot: choice.slot,
    partySize: String(choice.partySize),
  });
  return `/book-table?${params.toString()}`;
}

// The URL can be typed or edited by anyone: every value is checked, and a value
// that makes no sense is ignored, so the form simply opens empty as it always did.
export function parseBookingPrefill(params: URLSearchParams, today: Date): BookingPrefill | null {
  const dateKey = params.get('date') ?? '';
  const match = DATE_PATTERN.exec(dateKey);
  if (!match) return null;

  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  // 2026-02-31 would silently become March 3rd: reject it
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;

  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (date < startOfToday) return null;

  const slotParam = params.get('slot') ?? '';
  const slot = TIME_PATTERN.test(slotParam) ? slotParam : null;

  const sizeParam = params.get('partySize') ?? '';
  const size = NUMBER_PATTERN.test(sizeParam) ? Number(sizeParam) : 0;
  const partySize = size >= 1 ? size : null;

  return { date, dateKey, slot, partySize };
}