import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { TableRow } from '../types/slotSetup.types';
import { sumSeats } from '../utils/slotSetup.utils';

interface Props {
  rows: TableRow[];
  onAdd: () => void;
  onRemove: (key: number) => void;
  onChange: (key: number, field: 'tableNumber' | 'seats', value: string) => void;
}

const inputClass =
  'w-full rounded-xl border border-[#EFEADF] bg-white px-3 py-2 text-sm text-[#1C2826] focus:outline-none focus:ring-2 focus:ring-[#234E39]/30';

export const TableEditor: React.FC<Props> = ({ rows, onAdd, onRemove, onChange }) => {
  const total = sumSeats(
    rows
      .filter((r) => /^[1-9]\d*$/.test(r.seats.trim()))
      .map((r) => ({ tableNumber: 0, seats: Number(r.seats) })),
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_1fr_auto] gap-3 text-[10px] uppercase font-bold tracking-widest text-[#7C8885]">
        <span>Table number</span>
        <span>Seats</span>
        <span className="w-9" />
      </div>

      {rows.map((row, index) => (
        <div key={row.key} className="grid grid-cols-[1fr_1fr_auto] gap-3 items-center">
          <input
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={row.tableNumber}
            onChange={(e) => onChange(row.key, 'tableNumber', e.target.value)}
            aria-label={`Table number, row ${index + 1}`}
            placeholder="e.g. 1"
            className={inputClass}
          />
          <input
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={row.seats}
            onChange={(e) => onChange(row.key, 'seats', e.target.value)}
            aria-label={`Seats, row ${index + 1}`}
            placeholder="e.g. 4"
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => onRemove(row.key)}
            disabled={rows.length === 1}
            aria-label={`Remove row ${index + 1}`}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-[#7C8885] hover:text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[#7C8885] cursor-pointer disabled:cursor-not-allowed"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}

      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-1.5 text-xs font-semibold text-[#234E39] hover:text-[#1C3E2E] cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Add table
        </button>
        <span className="text-xs text-[#5A6865]">
          Total: <strong className="text-[#1C2826]">{total}</strong> seats
        </span>
      </div>
    </div>
  );
};