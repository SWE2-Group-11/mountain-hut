// A slot of one day with its menu. A slot has no id: date + start time identify it.
export interface DaySlot {
  date: string;
  startTime: string;
  endTime: string;
  totalSeats: number;
  // Markdown, exactly as the employee wrote it; null when the slot has no menu
  menu: string | null;
}