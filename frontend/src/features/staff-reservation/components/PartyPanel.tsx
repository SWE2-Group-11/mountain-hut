import React from 'react';
import { Minus, Plus } from 'lucide-react';

interface PartyPanelProps {
  partySize: number;
  maxSeats: number; // free seats of the chosen service; 0 until one is chosen
  hasService: boolean;
  onChange: (size: number) => void;
}

const stepButton =
  'w-10 h-10 rounded-xl bg-white border border-[#D4CDBA] flex items-center justify-center text-[#1C2826] hover:bg-[#EFE4D2] disabled:opacity-40 disabled:hover:bg-white transition-colors cursor-pointer disabled:cursor-not-allowed';

export const PartyPanel: React.FC<PartyPanelProps> = ({ partySize, maxSeats, hasService, onChange }) => {
  if (!hasService) {
    return <p className="text-sm text-[#7C8885]">Choose a service first: the party can be as large as its free seats.</p>;
  }
  const quick = Array.from({ length: Math.min(maxSeats, 8) }, (_, i) => i + 1);
  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="flex items-center gap-3">
        <button type="button" className={stepButton} aria-label="Decrease party size" disabled={partySize <= 1} onClick={() => onChange(partySize - 1)}>
          <Minus className="w-4 h-4" />
        </button>
        <div className="min-w-[88px] text-center">
          <div className="text-2xl font-serif font-bold text-[#1C2826] leading-none">{partySize}</div>
          <div className="text-[11px] text-[#7C8885] mt-1">{partySize === 1 ? 'person' : 'people'}</div>
        </div>
        <button type="button" className={stepButton} aria-label="Increase party size" disabled={partySize >= maxSeats} onClick={() => onChange(partySize + 1)}>
          <Plus className="w-4 h-4" />
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick party size">
        {quick.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-pressed={partySize === n}
            className={`w-9 h-9 rounded-lg text-sm border transition-colors cursor-pointer ${
              partySize === n ? 'bg-[#234E39] text-white border-[#234E39]' : 'bg-white border-[#D4CDBA] text-[#2C3835] hover:border-[#234E39]'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      {partySize > maxSeats ? (
        <div role="alert" className="w-full flex flex-wrap items-center gap-3 p-3 bg-[#FDF6E3] border border-[#EBD9A8] rounded-xl text-xs text-[#6B5200]">
          <span>
            Only {maxSeats} {maxSeats === 1 ? 'seat is' : 'seats are'} free in this service, but the party is {partySize}.
          </span>
          {maxSeats > 0 && (
            <button
              type="button"
              onClick={() => onChange(maxSeats)}
              className="px-3 py-1.5 bg-white border border-[#D4CDBA] rounded-lg font-medium text-[#1C2826] cursor-pointer"
            >
              Set the party to {maxSeats}
            </button>
          )}
        </div>
      ) : (
        <p className="text-xs text-[#7C8885] w-full">{maxSeats} seats free in this service.</p>
      )}
    </div>
  );
};