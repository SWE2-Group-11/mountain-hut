import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';

interface DatePickerStepProps {
  selectedDate: Date | null;
  onSelectDate: (date: Date) => void;
}

export const DatePickerStep: React.FC<DatePickerStepProps> = ({ selectedDate, onSelectDate }) => {
  const [viewDate, setViewDate] = useState(new Date(2026, 9, 1)); // October 2026

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const handlePrevMonth = () => {
    setViewDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(year, month + 1, 1));
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June', 
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const currentMonthName = `${monthNames[month]} ${year}`;

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1));

  const startDayOfWeek = new Date(year, month, 1).getDay();
  const emptyBlanks = Array.from({ length: startDayOfWeek }, (_, i) => i);

  const weekDays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

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
            onClick={handlePrevMonth}
            className="p-1.5 hover:bg-[#EFEADF] rounded-full transition-colors text-[#5A6865] cursor-pointer"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="font-serif font-bold text-[#1C2826]">{currentMonthName}</span>
          <button 
            onClick={handleNextMonth}
            className="p-1.5 hover:bg-[#EFEADF] rounded-full transition-colors text-[#5A6865] cursor-pointer"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-7 text-center text-xs font-medium text-[#7C8885] mb-3">
          {weekDays.map((day) => (
            <div key={day}>{day}</div>
          ))}
        </div>

        {/* Added grid-rows-6 and a fixed height constraint so switching months never shifts layout height */}
        <div className="grid grid-cols-7 grid-rows-6 gap-y-1 text-center text-sm min-h-[240px]">
          {emptyBlanks.map((_, index) => (
            <div key={`empty-${index}`} />
          ))}

          {days.map((date) => {
            const isSelected = selectedDate?.toDateString() === date.toDateString();
            return (
              <button
                key={date.toISOString()}
                onClick={() => onSelectDate(date)}
                className={`h-10 w-10 mx-auto flex items-center justify-center rounded-xl font-medium transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[#D28A54] text-white shadow-md'
                    : 'text-[#2C3835] hover:bg-[#EFEADF]'
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