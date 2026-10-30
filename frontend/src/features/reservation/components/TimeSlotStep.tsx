import React from 'react';
import { Clock } from 'lucide-react';

interface TimeSlotStepProps {
  selectedDate: Date | null;
  selectedTime: string | null;
  onSelectTime: (time: string) => void;
}

export const TimeSlotStep: React.FC<TimeSlotStepProps> = ({ selectedDate, selectedTime, onSelectTime }) => {
  const availableTimes = ['12:00', '12:30', '13:00', '19:00', '19:30', '20:00'];

  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-7 h-7 rounded-full bg-[#234E39] text-white flex items-center justify-center text-sm font-semibold">
          2
        </div>
        <div className="flex items-center gap-2 text-[#1C2826] font-semibold text-base">
          <Clock className="w-4 h-4" />
          <span>Time</span>
        </div>
      </div>

      {!selectedDate ? (
        <div className="w-full bg-[#FAF6EE] border border-[#EFEADF] rounded-xl p-4 text-[#7C8885] text-sm">
          Pick a date to see available times.
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {availableTimes.map((time) => {
            const isSelected = selectedTime === time;
            return (
              <button
                key={time}
                onClick={() => onSelectTime(time)}
                className={`py-3 px-4 rounded-xl text-sm font-medium border transition-all ${
                  isSelected
                    ? 'bg-[#234E39] text-white border-[#234E39] shadow-sm'
                    : 'bg-white text-[#2C3835] border-[#EFEADF] hover:border-[#234E39]'
                }`}
              >
                {time}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};