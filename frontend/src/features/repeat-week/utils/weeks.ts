import { formatLocalDate } from '../../slot-setup/utils/slotSetup.utils';

export const parseDate = (value: string): Date => new Date(`${value}T00:00:00`);

export const addDays = (d: Date, days: number): Date => {
  const result = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  result.setDate(result.getDate() + days);
  return result;
};

/** The Monday of the week that contains the given day (weeks start on Monday). */
export const mondayOf = (d: Date): Date => addDays(d, -((d.getDay() + 6) % 7));

export interface WeekOption {
  /** Monday of the week, YYYY-MM-DD: this is what the server expects */
  start: string;
  /** "23 Nov - 29 Nov 2026" */
  label: string;
  /** "This week", "Next week" or empty */
  tag: string;
}

const dayMonth = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

const weekdayName = new Intl.DateTimeFormat('en-GB', { weekday: 'long' });

/** "Tuesday" and "24 Nov", to show them on two lines */
export const dayParts = (date: string): { weekday: string; date: string } => ({
  weekday: weekdayName.format(parseDate(date)),
  date: dayMonth.format(parseDate(date)),
});

const monthName = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });

/** "December 2026": the month a week belongs to is the month of its Monday */
export const monthLabel = (weekStart: string): string => monthName.format(parseDate(weekStart));

export const weekLabel = (start: string): string => {
  const monday = parseDate(start);
  const sunday = addDays(monday, 6);
  return `${dayMonth.format(monday)} - ${dayMonth.format(sunday)} ${sunday.getFullYear()}`;
};

/** Weeks from `before` weeks ago to `after` weeks ahead, counting from the week of `today`. */
export const weekOptions = (today: Date, before: number, after: number): WeekOption[] => {
  const thisMonday = mondayOf(today);
  const options: WeekOption[] = [];
  for (let offset = -before; offset <= after; offset++) {
    const start = formatLocalDate(addDays(thisMonday, offset * 7));
    let tag = '';
    if (offset === 0) tag = 'This week';
    else if (offset === 1) tag = 'Next week';
    options.push({ start, label: weekLabel(start), tag });
  }
  return options;
};