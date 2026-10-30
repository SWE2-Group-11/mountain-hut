import React from 'react';
import { Minus, Plus, Users } from 'lucide-react';

interface PartySizeStepProps {
  partySize: number;
  onUpdatePartySize: (size: number) => void;
  maxSeats: number;
}

export const PartySizeStep: React.FC<PartySizeStepProps> = ({
  partySize,
  onUpdatePartySize,
  maxSeats,

}) => {
  const handleDecrement = () => {
    if (partySize > 1) {
      onUpdatePartySize(partySize - 1);
    }
  };

  const handleIncrement = () => {
    if (partySize < maxSeats) {
      onUpdatePartySize(partySize + 1);
    }
  };

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <label className="text-xs font-bold uppercase tracking-wider text-[#5A6865] flex items-center gap-2">
          <Users className="w-4 h-4 text-[#234E39]" />
          3. Number of People
        </label>

      </div>

      <div className="flex items-center justify-between bg-[#FAF6EE] border border-[#EFEADF] rounded-2xl p-4">
        <div>
          <span className="text-lg font-serif font-bold text-[#1C2826]">
            {partySize} {partySize === 1 ? 'Person' : 'People'}
          </span>
         
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleDecrement}
            disabled={partySize <= 1}
            className="w-10 h-10 rounded-xl bg-white border border-[#EFEADF] flex items-center justify-center text-[#1C2826] hover:bg-[#EFE4D2] disabled:opacity-40 disabled:hover:bg-white transition-colors"
            aria-label="Decrease party size"
          >
            <Minus className="w-4 h-4" />
          </button>

          <span className="w-8 text-center font-bold text-[#1C2826]">
            {partySize}
          </span>

          <button
            type="button"
            onClick={handleIncrement}
            disabled={partySize >= maxSeats}
            className="w-10 h-10 rounded-xl bg-white border border-[#EFEADF] flex items-center justify-center text-[#1C2826] hover:bg-[#EFE4D2] disabled:opacity-40 disabled:hover:bg-white transition-colors"
            aria-label="Increase party size"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};