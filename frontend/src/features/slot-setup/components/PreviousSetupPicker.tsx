import React from 'react';
import { Check, Pencil, RefreshCw } from 'lucide-react';
import type { SlotConfiguration } from '../types/slotSetup.types';
import { configKey } from '../utils/slotSetup.utils';

interface Props {
  configurations: SlotConfiguration[];
  loading: boolean;
  error: string | null;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onEdit: (config: SlotConfiguration) => void;
  onRetry: () => void;
}

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

export const PreviousSetupPicker: React.FC<Props> = ({
  configurations,
  loading,
  error,
  selectedKey,
  onSelect,
  onEdit,
  onRetry,
}) => {
  if (loading) {
    return (
      <div role="status" className="flex items-center gap-3 py-6 text-xs text-[#5A6865]">
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[#234E39]" />
        Loading previous setups...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-xs text-red-700 space-y-2">
        <p>{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="flex items-center gap-1.5 font-semibold cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Try again
        </button>
      </div>
    );
  }

  if (configurations.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-[#D4CDBA] bg-[#FAF6EE] p-5 text-xs text-[#5A6865]">
        There are no previous setups yet. Define the tables once and they will be available here
        for the next slots.
      </p>
    );
  }

  return (
    <ul className="space-y-3" role="radiogroup" aria-label="Previous setups">
      {configurations.map((config) => {
        const key = configKey(config);
        const selected = key === selectedKey;
        return (
          <li key={key}>
            <div
              className={`rounded-2xl border p-4 transition-colors ${
                selected ? 'border-[#234E39] bg-[#F1F6F2]' : 'border-[#EFEADF] bg-white'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onSelect(key)}
                  className="flex-1 text-left cursor-pointer"
                >
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#1C2826]">
                    {selected && <Check className="w-4 h-4 text-[#234E39]" />}
                    {formatDate(config.date)}
                    <span className="text-xs font-normal text-[#7C8885]">
                      · {config.startTime}-{config.endTime}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[#5A6865]">
                    {config.tables.length} tables · {config.totalSeats} seats
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {config.tables.map((t) => (
                      <span
                        key={t.tableNumber}
                        className="rounded-lg border border-[#EFEADF] bg-[#FAF6EE] px-2 py-0.5 text-[11px] text-[#3C4A47]"
                      >
                        T{t.tableNumber}: {t.seats}
                      </span>
                    ))}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onEdit(config)}
                  className="flex items-center gap-1 text-[11px] font-semibold text-[#D28A54] hover:text-[#b87340] cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit as new
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
};