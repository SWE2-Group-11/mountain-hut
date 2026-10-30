import React from 'react';
import { Users, Plus, Minus } from 'lucide-react';

interface PartySizeStepProps {
  partySize: number;
  onUpdatePartySize: (size: number) => void;
}

export const PartySizeStep: React.FC<PartySizeStepProps> = ({ partySize, onUpdatePartySize }) => {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-7 h-7 rounded-full bg-[#234E39] text-white flex items-center justify-center text-sm font-semibold">
          3
        </div>
        <div className="flex items-center gap-2 text-[#1C2826] font-semibold text-base">
          <Users className="w-4 h-4" />
          <span>Number of people</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center border border-[#EFEADF] bg-white rounded-2xl p-1.5 shadow-sm">
          <button
            onClick={() => onUpdatePartySize(partySize - 1)}
            disabled={partySize <= 1}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-[#FAF6EE] text-[#2C3835] hover:bg-[#EFEADF] disabled:opacity-40 transition-colors"
          >
            <Minus className="w-4 h-4" />
          </button>
          <span className="w-12 text-center font-serif font-bold text-lg text-[#1C2826]">
            {partySize}
          </span>
          <button
            onClick={() => onUpdatePartySize(partySize + 1)}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-[#FAF6EE] text-[#2C3835] hover:bg-[#EFEADF] transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <span className="text-sm font-medium text-[#5A6865]">people</span>
      </div>
    </div>
  );
};