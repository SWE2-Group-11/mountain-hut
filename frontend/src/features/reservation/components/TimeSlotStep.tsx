import React from 'react';
import { Clock } from 'lucide-react';
import type { Slot } from '../types/reservation.types';

interface TimeSlotStepProps {
  selectedDate: Date | null;
  selectedTime: string | null;
  slots: Slot[];
  loading: boolean;
  error: string | null;
  onSelectTime: (time: string) => void;
}

export const TimeSlotStep: React.FC<TimeSlotStepProps> = ({
  selectedDate,
  selectedTime,
  slots,
  loading,
  error,
  onSelectTime,
}) => {
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
      ) : loading ? (
        <div className="w-full bg-[#FAF6EE] border border-[#EFEADF] rounded-xl p-4 text-[#7C8885] text-sm">
          Loading available times...
        </div>
      ) : error ? (
        <div role="alert" className="w-full bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          {error}
        </div>
      ) : slots.length === 0 ? (
        <div className="w-full bg-[#FAF6EE] border border-[#EFEADF] rounded-xl p-4 text-[#7C8885] text-sm">
          No tables can be booked for this date. Please choose another day.
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {slots.map((slot) => {
            const isSelected = selectedTime === slot.start_time;
            return (
              <button
                key={slot.start_time}
                type="button"
                onClick={() => onSelectTime(slot.start_time)}
                className={`py-3 px-4 rounded-xl text-sm font-medium border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[#234E39] text-white border-[#234E39] shadow-sm'
                    : 'bg-white text-[#2C3835] border-[#EFEADF] hover:border-[#234E39]'
                }`}
              >
                <span className="block">{slot.start_time}</span>
                <span className={`block text-[10px] ${isSelected ? 'text-gray-200' : 'text-[#7C8885]'}`}>
                  {slot.available_seats} seats left
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};