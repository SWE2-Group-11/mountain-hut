import type { AvailableTable } from '../types/availability.types';

/** "2 + 3 + 1 seats" for three tables, "4 seats" for one. */
export const formatSeatSplit = (tables: AvailableTable[]): string => {
  const total = tables.reduce((sum, t) => sum + t.assignedSeats, 0);
  if (tables.length === 1) return `${total} ${total === 1 ? 'seat' : 'seats'}`;
  return `${tables.map((t) => t.assignedSeats).join(' + ')} seats`;
};

/** "12:00 – 13:00" from a start time and a duration in minutes. */
export const formatTimeRange = (start: string, durationMinutes: number): string => {
  const [h, m] = start.split(':').map(Number);
  const end = h * 60 + m + durationMinutes;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${start} – ${pad(Math.floor(end / 60) % 24)}:${pad(end % 60)}`;
};