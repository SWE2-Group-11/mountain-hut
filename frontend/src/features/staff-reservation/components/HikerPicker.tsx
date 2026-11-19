import React, { useState } from 'react';
import { Search, UserPlus, UserCheck, Loader2 } from 'lucide-react';
import { useHikerSearch } from '../hooks/useHikerSearch';
import { MAX_NOTE_LENGTH, MODE_LABELS, accountErrors, isSelectable } from '../utils/hikerDetails';
import type { AccountFields, HikerForm, HikerMatch, HikerMode, QuickGuestFields } from '../types/staffReservation.types';

interface HikerPickerProps {
  hiker: HikerForm;
  onModeChange: (mode: HikerMode) => void;
  onSelect: (match: HikerMatch | null) => void;
  onQuickChange: (changes: Partial<QuickGuestFields>) => void;
  onAccountChange: (changes: Partial<AccountFields>) => void;
  onStartNew: (mode: 'temporary' | 'registered', fullname: string, mobile?: string) => void;
}

const MODES: HikerMode[] = ['existing', 'temporary', 'registered'];
const inputClass =
  'w-full px-4 py-3 rounded-xl border border-[#D4CDBA] bg-white text-sm text-[#1C2826] focus:outline-none focus:ring-2 focus:ring-[#234E39]/30';
const labelClass = 'block text-xs font-semibold text-[#5A6865] mb-1';

// "Who is the reservation for?": find an existing hiker, add a quick guest or create an account
export const HikerPicker: React.FC<HikerPickerProps> = ({
  hiker,
  onModeChange,
  onSelect,
  onQuickChange,
  onAccountChange,
  onStartNew,
}) => {
  const [text, setText] = useState('');
  const { results, searching, error, noMatch, tooShort } = useHikerSearch(text);
  const errors = accountErrors(hiker.account);
  const [touched, setTouched] = useState<Partial<Record<keyof AccountFields, boolean>>>({});
  const touch = (field: keyof AccountFields) => setTouched((prev) => ({ ...prev, [field]: true }));
  const looksLikeEmail = text.includes('@');
  const looksLikePhone = !looksLikeEmail && /^[+\d][\d\s()+-]*$/.test(text.trim());

  return (
    <section className="space-y-4">
      <div role="tablist" className="grid grid-cols-3 gap-1 bg-[#FAF6EE] p-1 rounded-xl border border-[#EFEADF]">
        {MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={hiker.mode === mode}
            onClick={() => onModeChange(mode)}
            className={`py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              hiker.mode === mode ? 'bg-[#234E39] text-white shadow-sm' : 'text-[#5A6865] hover:bg-white'
            }`}
          >
            {MODE_LABELS[mode]}
          </button>
        ))}
      </div>

      {hiker.mode === 'existing' && (
        <div className="space-y-3">
          {hiker.selected ? (
            <div className="flex items-center justify-between gap-3 bg-[#EAF3EE] border border-[#BBD5C6] rounded-xl px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <UserCheck className="w-5 h-5 text-[#234E39] shrink-0" />
                <div className="min-w-0 text-sm">
                  <div className="font-semibold text-[#1C2826] truncate">{hiker.selected.fullname}</div>
                  <div className="text-xs text-[#5A6865] truncate">
                    {[hiker.selected.mobile_number, hiker.selected.email].filter(Boolean).join(' · ') || 'No contact details'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  onSelect(null);
                  setText('');
                }}
                className="shrink-0 px-3 py-1.5 bg-white border border-[#BBD5C6] rounded-lg text-xs font-medium text-[#234E39] hover:bg-[#F4FAF6] cursor-pointer"
              >
                Change
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="w-4 h-4 text-[#7C8885] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Search by name, phone or email"
                  aria-label="Search hiker"
                  className={`${inputClass} pl-10`}
                />
                {searching && <Loader2 className="w-4 h-4 animate-spin text-[#7C8885] absolute right-3.5 top-1/2 -translate-y-1/2" />}
              </div>

              {tooShort && <p className="text-xs text-[#7C8885]">Keep typing to search.</p>}
              {error && <p role="alert" className="text-xs text-[#B00020]">{error}</p>}
            </>
          )}

          {!hiker.selected && results.length > 0 && (
            <ul className="space-y-2" aria-label="Matching hikers">
              {results.map((match, index) => {
                const selectable = isSelectable(match);
                return (
                  <li
                    key={`${match.id ?? 'guest'}-${match.bookingId ?? index}`}
                    className="flex items-center justify-between gap-3 bg-white border border-[#EFEADF] rounded-xl px-4 py-3"
                  >
                    <div className="min-w-0 text-sm">
                      <div className="font-semibold text-[#1C2826] truncate">{match.fullname}</div>
                      <div className="text-xs text-[#7C8885] truncate">
                        {[match.mobile_number, match.email].filter(Boolean).join(' · ') || 'No contact details'}
                        {!selectable && ' · quick guest, no account'}
                      </div>
                    </div>
                    {selectable ? (
                      <button
                        type="button"
                        onClick={() => onSelect(match)}
                        className="shrink-0 px-3 py-1.5 bg-[#234E39] text-white rounded-lg text-xs font-medium hover:bg-[#1C3E2E] cursor-pointer"
                      >
                        Select
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onStartNew('temporary', match.fullname, match.mobile_number ?? '')}
                        className="shrink-0 px-3 py-1.5 border border-[#234E39] text-[#234E39] rounded-lg text-xs font-medium hover:bg-[#EAF3EE] cursor-pointer"
                      >
                        Use as quick guest
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {noMatch && !hiker.selected && (
            <div className="bg-[#FDF6E3] border border-[#EBD9A8] rounded-xl p-4 space-y-3 text-xs text-[#6B5200]">
              <p>No hiker found. You can add them now:</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onStartNew('temporary', looksLikeEmail || looksLikePhone ? '' : text.trim(), looksLikePhone ? text.trim() : '')}
                  className="px-3 py-2 bg-white border border-[#D4CDBA] rounded-lg font-medium text-[#1C2826] hover:bg-[#FAF6EE] cursor-pointer"
                >
                  Quick guest (name only)
                </button>
                <button
                  type="button"
                  onClick={() => onStartNew('registered', looksLikeEmail || looksLikePhone ? '' : text.trim(), looksLikePhone ? text.trim() : '')}
                  className="px-3 py-2 bg-[#234E39] text-white rounded-lg font-medium hover:bg-[#1C3E2E] inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" /> Create an account
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {hiker.mode === 'temporary' && (
        <div className="space-y-3">
          <p className="text-xs text-[#5A6865]">For someone who just walks in: only a name is needed. No account is created.</p>
          <div>
            <label htmlFor="quick-name" className={labelClass}>Full name</label>
            <input
              id="quick-name"
              value={hiker.quick.fullname}
              onChange={(e) => onQuickChange({ fullname: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="quick-mobile" className={labelClass}>Mobile number (optional)</label>
            <input
              id="quick-mobile"
              type="tel"
              value={hiker.quick.mobile}
              onChange={(e) => onQuickChange({ mobile: e.target.value })}
              className={inputClass}
            />
          </div>
        </div>
      )}

      {hiker.mode === 'registered' && (
        <div className="space-y-3">
          <p className="text-xs text-[#5A6865]">
            An account is created with a generated password. You will see it once after booking: tell it to the hiker, who must change it at first login.
          </p>
          {(
            [
              ['fullname', 'Full name', 'text'],
              ['mobile', 'Mobile number', 'tel'],
              ['email', 'Email', 'email'],
            ] as const
          ).map(([field, label, type]) => (
            <div key={field}>
              <label htmlFor={`acc-${field}`} className={labelClass}>{label}</label>
              <input
                id={`acc-${field}`}
                type={type}
                value={hiker.account[field]}
                onChange={(e) => onAccountChange({ [field]: e.target.value })}
                onBlur={() => touch(field)}
                className={inputClass}
              />
              {touched[field] && errors[field] && <p className="text-xs text-[#B00020] mt-1">{errors[field]}</p>}
            </div>
          ))}
          {(
            [
              ['notes', 'Notes (optional)'],
              ['emergencyContact', 'Emergency contact (optional)'],
            ] as const
          ).map(([field, label]) => (
            <div key={field}>
              <label htmlFor={`acc-${field}`} className={labelClass}>{label}</label>
              <textarea
                id={`acc-${field}`}
                rows={2}
                value={hiker.account[field]}
                onChange={(e) => onAccountChange({ [field]: e.target.value })}
                className={inputClass}
              />
              <div className={`text-right text-[10px] ${errors[field] ? 'text-[#B00020]' : 'text-[#7C8885]'}`}>
                {hiker.account[field].trim().length}/{MAX_NOTE_LENGTH}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};