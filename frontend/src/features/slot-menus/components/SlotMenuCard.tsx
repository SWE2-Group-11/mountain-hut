import React from 'react';
import { Clock, Lock, Pencil, Trash2, Users } from 'lucide-react';
import type { DaySlot } from '../types/slotMenus.types';
import { MenuEditor } from './MenuEditor';
import { MenuText } from './MenuText';
import { RemoveMenuPanel } from './RemoveMenuPanel';

export type CardMode = 'edit' | 'remove' | null;

interface SlotMenuCardProps {
  slot: DaySlot;
  started: boolean;
  mode: CardMode;
  // Another slot is being edited: finish or cancel that one first
  blocked: boolean;
  onEdit: () => void;
  onAskRemove: () => void;
  onClose: () => void;
  onSave: (menu: string) => Promise<string | null>;
  onConfirmRemove: () => Promise<string | null>;
}

const chipClass = 'px-3 py-1 rounded-full text-xs font-semibold';

const StatusChip: React.FC<{ started: boolean; hasMenu: boolean }> = ({ started, hasMenu }) => {
  if (started) {
    return (
      <span className={`${chipClass} bg-[#EFEFEF] text-[#5A6865] flex items-center gap-1`}>
        <Lock className="w-3 h-3" /> Started
      </span>
    );
  }
  return hasMenu ? (
    <span className={`${chipClass} bg-[#E3F1E8] text-[#234E39]`}>Menu set</span>
  ) : (
    <span className={`${chipClass} bg-[#FBEFD5] text-[#8A5A00]`}>No menu</span>
  );
};

export const SlotMenuCard: React.FC<SlotMenuCardProps> = ({
  slot,
  started,
  mode,
  blocked,
  onEdit,
  onAskRemove,
  onClose,
  onSave,
  onConfirmRemove,
}) => {
  const time = `${slot.startTime} - ${slot.endTime}`;
  const actionClass =
    'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <li className="bg-white rounded-3xl border border-[#EFEADF] shadow-sm p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-serif font-bold text-[#1C2826] flex items-center gap-2">
            <Clock className="w-5 h-5 text-[#234E39]" />
            {time}
          </h2>
          <p className="text-xs text-[#7C8885] flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> {slot.totalSeats} seats in total
          </p>
        </div>
        <StatusChip started={started} hasMenu={slot.menu !== null} />
      </div>

      {mode !== 'edit' &&
        (slot.menu ? (
          <div className="rounded-2xl bg-[#FAF6EE] px-4 py-3">
            <MenuText text={slot.menu} />
          </div>
        ) : (
          <p className="text-sm text-[#5A6865]">
            {started ? 'This slot had no menu.' : 'Hikers see no menu for this slot yet.'}
          </p>
        ))}

      {started && (
        <p className="text-xs text-[#5A6865]">
          This slot has started: its menu can no longer be changed or removed.
        </p>
      )}

      {!started && mode === null && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onEdit}
            disabled={blocked}
            className={`${actionClass} bg-[#234E39] text-white hover:bg-[#1C3E2E]`}
          >
            <Pencil className="w-4 h-4" />
            {slot.menu ? 'Edit menu' : 'Add menu'}
          </button>
          {slot.menu && (
            <button
              type="button"
              onClick={onAskRemove}
              disabled={blocked}
              className={`${actionClass} bg-white border border-[#B00020] text-[#B00020] hover:bg-[#FDECEC]`}
            >
              <Trash2 className="w-4 h-4" />
              Remove menu
            </button>
          )}
        </div>
      )}

      {mode === 'edit' && <MenuEditor slot={slot} onSave={onSave} onClose={onClose} />}
      {mode === 'remove' && <RemoveMenuPanel slot={slot} onConfirm={onConfirmRemove} onClose={onClose} />}
    </li>
  );
};