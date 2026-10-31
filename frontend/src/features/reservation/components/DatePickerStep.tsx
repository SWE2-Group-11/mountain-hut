import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';

interface DatePickerStepProps {
  selectedDate: Date | null;
  onSelectDate: (date: Date) => void;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEK_DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export const DatePickerStep: React.FC<DatePickerStepProps> = ({ selectedDate, onSelectDate }) => {
  // Start on the month of the selected date (or the current month)
  const [viewDate, setViewDate] = useState(() => {
    const base = selectedDate ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();

  const handlePrevMonth = () => {
    if (isCurrentMonth) return; // never go back before the current month
    setViewDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(year, month + 1, 1));
  };

  const currentMonthName = `${MONTH_NAMES[month]} ${year}`;

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1));

  const startDayOfWeek = new Date(year, month, 1).getDay();
  const emptyBlanks = Array.from({ length: startDayOfWeek }, (_, i) => i);

  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-7 h-7 rounded-full bg-[#234E39] text-white flex items-center justify-center text-sm font-semibold">
          1
        </div>
        <div className="flex items-center gap-2 text-[#1C2826] font-semibold text-base">
          <CalendarIcon className="w-4 h-4" />
          <span>Date</span>
        </div>
      </div>

      <div className="bg-[#FAF6EE] border border-[#EFEADF] rounded-2xl p-5 shadow-inner">
        <div className="flex items-center justify-between mb-6 px-2">
          <button
            type="button"
            onClick={handlePrevMonth}
            disabled={isCurrentMonth}
            aria-label="Previous month"
            className="p-1.5 hover:bg-[#EFEADF] rounded-full transition-colors text-[#5A6865] cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="font-serif font-bold text-[#1C2826]">{currentMonthName}</span>
          <button
            type="button"
            onClick={handleNextMonth}
            aria-label="Next month"
            className="p-1.5 hover:bg-[#EFEADF] rounded-full transition-colors text-[#5A6865] cursor-pointer"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-7 text-center text-xs font-medium text-[#7C8885] mb-3">
          {WEEK_DAYS.map((day) => (
            <div key={day}>{day}</div>
          ))}
        </div>

        {/* grid-rows-6 and a minimum height keep the layout stable when switching months */}
        <div className="grid grid-cols-7 grid-rows-6 gap-y-1 text-center text-sm min-h-[240px]">
          {emptyBlanks.map((blank) => (
            <div key={`empty-${blank}`} />
          ))}

          {days.map((date) => {
            const isSelected = selectedDate?.toDateString() === date.toDateString();
            const isPast = date < today;
            return (
              <button
                key={date.getTime()}
                type="button"
                disabled={isPast}
                onClick={() => onSelectDate(date)}
                className={`h-10 w-10 mx-auto flex items-center justify-center rounded-xl font-medium transition-all ${
                  isPast
                    ? 'text-[#C9CFCC] cursor-not-allowed'
                    : isSelected
                      ? 'bg-[#D28A54] text-white shadow-md cursor-pointer'
                      : 'text-[#2C3835] hover:bg-[#EFEADF] cursor-pointer'
                }`}
              >
                {date.getDate()}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};