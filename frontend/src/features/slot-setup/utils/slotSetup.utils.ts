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
    if (!isPositiveInt(row.tableId)) {
      return { tables: null, error: `${label}: the table number must be a positive whole number.` };
    }
    if (!isPositiveInt(row.seats)) {
      return { tables: null, error: `${label}: the seats must be a positive whole number.` };
    }
    const tableId = Number(row.tableId);
    if (seen.has(tableId)) {
      return { tables: null, error: `Table ${tableId} appears more than once.` };
    }
    seen.add(tableId);
    tables.push({ tableId, seats: Number(row.seats) });
  }
  return { tables, error: null };
};

const toInt = (value: unknown): number | null => {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isInteger(n) ? n : null;
};

/** Reads the server answer defensively: the contract only promises ids, tables and seats. */
export const normaliseConfiguration = (raw: unknown): SlotConfiguration | null => {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const id = toInt(r.id ?? r.configurationId);
  if (id === null || !Array.isArray(r.tables)) return null;

  const tables: TableSetup[] = [];
  for (const t of r.tables) {
    const row = t as Record<string, unknown>;
    const tableId = toInt(row?.tableId ?? row?.table_number);
    const seats = toInt(row?.seats);
    if (tableId === null || seats === null) return null;
    tables.push({ tableId, seats });
  }
  const total = toInt(r.totalSeats ?? r.total_seats);
  return {
    id,
    date: typeof r.date === 'string' ? r.date : null,
    tables,
    totalSeats: total ?? sumSeats(tables),
  };
};
