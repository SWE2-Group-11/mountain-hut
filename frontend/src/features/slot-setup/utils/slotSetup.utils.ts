import type { SlotConfiguration, TableRow, TableSetup } from '../types/slotSetup.types';

export const formatLocalDate = (d: Date): string => {
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
};

const toMinutes = (time: string): number => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

export const durationMinutes = (start: string, end: string): number =>
  toMinutes(end) - toMinutes(start);

export const formatDuration = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h} h ${m} min`;
  return h ? `${h} h` : `${m} min`;
};

export const sumSeats = (tables: TableSetup[]): number =>
  tables.reduce((total, t) => total + t.seats, 0);

const isPositiveInt = (value: string): boolean => /^[1-9]\d*$/.test(value.trim());

/** Returns an error message, or null when the time interval is valid. */
export const validateTimes = (start: string, end: string): string | null => {
  if (!start || !end) return 'Choose a start and an end time.';
  if (durationMinutes(start, end) <= 0) return 'The end time must be after the start time.';
  return null;
};

/** True when two intervals of the same day share some time (touching ends are fine). */
export const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string): boolean =>
  toMinutes(aStart) < toMinutes(bEnd) && toMinutes(bStart) < toMinutes(aEnd);

/** Validates the rows typed by the employee; returns tables ready to send or an error. */
export const parseTableRows = (
  rows: TableRow[],
): { tables: TableSetup[]; error: null } | { tables: null; error: string } => {
  if (rows.length === 0) return { tables: null, error: 'Add at least one table.' };

  const tables: TableSetup[] = [];
  const seen = new Set<number>();
  for (const [index, row] of rows.entries()) {
    const label = `Row ${index + 1}`;
    if (!isPositiveInt(row.tableNumber)) {
      return { tables: null, error: `${label}: the table number must be a positive whole number.` };
    }
    if (!isPositiveInt(row.seats)) {
      return { tables: null, error: `${label}: the seats must be a positive whole number.` };
    }
    const tableNumber = Number(row.tableNumber);
    if (seen.has(tableNumber)) {
      return { tables: null, error: `Table ${tableNumber} appears more than once.` };
    }
    seen.add(tableNumber);
    tables.push({ tableNumber, seats: Number(row.seats) });
  }
  return { tables, error: null };
};

/** A slot has no id: date + start time identify it (this is also what copyFrom needs). */
export const configKey = (c: { date: string; startTime: string }): string =>
  `${c.date}|${c.startTime}`;

const toInt = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) ? value : null;

/** Reads one item of the server answer; returns null if it does not have the documented shape. */
export const normaliseConfiguration = (raw: unknown): SlotConfiguration | null => {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (
    typeof r.date !== 'string' ||
    typeof r.startTime !== 'string' ||
    typeof r.endTime !== 'string' ||
    !Array.isArray(r.tables)
  ) {
    return null;
  }

  const tables: TableSetup[] = [];
  for (const t of r.tables) {
    const row = t as Record<string, unknown> | null;
    const tableNumber = toInt(row?.tableNumber);
    const seats = toInt(row?.seats);
    if (tableNumber === null || seats === null) return null;
    tables.push({ tableNumber, seats });
  }
  return {
    date: r.date,
    startTime: r.startTime,
    endTime: r.endTime,
    tables,
    totalSeats: toInt(r.totalSeats) ?? sumSeats(tables),
  };
};