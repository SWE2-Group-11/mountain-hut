import React, { useState } from 'react';
import type { DaySlot } from '../types/slotMenus.types';
import { ErrorNote } from './ErrorNote';

interface RemoveMenuPanelProps {
  slot: DaySlot;
  // Answers with an error message, or null when the menu was removed
  onConfirm: () => Promise<string | null>;
  onClose: () => void;
}

export const RemoveMenuPanel: React.FC<RemoveMenuPanelProps> = ({ slot, onConfirm, onClose }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setBusy(true);
    setError(null);
    const message = await onConfirm();
    if (message) {
      setError(message);
      setBusy(false);
    }
  };

  return (
    <div
      role="alertdialog"
      aria-label="Remove this menu"
      className="border border-[#F0C9CE] bg-[#FDF3F4] rounded-2xl p-5 space-y-4"
    >
      <div className="space-y-1">
        <h3 className="font-serif font-bold text-lg text-[#1C2826]">Remove this menu?</h3>
        <p className="text-sm text-[#5A6865]">
          The {slot.startTime} - {slot.endTime} slot will have no menu. Other slots are not affected.
        </p>
      </div>

      {error && <ErrorNote message={error} />}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          autoFocus
          onClick={onClose}
          disabled={busy}
          className="px-4 py-2 rounded-xl border border-[#EFEADF] bg-white text-sm font-medium text-[#3C4A47] hover:bg-[#EFE4D2] cursor-pointer disabled:opacity-40"
        >
          Keep menu
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={busy}
          className="px-4 py-2 rounded-xl bg-[#B00020] text-white text-sm font-medium hover:bg-[#8F001A] cursor-pointer disabled:opacity-40"
        >
          {busy ? 'Removing...' : 'Yes, remove menu'}
        </button>
      </div>
    </div>
  );
};