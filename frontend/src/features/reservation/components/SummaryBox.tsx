import React from 'react';

interface SummaryBoxProps {
  selectedDate: Date | null;
  selectedTime: string | null;
  partySize: number;
  isFormValid: boolean;
  onBookTable: () => void;
}

export const SummaryBox: React.FC<SummaryBoxProps> = ({
  selectedDate,
  selectedTime,
  partySize,
  isFormValid,
  onBookTable,
}) => {
  const formattedDate = selectedDate ? selectedDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  return (
    <div className="bg-[#FAF6EE] border border-dashed border-[#D4CDBA] rounded-2xl p-6 mt-6">
      <h3 className="text-xs font-bold tracking-wider text-[#7C8885] uppercase mb-4">
        Your Reservation
      </h3>
      <div className="grid grid-cols-2 gap-y-4 mb-6 text-sm">
        <div>
          <span className="block text-[#7C8885] text-xs mb-1">Date</span>
          <span className="font-semibold text-[#1C2826]">{formattedDate}</span>
        </div>
        <div>
          <span className="block text-[#7C8885] text-xs mb-1">Time</span>
          <span className="font-semibold text-[#1C2826]">{selectedTime || '—'}</span>
        </div>
        <div>
          <span className="block text-[#7C8885] text-xs mb-1">Party</span>
          <span className="font-semibold text-[#1C2826]">{partySize} people</span>
        </div>
        <div>
          <span className="block text-[#7C8885] text-xs mb-1">Available seats</span>
          <span className="font-semibold text-[#1C2826]">14 available</span>
        </div>
      </div>

      <button
        disabled={!isFormValid}
        onClick={onBookTable}
        className={`w-full py-4 rounded-xl font-medium text-white transition-all shadow-sm ${
          isFormValid
            ? 'bg-[#234E39] hover:bg-[#1C3E2E] cursor-pointer'
            : 'bg-[#9FB2A9] cursor-not-allowed opacity-80'
        }`}
      >
        Book Table
      </button>

      <p className="text-center text-xs text-[#7C8885] mt-3">
        {isFormValid ? 'Ready to confirm your booking.' : 'Select a date, time and number of people to continue.'}
      </p>
    </div>
  );
};